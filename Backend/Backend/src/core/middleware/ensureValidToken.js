const quickbooksTokenManager = require('../../modules/quickbooks/oauth/QuickBooksTokenManager');
const xeroTokenManager = require('../../modules/xero/oauth/XeroTokenManager');
const { OAuthTokenRevokedError } = require('../oauth/errors/OAuthErrors');
const logger = require('../logger');

/**
 * Express middleware to ensure a valid token exists before reaching route handlers.
 * @param {'quickbooks'|'xero'} provider 
 */
function ensureValidToken(provider) {
    return async (req, res, next) => {
        // Resolve company identifier from request parameter, query, or body
        const accountId = req.params.realmId || req.query.realmId || req.params.tenantId || req.query.tenantId || req.body.accountId;
        
        if (!accountId) {
            return res.status(400).json({ error: `Missing company account identifier (realmId/tenantId) for ${provider}` });
        }

        try {
            let accessToken;
            if (provider === 'quickbooks') {
                accessToken = await quickbooksTokenManager.getValidToken(accountId);
            } else if (provider === 'xero') {
                accessToken = await xeroTokenManager.getValidToken(accountId);
            } else {
                return res.status(400).json({ error: `Unsupported OAuth provider: ${provider}` });
            }

            // Attach valid token to request object for route/service consumption
            req.oauth = {
                provider,
                accountId,
                accessToken
            };
            
            next();
        } catch (error) {
            logger.error(`Error resolving valid token for ${provider} (${accountId}):`, error.message);
            
            if (error instanceof OAuthTokenRevokedError) {
                return res.status(401).json({
                    code: 'OAUTH_DISCONNECTED',
                    error: 'Integration disconnected. Please reconnect your account.',
                    provider: error.provider,
                    accountId: accountId
                });
            }

            // Transient error (timeouts, api down)
            res.status(502).json({
                code: 'OAUTH_REFRESH_FAILED',
                error: 'Failed to access accounting integration. Please try again later.',
                provider: provider
            });
        }
    };
}

module.exports = ensureValidToken;
