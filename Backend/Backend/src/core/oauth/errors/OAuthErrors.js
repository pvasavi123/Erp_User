class OAuthError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Thrown when the refresh token is invalid, expired, or has been revoked.
 * Signals to the client/frontend that the user MUST re-authenticate.
 */
class OAuthTokenRevokedError extends OAuthError {
    constructor(message = 'OAuth integration disconnected. Re-authentication required.', provider) {
        super(message, 401);
        this.provider = provider;
    }
}

/**
 * Thrown for network failures, provider outages, or transient errors during refresh.
 */
class OAuthTokenRefreshError extends OAuthError {
    constructor(message = 'Failed to refresh OAuth token.', provider, originalError = null) {
        super(message, 502);
        this.provider = provider;
        this.originalError = originalError;
    }
}

module.exports = {
    OAuthError,
    OAuthTokenRevokedError,
    OAuthTokenRefreshError
};
