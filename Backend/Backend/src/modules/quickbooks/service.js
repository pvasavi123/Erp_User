'use strict';

const axios        = require('axios');
const querystring  = require('querystring');
const config       = require('../../core/config');
const CONSTANTS    = require('../../core/constants');
const { encodeBasicAuth } = require('../../core/helpers');
const QuickBooksTokenRepository = require('./repository');
const QuickBooksMapper = require('./mapper');
const logger       = require('../../core/logger');
const QuickBooksTokenManager = require('./oauth/QuickBooksTokenManager');

/**
 * QuickBooksService
 * -----------------------------------------------------------------
 * Responsible for all QuickBooks business logic:
 *   - OAuth token exchange & storage
 *   - Querying the QB API
 *   - Delegating data transformation to QuickBooksMapper
 * -----------------------------------------------------------------
 */
class QuickBooksService {

    /**
     * Exchange the OAuth authorization code for tokens, query CompanyInfo, and persist connection.
     * @param {string} code   - OAuth authorization code
     * @param {string} realmId - QB company ID
     */
    static async exchangeAndSaveToken(code, realmId, sessionInfo, mail) {
        const credentials = encodeBasicAuth(config.QB.CLIENT_ID, config.QB.CLIENT_SECRET);

        const response = await axios.post(
            CONSTANTS.QUICKBOOKS.TOKEN_URL,
            querystring.stringify({
                grant_type:   'authorization_code',
                code,
                redirect_uri: config.QB.REDIRECT_URI
            }),
            {
                headers: {
                    Accept:         'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization:  `Basic ${credentials}`
                }
            }
        );

        const tokenData = response.data;

        // Fetch CompanyInfo using the newly issued access token directly,
        // via a raw request rather than executeQuery/QuickBooksTokenManager.
        // Those look up whatever token is already stored for this realmId,
        // which — on a reconnect — can be a stale/expired one, causing this
        // step to fail with a 401 immediately after a successful exchange.
        let companyName = 'QuickBooks Company';
        try {
            const url = `${CONSTANTS.QUICKBOOKS.BASE_URL}/v3/company/${realmId}/query`;
            const compRes = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/text'
                },
                params: { query: 'SELECT * FROM CompanyInfo' }
            });
            const compInfo = QuickBooksMapper.toCompanyInfo(compRes.data);
            companyName = compInfo ? (compInfo.name || compInfo.legalName || realmId) : 'QuickBooks Company';
        } catch (compErr) {
            logger.warn(`Could not fetch company info directly during OAuth exchange for realm ${realmId}:`, compErr.message);
        }

        await QuickBooksTokenRepository.upsertToken({
            realm_id: realmId,
            access_token: tokenData.access_token || '',
            refresh_token: tokenData.refresh_token || '',
            token_type: tokenData.token_type || '',
            expires_in: tokenData.expires_in || 0,
            x_refresh_token_expires_in: tokenData.x_refresh_token_expires_in || 0,
            session_info: sessionInfo,
            mail: mail,
            company_name: companyName,
            status: 'Active'
        });
    }

    /**
     * Execute a raw QBQL query against the QuickBooks API.
     * @param {string} query - QuickBooks SQL-like query string
     * @param {object} [token] - Specific QuickBooks Token record to use
     * @returns {object} raw API response
     */
    static async executeQuery(query, token) {
        let realmId;
        let accessToken;

        if (token) {
            realmId = token.companyId || token.realm_id;
            try {
                accessToken = await QuickBooksTokenManager.getValidToken(realmId);
            } catch (err) {
                if (token.access_token || token.accessToken) {
                    accessToken = token.access_token || token.accessToken;
                } else {
                    throw err;
                }
            }
        } else {
            const connections = await QuickBooksTokenRepository.getActiveTokens();
            const activeToken = connections[0];
            if (!activeToken) throw new Error('QuickBooks is not connected.');
            realmId = activeToken.companyId || activeToken.realm_id;
            accessToken = await QuickBooksTokenManager.getValidToken(realmId);
        }

        const url = `${CONSTANTS.QUICKBOOKS.BASE_URL}/v3/company/${realmId}/query`;

        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization:  `Bearer ${accessToken}`,
                    Accept:         'application/json',
                    'Content-Type': 'application/text'
                },
                params: { query }
            });
            return response.data;
        } catch (error) {
            logger.error(`Error executing QB query for realm ${realmId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetches every record of `entityName` for a token, paging through
     * STARTPOSITION/MAXRESULTS until QuickBooks returns fewer than
     * `batchSize` records.
     *
     * QuickBooks' query API defaults to only the first 100 records when
     * MAXRESULTS is omitted, and caps MAXRESULTS at 1000 per request, so
     * any entity type with more records than that gets silently truncated
     * unless paged through like this. Returns a QueryResponse-shaped
     * object so existing QuickBooksMapper.toXList() calls work unchanged.
     *
     * @param {string} entityName - QBQL entity name, e.g. "Customer".
     * @param {object} token
     * @param {number} [batchSize=1000] - QuickBooks' MAXRESULTS hard cap.
     * @returns {Promise<{ QueryResponse: Object }>}
     */
    static async queryAll(entityName, token, batchSize = 1000) {
        const allRecords = [];
        let startPosition = 1;

        while (true) {
            const query = `SELECT * FROM ${entityName} STARTPOSITION ${startPosition} MAXRESULTS ${batchSize}`;
            const raw = await QuickBooksService.executeQuery(query, token);
            const batch = raw?.QueryResponse?.[entityName] || [];

            allRecords.push(...batch);

            if (batch.length < batchSize) break;
            startPosition += batchSize;
        }

        return { QueryResponse: { [entityName]: allRecords } };
    }

    /**
     * Fetch company info and return clean CompanyDTO for a specific token or all tokens.
     * @param {object} [token]
     * @returns {CompanyDTO|CompanyDTO[]|null}
     */
    static async getCompanyInfo(token) {
        if (token) {
            try {
                const raw = await QuickBooksService.executeQuery('SELECT * FROM CompanyInfo', token);
                return QuickBooksMapper.toCompanyInfo(raw);
            } catch (err) {
                return null;
            }
        }

        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        if (!tokens || tokens.length === 0) return null;

        const companies = [];
        for (const t of tokens) {
            try {
                const raw = await QuickBooksService.executeQuery('SELECT * FROM CompanyInfo', t);
                const info = QuickBooksMapper.toCompanyInfo(raw);
                if (info) {
                    info.id = t.companyId;
                    companies.push(info);
                }
            } catch (err) {}
        }
        return companies.length === 1 ? companies[0] : companies;
    }

    /**
     * Helper to get company name and ID for tagging records of a specific token.
     * @param {object} token
     * @returns {Promise<{ orgId: string, orgName: string }>}
     */
    static async getCompanyMetadata(token) {
        const company = await QuickBooksService.getCompanyInfo(token).catch(() => null);
        const realmId = token.companyId || token.realm_id;
        const orgId   = company ? (company.id || company.name || realmId) : realmId;
        const orgName = company ? (company.name || company.legalName || company.id || "QuickBooks Company") : "QuickBooks Company";
        return { orgId, orgName };
    }

    /**
     * Fetch all customers and return clean CustomerDTOs across all connected companies.
     * @returns {CustomerDTO[]}
     */
    static async getCustomers() {
        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        let allCustomers = [];

        for (const token of tokens) {
            try {
                const raw = await QuickBooksService.queryAll('Customer', token);
                const list = QuickBooksMapper.toCustomerList(raw);
                const { orgId, orgName } = await QuickBooksService.getCompanyMetadata(token);
                for (const c of list) {
                    c.clientId   = orgName; // Keep clientName & clientId identical
                    c.clientName = orgName;
                    allCustomers.push(c);
                }
            } catch (err) {
                const realmId = token.companyId || token.realm_id;
                logger.error(`Error getting customers for realm ${realmId}:`, err.message);
            }
        }
        return allCustomers;
    }

    /**
     * Fetch all vendors and return clean VendorDTOs across all connected companies.
     * @returns {VendorDTO[]}
     */
    static async getVendors() {
        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        let allVendors = [];

        for (const token of tokens) {
            try {
                const raw = await QuickBooksService.queryAll('Vendor', token);
                const list = QuickBooksMapper.toVendorList(raw);
                const { orgId, orgName } = await QuickBooksService.getCompanyMetadata(token);
                for (const v of list) {
                    v.clientId   = orgName; // Keep clientName & clientId identical
                    v.clientName = orgName;
                    allVendors.push(v);
                }
            } catch (err) {
                const realmId = token.companyId || token.realm_id;
                logger.error(`Error getting vendors for realm ${realmId}:`, err.message);
            }
        }
        return allVendors;
    }

    /**
     * Fetch all accounts and return clean AccountDTOs across all connected companies.
     * @returns {AccountDTO[]}
     */
    static async getAccounts() {
        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        let allAccounts = [];

        for (const token of tokens) {
            try {
                const raw = await QuickBooksService.queryAll('Account', token);
                const list = QuickBooksMapper.toAccountList(raw);
                const { orgId, orgName } = await QuickBooksService.getCompanyMetadata(token);
                for (const a of list) {
                    a.clientId   = orgName; // Keep clientName & clientId identical
                    a.clientName = orgName;
                    allAccounts.push(a);
                }
            } catch (err) {
                const realmId = token.companyId || token.realm_id;
                logger.error(`Error getting accounts for realm ${realmId}:`, err.message);
            }
        }
        return allAccounts;
    }

    /**
     * Fetch all classes and return clean ClassDTOs across all connected companies.
     * @returns {ClassDTO[]}
     */
    static async getClasses() {
        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        let allClasses = [];

        for (const token of tokens) {
            try {
                const raw = await QuickBooksService.queryAll('Class', token);
                const list = QuickBooksMapper.toClassList(raw);
                const { orgId, orgName } = await QuickBooksService.getCompanyMetadata(token);
                for (const c of list) {
                    c.clientId   = orgName; // Keep clientName & clientId identical
                    c.clientName = orgName;
                    allClasses.push(c);
                }
            } catch (err) {
                const realmId = token.companyId || token.realm_id;
                logger.error(`Error getting classes for realm ${realmId}:`, err.message);
            }
        }
        return allClasses;
    }

    /**
     * Fetch all locations (departments) and return clean LocationDTOs across all connected companies.
     * @returns {LocationDTO[]}
     */
    static async getLocations() {
        const tokens = await QuickBooksTokenRepository.getActiveTokens();
        let allLocations = [];

        for (const token of tokens) {
            try {
                const raw = await QuickBooksService.queryAll('Department', token);
                const list = QuickBooksMapper.toLocationList(raw);
                const { orgId, orgName } = await QuickBooksService.getCompanyMetadata(token);
                for (const l of list) {
                    l.clientId   = orgName; // Keep clientName & clientId identical
                    l.clientName = orgName;
                    allLocations.push(l);
                }
            } catch (err) {
                const realmId = token.companyId || token.realm_id;
                logger.error(`Error getting departments for realm ${realmId}:`, err.message);
            }
        }
        return allLocations;
    }

    // ── Self-contained Connections Management & Pulling ────────────────

    static PLAN_LIMITS = { basic: 1, standard: 3, pro: 10 };

    static getMaxConnections(plan) {
        return QuickBooksService.PLAN_LIMITS[(plan || 'pro').toLowerCase()] ?? 10;
    }

    static async listConnections(mail) {
        const { QuickBooksToken } = require('../../core/database');
        const qbWhere = mail ? { mail } : {};
        const qbTokens = await QuickBooksToken.findAll({ where: qbWhere });

        return qbTokens.map(t => ({
            platform:     'QuickBooks',
            companyName:  t.company_name || 'QuickBooks Company',
            companyId:    t.realm_id,
            status:       t.status || 'Active',
            lastSyncedAt: t.last_synced_at || t.updated_at || null,
            createdAt:    t.created_at || null
        }));
    }

    static async getConnectionStats(mail, plan) {
        const { QuickBooksToken } = require('../../core/database');
        const { Op } = require('sequelize');
        const maxAllowed = QuickBooksService.getMaxConnections(plan);

        const whereClause = { status: { [Op.ne]: 'Disconnected' } };
        if (mail) whereClause.mail = mail;

        const qbCount = await QuickBooksToken.count({ where: whereClause });

        return {
            plan: (plan || 'pro').toLowerCase(),
            maxAllowed,
            connected: qbCount,
            remaining: Math.max(0, maxAllowed - qbCount)
        };
    }

    static async disconnectConnection(companyId) {
        const { QuickBooksToken } = require('../../core/database');
        const [updated] = await QuickBooksToken.update(
            { status: 'Disconnected' },
            { where: { realm_id: companyId } }
        );
        return updated > 0;
    }

    static async activateConnection(companyId) {
        const { QuickBooksToken } = require('../../core/database');
        const [updated] = await QuickBooksToken.update(
            { status: 'Active' },
            { where: { realm_id: companyId } }
        );
        return updated > 0;
    }

    static async renameConnection(companyId, companyName) {
        const { QuickBooksToken } = require('../../core/database');
        const [updated] = await QuickBooksToken.update(
            { company_name: companyName },
            { where: { realm_id: companyId } }
        );
        return updated > 0;
    }

    static async pullMasterData(companyId, tier) {
        const { QuickBooksToken } = require('../../core/database');
        const maxAllowed = QuickBooksService.getMaxConnections(tier);

        const rawTokens = companyId
            ? await QuickBooksToken.findAll({ where: { realm_id: companyId } })
            : await QuickBooksToken.findAll({ order: [['updated_at', 'DESC']] });

        const tokens = rawTokens.slice(0, maxAllowed).map(t => ({
            platform:     'quickbooks',
            companyId:    t.realm_id,
            companyName:  t.company_name || 'QuickBooks Company',
            accessToken:  t.access_token,
            refreshToken: t.refresh_token,
            realm_id:     t.realm_id,
            access_token: t.access_token
        }));

        const aggregated = { company: [], customers: [], vendors: [], accounts: [], classes: [], locations: [] };

        for (const token of tokens) {
            try {
                const rawComp = await QuickBooksService.executeQuery('SELECT * FROM CompanyInfo', token);
                const comp = QuickBooksMapper.toCompanyInfo(rawComp);
                if (comp) {
                    comp.id = token.companyId;
                    aggregated.company.push(comp);
                }

                const [rawCust, rawVend, rawAcc, rawClass, rawLoc] = await Promise.all([
                    QuickBooksService.queryAll('Customer', token),
                    QuickBooksService.queryAll('Vendor', token),
                    QuickBooksService.queryAll('Account', token),
                    QuickBooksService.queryAll('Class', token),
                    QuickBooksService.queryAll('Department', token)
                ]);

                const orgName = comp?.name || comp?.legalName || token.companyName;
                const tag = (list) => list.map(i => ({ ...i, clientId: orgName, clientName: orgName }));

                aggregated.customers.push(...tag(QuickBooksMapper.toCustomerList(rawCust)));
                aggregated.vendors.push(...tag(QuickBooksMapper.toVendorList(rawVend)));
                aggregated.accounts.push(...tag(QuickBooksMapper.toAccountList(rawAcc)));
                aggregated.classes.push(...tag(QuickBooksMapper.toClassList(rawClass)));
                aggregated.locations.push(...tag(QuickBooksMapper.toLocationList(rawLoc)));

                await QuickBooksToken.update(
                    { last_synced_at: new Date(), status: 'Active' },
                    { where: { realm_id: token.companyId } }
                );
            } catch (err) {
                logger.error(`Error pulling QB data for connection ${token.companyId}:`, err.message);

                const isTokenError = err.response?.status === 401
                    || err.statusCode === 401
                    || (err.message && (err.message.includes('Token expired') || err.message.includes('401') || err.message.includes('grant')));

                if (isTokenError || err.message?.includes('OAuth')) {
                    await QuickBooksToken.update(
                        { status: 'Disconnected' },
                        { where: { realm_id: token.companyId } }
                    );
                    throw new Error(`Your session has expired for company "${token.companyName}". Please reconnect to the company again and continue your process.`);
                }

                throw err;
            }
        }

        return aggregated;
    }
}

// Register event listener for plan downgrades
const eventBus = require('../../core/events');
const { QuickBooksToken } = require('../../core/database');

eventBus.on('user.downgraded', async ({ email }) => {
    try {
        const deletedCount = await QuickBooksToken.destroy({ where: { mail: email } });
        logger.info(`[QuickBooksService] Plan downgrade: cleared ${deletedCount} connections for ${email}`);
    } catch (err) {
        logger.error(`[QuickBooksService] Failed to clear connections on downgrade for ${email}:`, err.message);
    }
});

module.exports = QuickBooksService;
