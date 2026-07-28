'use strict';

const axios       = require('axios');
const querystring = require('querystring');
const config      = require('../../core/config');
const CONSTANTS   = require('../../core/constants');
const { encodeBasicAuth } = require('../../core/helpers');
const XeroTokenRepository = require('./repository');
const XeroMapper  = require('./mapper');
const logger      = require('../../core/logger');

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
        const credentials = encodeBasicAuth(config.XERO.CLIENT_ID, config.XERO.CLIENT_SECRET);

        const response = await axios.post(
            CONSTANTS.XERO.TOKEN_URL,
            new URLSearchParams({
                grant_type:    'refresh_token',
                refresh_token: token.refresh_token
            }),
            {
                headers: {
                    Authorization:  `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const data = response.data;
        
        // Update all tokens for all tenants with fresh access token
        for (const t of connections) {
            t.access_token  = data.access_token;
            t.refresh_token = data.refresh_token;
            await t.save();
        }

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
                const accessToken = token.accessToken || token.access_token;
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
                const accessToken = token.accessToken || token.access_token;
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
                const accessToken = token.accessToken || token.access_token;
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
                const accessToken = token.accessToken || token.access_token;
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
                const accessToken = token.accessToken || token.access_token;
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
}

module.exports = XeroService;