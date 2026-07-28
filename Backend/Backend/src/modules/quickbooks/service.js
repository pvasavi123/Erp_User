'use strict';

const axios        = require('axios');
const querystring  = require('querystring');
const config       = require('../../core/config');
const CONSTANTS    = require('../../core/constants');
const { encodeBasicAuth } = require('../../core/helpers');
const QuickBooksTokenRepository = require('./repository');
const QuickBooksMapper = require('./mapper');
const logger       = require('../../core/logger');

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

        // Immediately fetch CompanyInfo using the new token
        const tempToken = {
            realm_id: realmId,
            access_token: tokenData.access_token
        };
        const rawComp = await QuickBooksService.executeQuery('SELECT * FROM CompanyInfo', tempToken);
        const compInfo = QuickBooksMapper.toCompanyInfo(rawComp);
        const companyName = compInfo ? (compInfo.name || compInfo.legalName || realmId) : 'QuickBooks Company';

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
        let activeToken = token;
        if (!activeToken) {
            const connections = await QuickBooksTokenRepository.getActiveTokens();
            activeToken = connections[0];
        }
        if (!activeToken) throw new Error('QuickBooks is not connected.');

        const realmId = activeToken.companyId || activeToken.realm_id;
        let accessToken = activeToken.accessToken || activeToken.access_token;
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
            if (error.response && error.response.status === 401) {
                try {
                    const credentials = encodeBasicAuth(config.QB.CLIENT_ID, config.QB.CLIENT_SECRET);
                    const refreshRes = await axios.post(
                        CONSTANTS.QUICKBOOKS.TOKEN_URL,
                        querystring.stringify({
                            grant_type:    'refresh_token',
                            refresh_token: activeToken.refresh_token
                        }),
                        {
                            headers: {
                                Accept:         'application/json',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                Authorization:  `Basic ${credentials}`
                            }
                        }
                    );
                    const tokenData = refreshRes.data;
                    const { QuickBooksToken } = require('../../core/database');
                    await QuickBooksToken.update({
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        expires_in: tokenData.expires_in,
                        x_refresh_token_expires_in: tokenData.x_refresh_token_expires_in
                    }, {
                        where: { realm_id: realmId }
                    });

                    // Update local reference for retrying and subsequent query calls in loop
                    activeToken.access_token = tokenData.access_token;
                    activeToken.refresh_token = tokenData.refresh_token;
                    accessToken = tokenData.access_token;

                    // Retry
                    const retryResponse = await axios.get(url, {
                        headers: {
                            Authorization:  `Bearer ${accessToken}`,
                            Accept:         'application/json',
                            'Content-Type': 'application/text'
                        },
                        params: { query }
                    });
                    return retryResponse.data;
                } catch (refreshErr) {
                    logger.error(`Failed to refresh QB token for realm ${realmId}:`, refreshErr.message);
                    try {
                        const { QuickBooksToken } = require('../../core/database');
                        await QuickBooksToken.update({ status: 'Disconnected' }, { where: { realm_id: realmId } });
                    } catch (dbErr) {
                        logger.error(`Failed to mark QB token as Disconnected for realm ${realmId}:`, dbErr.message);
                    }
                    throw error;
                }
            }
            logger.error(`Error executing QB query for realm ${realmId}:`, error.response?.data || error.message);
            throw error;
        }
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
                const raw = await QuickBooksService.executeQuery('SELECT * FROM Customer', token);
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
                const raw = await QuickBooksService.executeQuery('SELECT * FROM Vendor', token);
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
                const raw = await QuickBooksService.executeQuery('SELECT * FROM Account', token);
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
                const raw = await QuickBooksService.executeQuery('SELECT * FROM Class', token);
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
                const raw = await QuickBooksService.executeQuery('SELECT * FROM Department', token);
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
}

module.exports = QuickBooksService;
