const IOAuthTokenRepository = require('../../../core/oauth/interfaces/IOAuthTokenRepository');
const { XeroToken } = require('../../../core/database');

class XeroTokenRepository extends IOAuthTokenRepository {
    async getToken(tenantId) {
        const token = await XeroToken.findOne({ where: { tenant_id: tenantId } });
        if (!token) return null;

        // Calculate expires_at dynamically from updatedAt + the *actual*
        // expires_in Xero returned (saveToken() already persists it below).
        // This used to be hardcoded to a flat 30 minutes regardless of what
        // Xero really granted — if the real token lifetime differs (Xero
        // has granted 60-minute tokens for some apps/environments), that
        // hardcoded assumption would let TokenManager treat an already-
        // expired access token as still valid, so a real API call would
        // fail with a raw 401 before the revocation/reconnect flow ever
        // kicked in. Falls back to 30 minutes only if expires_in is
        // missing/zero (e.g. a legacy row from before this was tracked).
        //
        // Note: the XeroToken model uses `underscored: true` without
        // renaming the timestamp attributes themselves (unlike
        // QuickBooksToken, which explicitly maps createdAt/updatedAt ->
        // created_at/updated_at). That means only the DB column is
        // snake_case here — the JS-side instance property Sequelize
        // exposes is still `updatedAt`, not `updated_at`.
        const expiresInSeconds = token.expires_in > 0 ? token.expires_in : 30 * 60;
        const expiresAt = new Date(token.updatedAt.getTime() + expiresInSeconds * 1000);

        return {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: expiresAt,
            rawToken: token
        };
    }

    async saveToken(tenantId, { accessToken, refreshToken, expiresAt }) {
        const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        const { Op } = require('sequelize');

        // Note: Xero supports multi-tenancy. If multiple tenants are connected under the same
        // session/refresh flow, we must update the token for ALL records sharing the old refresh token.
        const currentToken = await XeroToken.findOne({ where: { tenant_id: tenantId } });
        if (currentToken) {
            // Find all tenants that share this token set
            await XeroToken.update({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: expiresIn
            }, {
                where: { refresh_token: currentToken.refresh_token }
            });

            // Recovering from 'Disconnected' re-activates the connection.
            // A connection that hasn't had its first successful Master Data
            // Pull yet stays 'Not Synced' even though its token was just
            // refreshed — refreshing a token isn't the same as syncing data.
            await XeroToken.update({
                status: 'Active'
            }, {
                where: { refresh_token: refreshToken, status: { [Op.ne]: 'Not Synced' } }
            });
        } else {
            // Fallback for single tenant update
            await XeroToken.update({
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: expiresIn
            }, {
                where: { tenant_id: tenantId }
            });

            await XeroToken.update({
                status: 'Active'
            }, {
                where: { tenant_id: tenantId, status: { [Op.ne]: 'Not Synced' } }
            });
        }
    }

    /**
     * Marks the connection(s) as needing reconnection and wipes the now-
     * unusable credentials — access token, refresh token, and any stored
     * provider session — rather than just flipping the status flag.
     * `access_token`/`refresh_token`/`expires_in` are NOT NULL columns, so
     * they're cleared to an empty string/0 (falsy, same practical effect as
     * null, no schema change needed).
     */
    async markDisconnected(tenantId) {
        const clearedFields = {
            status: 'Disconnected',
            access_token: '',
            refresh_token: '',
            expires_in: 0,
            session_info: null
        };

        const currentToken = await XeroToken.findOne({ where: { tenant_id: tenantId } });
        if (currentToken) {
            // Disconnect all tenants associated with this credential set —
            // they share the same (now-revoked) refresh token.
            await XeroToken.update(clearedFields, {
                where: { refresh_token: currentToken.refresh_token }
            });
        } else {
            await XeroToken.update(clearedFields, { where: { tenant_id: tenantId } });
        }
    }
}

module.exports = XeroTokenRepository;
