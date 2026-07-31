'use strict';

const axios       = require('axios');
const querystring = require('querystring');
const config      = require('../../core/config');
const CONSTANTS   = require('../../core/constants');
const { encodeBasicAuth } = require('../../core/helpers');
const XeroTokenRepository = require('./repository');
const XeroMapper  = require('./mapper');
const logger      = require('../../core/logger');
const XeroTokenManager = require('./oauth/XeroTokenManager');
const { ErpSessionExpiredError } = require('../../core/errors/AppError');

/** True if an axios error looks like an expired/revoked OAuth grant. */
function isAuthError(err) {
    if (!err) return false;
    if (err.response?.status === 401 || err.response?.status === 403) return true;
    const blob = JSON.stringify(err.response?.data || err.message || '').toLowerCase();
    return blob.includes('invalid_grant') || blob.includes('invalid_token') || blob.includes('unauthorized');
}

/**
 * XeroService
 * -----------------------------------------------------------------
 * Responsible for all Xero business logic:
 *   - OAuth token exchange, refresh & storage
 *   - Calling the Xero API
 *   - Delegating data transformation to XeroMapper
 * -----------------------------------------------------------------
 */
class XeroService {

    /**
     * Exchange the OAuth authorization code for tokens and persist them.
     * @param {string} code - OAuth authorization code
     * @returns {object} tenant object from Xero
     */
    static async exchangeAndSaveToken(code, sessionInfo, mail) {
        const credentials = encodeBasicAuth(config.XERO.CLIENT_ID, config.XERO.CLIENT_SECRET);

        const tokenResponse = await axios.post(
            CONSTANTS.XERO.TOKEN_URL,
            querystring.stringify({
                grant_type:   'authorization_code',
                code,
                redirect_uri: config.XERO.REDIRECT_URI
            }),
            {
                headers: {
                    Authorization:  `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const tokens = tokenResponse.data;

        const tenantResponse = await axios.get(CONSTANTS.XERO.CONNECTIONS_URL, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        const tenants = tenantResponse.data || [];
        if (tenants.length === 0) throw new Error('No Xero organisation connected.');

        // Persist token records for ALL connected organisations/tenants
        for (const tenant of tenants) {
            await XeroTokenRepository.upsertToken({
                tenant_id:    tenant.tenantId,
                access_token: tokens.access_token || '',
                refresh_token: tokens.refresh_token || '',
                expires_in:   tokens.expires_in || 0,
                token_type:   tokens.token_type || '',
                scope:        tokens.scope || '',
                session_info: sessionInfo,
                mail:         mail,
                company_name: tenant.tenantName || 'Xero Organisation',
                status:       'Active'
            });

        }

        return tenants[0];
    }

    /**
     * Exchange the OAuth code for tokens and fetch all available tenants,
     * but do NOT persist anything to the database yet.
     * Returns { tokens, tenants } for the selection step.
     *
     * @param {string} code - OAuth authorization code
     * @returns {{ tokens: object, tenants: Array }} raw Xero response
     */
    static async exchangeTokensOnly(code) {
        const credentials = encodeBasicAuth(config.XERO.CLIENT_ID, config.XERO.CLIENT_SECRET);

        const tokenResponse = await axios.post(
            CONSTANTS.XERO.TOKEN_URL,
            querystring.stringify({
                grant_type:   'authorization_code',
                code,
                redirect_uri: config.XERO.REDIRECT_URI
            }),
            {
                headers: {
                    Authorization:  `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const tokens = tokenResponse.data;

        const tenantResponse = await axios.get(CONSTANTS.XERO.CONNECTIONS_URL, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        const tenants = tenantResponse.data || [];
        return { tokens, tenants };
    }

    /**
     * Persist tokens only for the tenant IDs that the user explicitly selected.
     *
     * @param {string[]} selectedTenantIds  - Tenant IDs chosen by the user
     * @param {object}   tokens             - Raw Xero token object (access_token, refresh_token, …)
     * @param {Array}    allTenants         - Full list of tenants from Xero /connections
     * @param {string}   mail               - User's email
     * @param {string}   sessionInfo        - Serialised session
     */
    static async saveSelectedTenants(selectedTenantIds, tokens, allTenants, mail, sessionInfo) {
        const selectedSet = new Set(selectedTenantIds);
        const toSave = allTenants.filter(t => selectedSet.has(t.tenantId));

        if (toSave.length === 0) throw new Error('No valid tenants selected.');

        for (const tenant of toSave) {
            await XeroTokenRepository.upsertToken({
                tenant_id:     tenant.tenantId,
                access_token:  tokens.access_token  || '',
                refresh_token: tokens.refresh_token || '',
                expires_in:    tokens.expires_in    || 0,
                token_type:    tokens.token_type    || '',
                scope:         tokens.scope         || '',
                session_info:  sessionInfo,
                mail,
                company_name:  tenant.tenantName || 'Xero Organisation',
                status:        'Active'
            });
        }

        return toSave;
    }

    /**
     * Use the stored refresh token to get a new access token.
     * @returns {object} updated token record
     */
    static async refreshAccessToken() {
        const connections = await XeroTokenRepository.getActiveTokens();
        if (!connections || connections.length === 0) throw new Error('Xero is not connected.');

        const token = connections[0];
        const tenantId = token.companyId || token.tenant_id;
        await XeroTokenManager.getValidToken(tenantId);
        return token;
    }

    /**
     * Helper to get list of active tokens for all connected tenants.
     * @returns {Promise<Array>}
     */
    static async getAllTokens() {
        const tokens = await XeroTokenRepository.getActiveTokens();
        if (!tokens || tokens.length === 0) throw new Error('Xero account is not connected.');
        return tokens;
    }

    /**
     * Fetch all organisation details from Xero across all connected tenants.
     * @returns {Promise<Array>}
     */
    static async getOrganisation() {
        const tokens = await XeroService.getAllTokens();
        const orgs = [];

        for (const token of tokens) {
            try {
                const tenantId = token.companyId || token.tenant_id;
                const accessToken = await XeroTokenManager.getValidToken(tenantId);
                const headers = {
                    Authorization:    `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    Accept:           'application/json'
                };
                const res = await axios.get(CONSTANTS.XERO.ORGANISATION_URL, { headers });
                const org = XeroMapper.toOrganisation(res.data);
                if (org) {
                    org.id = tenantId;
                    orgs.push(org);
                }
            } catch (err) {
                const tenantId = token.companyId || token.tenant_id;
                logger.error(`Error fetching Xero organisation for tenant ${tenantId}:`, err.message);
            }
        }
        return orgs.length === 1 ? orgs[0] : orgs;
    }

    /**
     * Fetch all contacts from Xero across all connected tenants.
     * @returns {Promise<ContactDTO[]>}
     */
    static async getContacts() {
        const tokens = await XeroService.getAllTokens();
        let allContacts = [];

        for (const token of tokens) {
            try {
                const tenantId = token.companyId || token.tenant_id;
                const accessToken = await XeroTokenManager.getValidToken(tenantId);
                const headers = {
                    Authorization:    `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    Accept:           'application/json'
                };

                let orgName = token.companyName || tenantId;
                try {
                    const orgRes = await axios.get(CONSTANTS.XERO.ORGANISATION_URL, { headers });
                    const orgObj = XeroMapper.toOrganisation(orgRes.data);
                    if (orgObj && orgObj.name) orgName = orgObj.name;
                } catch (_) {}

                const response = await axios.get(CONSTANTS.XERO.CONTACTS_URL, { headers });
                const contacts = XeroMapper.toContactList(response.data);
                for (const c of contacts) {
                    c.clientId   = tenantId;
                    c.clientName = orgName;
                    allContacts.push(c);
                }
            } catch (err) {
                const tenantId = token.companyId || token.tenant_id;
                logger.error(`Error fetching Xero contacts for tenant ${tenantId}:`, err.message);
            }
        }
        return allContacts;
    }

    /**
     * Fetch all accounts from Xero across all connected tenants.
     * @returns {Promise<AccountDTO[]>}
     */
    static async getAccounts() {
        const tokens = await XeroService.getAllTokens();
        let allAccounts = [];

        for (const token of tokens) {
            try {
                const tenantId = token.companyId || token.tenant_id;
                const accessToken = await XeroTokenManager.getValidToken(tenantId);
                const headers = {
                    Authorization:    `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    Accept:           'application/json'
                };

                let orgName = token.companyName || tenantId;
                try {
                    const orgRes = await axios.get(CONSTANTS.XERO.ORGANISATION_URL, { headers });
                    const orgObj = XeroMapper.toOrganisation(orgRes.data);
                    if (orgObj && orgObj.name) orgName = orgObj.name;
                } catch (_) {}

                const response = await axios.get(CONSTANTS.XERO.ACCOUNTS_URL, { headers });
                const accounts = XeroMapper.toAccountList(response.data);
                for (const a of accounts) {
                    a.clientId   = tenantId;
                    a.clientName = orgName;
                    allAccounts.push(a);
                }
            } catch (err) {
                const tenantId = token.companyId || token.tenant_id;
                logger.error(`Error fetching Xero accounts for tenant ${tenantId}:`, err.message);
            }
        }
        return allAccounts;
    }

    /**
     * Fetch tracking categories for classes from Xero across all connected tenants.
     * @returns {Promise<ClassDTO[]>}
     */
    static async getClasses() {
        const tokens = await XeroService.getAllTokens();
        let allClasses = [];

        for (const token of tokens) {
            try {
                const tenantId = token.companyId || token.tenant_id;
                const accessToken = await XeroTokenManager.getValidToken(tenantId);
                const headers = {
                    Authorization:    `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    Accept:           'application/json'
                };

                let orgName = token.companyName || tenantId;
                try {
                    const orgRes = await axios.get(CONSTANTS.XERO.ORGANISATION_URL, { headers });
                    const orgObj = XeroMapper.toOrganisation(orgRes.data);
                    if (orgObj && orgObj.name) orgName = orgObj.name;
                } catch (_) {}

                const response = await axios.get(CONSTANTS.XERO.TRACKING_CATEGORIES_URL, { headers });
                const classes = XeroMapper.toTrackingList(response.data, "class");
                for (const c of classes) {
                    c.clientId   = tenantId;
                    c.clientName = orgName;
                    allClasses.push(c);
                }
            } catch (err) {
                const tenantId = token.companyId || token.tenant_id;
                logger.error(`Error fetching Xero classes for tenant ${tenantId}:`, err.message);
            }
        }
        return allClasses;
    }

    /**
     * Fetch tracking categories for locations from Xero across all connected tenants.
     * @returns {Promise<LocationDTO[]>}
     */
    static async getLocations() {
        const tokens = await XeroService.getAllTokens();
        let allLocations = [];

        for (const token of tokens) {
            try {
                const tenantId = token.companyId || token.tenant_id;
                const accessToken = await XeroTokenManager.getValidToken(tenantId);
                const headers = {
                    Authorization:    `Bearer ${accessToken}`,
                    'Xero-Tenant-Id': tenantId,
                    Accept:           'application/json'
                };

                let orgName = token.companyName || tenantId;
                try {
                    const orgRes = await axios.get(CONSTANTS.XERO.ORGANISATION_URL, { headers });
                    const orgObj = XeroMapper.toOrganisation(orgRes.data);
                    if (orgObj && orgObj.name) orgName = orgObj.name;
                } catch (_) {}

                const response = await axios.get(CONSTANTS.XERO.TRACKING_CATEGORIES_URL, { headers });
                const locations = XeroMapper.toTrackingList(response.data, "location");
                for (const l of locations) {
                    l.clientId   = tenantId;
                    l.clientName = orgName;
                    allLocations.push(l);
                }
            } catch (err) {
                const tenantId = token.companyId || token.tenant_id;
                logger.error(`Error fetching Xero locations for tenant ${tenantId}:`, err.message);
            }
        }
        return allLocations;
    }

    // ── Self-contained Connections Management & Pulling ────────────────

    static PLAN_LIMITS = { basic: 1, standard: 3, pro: 10 };

    static getMaxConnections(plan) {
        return XeroService.PLAN_LIMITS[(plan || 'pro').toLowerCase()] ?? 10;
    }

    static async listConnections(mail) {
        const { XeroToken } = require('../../core/database');
        const xeroWhere = mail ? { mail } : {};
        const xeroTokens = await XeroToken.findAll({ where: xeroWhere });

        return xeroTokens.map(t => ({
            platform:     'Xero',
            companyName:  t.company_name || 'Xero Organisation',
            companyId:    t.tenant_id,
            status:       t.status || 'Active',
            lastSyncedAt: t.last_synced_at || t.updated_at || null,
            createdAt:    t.created_at || null
        }));
    }

    static async getConnectionStats(mail, plan) {
        const { XeroToken } = require('../../core/database');
        const { Op } = require('sequelize');
        const maxAllowed = XeroService.getMaxConnections(plan);

        const whereClause = { status: { [Op.ne]: 'Disconnected' } };
        if (mail) whereClause.mail = mail;

        const xeroCount = await XeroToken.count({ where: whereClause });

        return {
            plan: (plan || 'pro').toLowerCase(),
            maxAllowed,
            connected: xeroCount,
            remaining: Math.max(0, maxAllowed - xeroCount)
        };
    }

    static async disconnectConnection(companyId) {
        const { XeroToken } = require('../../core/database');
        const [updated] = await XeroToken.update(
            { status: 'Disconnected' },
            { where: { tenant_id: companyId } }
        );
        return updated > 0;
    }

    static async activateConnection(companyId) {
        const { XeroToken } = require('../../core/database');
        const [updated] = await XeroToken.update(
            { status: 'Active' },
            { where: { tenant_id: companyId } }
        );
        return updated > 0;
    }

    static async renameConnection(companyId, companyName) {
        const { XeroToken } = require('../../core/database');
        const [updated] = await XeroToken.update(
            { company_name: companyName },
            { where: { tenant_id: companyId } }
        );
        return updated > 0;
    }

    static async pullMasterData(companyId, tier) {
        const { XeroToken } = require('../../core/database');
        const maxAllowed = XeroService.getMaxConnections(tier);

        const rawTokens = companyId
            ? await XeroToken.findAll({ where: { tenant_id: companyId } })
            : await XeroToken.findAll({ where: { status: 'Active' }, order: [['updated_at', 'DESC']] });

        const tokens = rawTokens.slice(0, maxAllowed).map(t => ({
            platform:     'xero',
            companyId:    t.tenant_id,
            companyName:  t.company_name || 'Xero Organisation',
            accessToken:  t.access_token,
            refreshToken: t.refresh_token,
            tenant_id:    t.tenant_id,
            access_token: t.access_token
        }));

        const aggregated = { company: [], customers: [], vendors: [], accounts: [], classes: [], locations: [] };

        for (const token of tokens) {
            try {
                const headers = {
                    Authorization:    `Bearer ${token.accessToken}`,
                    'Xero-Tenant-Id': token.companyId,
                    Accept:           'application/json'
                };

                const xeroGet = async (url) => {
                    try {
                        return await axios.get(url, { headers });
                    } catch (err) {
                        if (err.response?.status === 401) {
                            const { encodeBasicAuth } = require('../../core/helpers');
                            const config = require('../../core/config');
                            const credentials = encodeBasicAuth(config.XERO.CLIENT_ID, config.XERO.CLIENT_SECRET);

                            let refreshRes;
                            try {
                                refreshRes = await axios.post(
                                    CONSTANTS.XERO.TOKEN_URL,
                                    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refreshToken }),
                                    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
                                );
                            } catch (refreshErr) {
                                // The refresh call itself failing (invalid_grant, etc.)
                                // means the connection is truly dead — tag it so the
                                // outer catch can distinguish this from an unrelated
                                // per-endpoint hiccup and surface ERR_ERP_SESSION_EXPIRED.
                                refreshErr.isXeroAuthFailure = true;
                                throw refreshErr;
                            }

                            token.accessToken  = refreshRes.data.access_token;
                            token.refreshToken = refreshRes.data.refresh_token;
                            headers.Authorization = `Bearer ${token.accessToken}`;

                            await XeroToken.update(
                                { access_token: token.accessToken, refresh_token: token.refreshToken },
                                { where: { tenant_id: token.companyId } }
                            );

                            return axios.get(url, { headers });
                        }
                        throw err;
                    }
                };

                // Fetch organisation first, un-swallowed, so a dead connection
                // (refresh token expired/revoked, OR the backend simply can't
                // reach Xero at all — no internet, DNS failure, Xero outage)
                // surfaces as a real failure instead of silently producing an
                // all-empty "success". The other three calls stay best-effort
                // so one bad endpoint doesn't sink an otherwise-successful pull.
                const orgSettled = await Promise.allSettled([xeroGet(CONSTANTS.XERO.ORGANISATION_URL)]);
                if (orgSettled[0].status === 'rejected') {
                    const reason = orgSettled[0].reason;

                    if (reason?.isXeroAuthFailure || isAuthError(reason)) {
                        await XeroToken.update(
                            { status: 'Disconnected' },
                            { where: { tenant_id: token.companyId } }
                        );
                        throw new ErpSessionExpiredError(
                            'Xero',
                            `Xero refresh token expired/revoked for company "${token.companyName}" (${token.companyId}): ${reason?.message}`
                        );
                    }

                    // Not an auth problem (e.g. ENOTFOUND/ECONNREFUSED/ETIMEDOUT
                    // reaching Xero, or a Xero-side outage) — rethrow so it
                    // reaches the centralized error middleware, which
                    // recognizes raw network error codes and reports
                    // ERR_CONNECTION_REFUSED (503) instead of silently
                    // pretending the pull succeeded with no data. This
                    // mirrors QuickBooksService.pullMasterData's `throw err;`
                    // fallback for the same class of failure.
                    throw reason;
                }
                const orgRes = orgSettled[0].value;

                const [contactRes, accRes, classRes] = await Promise.all([
                    xeroGet(CONSTANTS.XERO.CONTACTS_URL).catch(() => null),
                    xeroGet(CONSTANTS.XERO.ACCOUNTS_URL).catch(() => null),
                    xeroGet(CONSTANTS.XERO.TRACKING_CATEGORIES_URL).catch(() => null)
                ]);

                const company  = orgRes ? XeroMapper.toOrganisation(orgRes.data) : null;
                const orgName  = company?.name || token.companyName;

                if (company) { company.id = token.companyId; aggregated.company.push(company); }

                const contacts  = contactRes ? XeroMapper.toContactList(contactRes.data) : [];
                const accounts  = accRes     ? XeroMapper.toAccountList(accRes.data)     : [];
                const classes   = classRes   ? XeroMapper.toTrackingList(classRes.data, 'class')    : [];
                const locations = classRes   ? XeroMapper.toTrackingList(classRes.data, 'location') : [];

                const tag = items => items.map(i => ({ ...i, clientId: orgName, clientName: orgName }));

                aggregated.customers.push(...tag(contacts.filter(c =>  c.isCustomer || !c.isSupplier)));
                aggregated.vendors.push(  ...tag(contacts.filter(c =>  c.isSupplier)));
                aggregated.accounts.push( ...tag(accounts));
                aggregated.classes.push(  ...tag(classes));
                aggregated.locations.push(...tag(locations));

                await XeroToken.update(
                    { last_synced_at: new Date() },
                    { where: { tenant_id: token.companyId } }
                );
            } catch (err) {
                logger.error(`Error pulling Xero data for connection ${token.companyId}:`, err.message);
                // Propagate (matches QuickBooksService.pullMasterData) so the
                // controller/error middleware sees the real failure — including
                // ErpSessionExpiredError thrown above — instead of silently
                // returning an empty result set.
                throw err;
            }
        }

        return aggregated;
    }
}

// Register event listener for plan downgrades
const eventBus = require('../../core/events');
const { XeroToken } = require('../../core/database');

eventBus.on('user.downgraded', async ({ email }) => {
    try {
        const deletedCount = await XeroToken.destroy({ where: { mail: email } });
        logger.info(`[XeroService] Plan downgrade: cleared ${deletedCount} connections for ${email}`);
    } catch (err) {
        logger.error(`[XeroService] Failed to clear connections on downgrade for ${email}:`, err.message);
    }
});

module.exports = XeroService;