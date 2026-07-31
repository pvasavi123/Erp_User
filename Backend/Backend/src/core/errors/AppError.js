'use strict';

/**
 * AppError
 * -----------------------------------------------------------------
 * Base class for every *expected* ("operational") error in the app —
 * i.e. anything we deliberately throw because we already know how to
 * explain it to the user (bad input, expired session, ERP disconnected,
 * unreachable dependency, etc.), as opposed to a genuine bug/crash.
 *
 * Every subclass fills in:
 *   - message    : USER-FACING, friendly. Safe to show in the UI.
 *   - statusCode : proper HTTP status.
 *   - code       : machine-readable string the frontend switches on.
 *   - details    : TECHNICAL text for server logs (and shipped in the
 *                  response body for developer console logging only —
 *                  the frontend must never render `details` to the user).
 *
 * Any new error case should add a small subclass here (or throw
 * `AppError` directly) rather than hand-rolling `res.status().json()`
 * in a controller — that's what keeps error handling centralized.
 * -----------------------------------------------------------------
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'ERR_INTERNAL', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details || message;
        this.isOperational = true; // trusted, expected error — safe to format & return
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 503 — Backend is up, but a downstream dependency (DB, an upstream API,
 * the network itself) refused the connection. Also used by the frontend
 * for the "can't reach the backend at all" case.
 */
class ConnectionRefusedError extends AppError {
    constructor(details = 'Connection refused.') {
        super(
            'Cannot connect to the server. Please try again later.',
            503,
            'ERR_CONNECTION_REFUSED',
            details
        );
    }
}

/**
 * 401 — The app's own JWT session is missing, malformed, or expired.
 */
class SessionExpiredError extends AppError {
    constructor(details = 'JWT verification failed.') {
        super(
            'Your session has expired. Please sign in again.',
            401,
            'ERR_SESSION_EXPIRED',
            details
        );
    }
}

/**
 * 401 — The QuickBooks/Xero OAuth connection is no longer usable
 * (refresh token expired/revoked, or the user disconnected the company).
 * @param {string} [provider] - 'QuickBooks' | 'Xero' | 'ERP'
 */
class ErpSessionExpiredError extends AppError {
    constructor(provider = 'ERP', details = 'OAuth refresh token expired.') {
        super(
            `${provider} connection expired. Please reconnect your company.`,
            401,
            'ERR_ERP_SESSION_EXPIRED',
            details
        );
        this.provider = provider;
    }
}

/**
 * 502 — Transient failure talking to the ERP provider (network blip,
 * provider outage) — NOT a revoked/expired connection, so we don't force
 * the user to reconnect; a retry is reasonable.
 */
class ErpRefreshFailedError extends AppError {
    constructor(provider = 'ERP', details = 'Failed to refresh OAuth token.') {
        super(
            `Could not reach ${provider}. Please try again shortly.`,
            502,
            'ERR_ERP_REFRESH_FAILED',
            details
        );
        this.provider = provider;
    }
}

/** 400 — Malformed / missing request input. */
class ValidationError extends AppError {
    constructor(message = 'Invalid request.', details = null) {
        super(message, 400, 'ERR_VALIDATION', details || message);
    }
}

/** 401 — Bad credentials, not-yet-authenticated. */
class UnauthorizedError extends AppError {
    constructor(message = 'Invalid credentials.', details = null) {
        super(message, 401, 'ERR_UNAUTHORIZED', details || message);
    }
}

/** 403 — Authenticated, but not allowed to do this. */
class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action.', details = null) {
        super(message, 403, 'ERR_FORBIDDEN', details || message);
    }
}

/** 404 — Resource doesn't exist. */
class NotFoundError extends AppError {
    constructor(message = 'The requested resource was not found.', details = null) {
        super(message, 404, 'ERR_NOT_FOUND', details || message);
    }
}

/** 409 — Request conflicts with current state (duplicate email, etc.). */
class ConflictError extends AppError {
    constructor(message = 'This action conflicts with existing data.', details = null) {
        super(message, 409, 'ERR_CONFLICT', details || message);
    }
}

/** 429 — Plan/rate limit reached. */
class LimitReachedError extends AppError {
    constructor(message = 'You have reached your plan limit.', details = null) {
        super(message, 429, 'ERR_LIMIT_REACHED', details || message);
    }
}

/** 500 — Fallback for anything unexpected. Never leaks the real message to the user. */
class InternalServerError extends AppError {
    constructor(details = 'Unexpected server error.') {
        super(
            'Something went wrong on our end. Please try again later.',
            500,
            'ERR_INTERNAL',
            details
        );
    }
}

module.exports = {
    AppError,
    ConnectionRefusedError,
    SessionExpiredError,
    ErpSessionExpiredError,
    ErpRefreshFailedError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    LimitReachedError,
    InternalServerError
};
