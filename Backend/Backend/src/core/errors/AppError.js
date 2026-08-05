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
            `Your ${provider} session has expired. Please reconnect.`,
            401,
            'ERR_ERP_SESSION_EXPIRED',
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

/** 429 — Plan/rate limit reached. */
class LimitReachedError extends AppError {
    constructor(message = 'You have reached your plan limit.', details = null) {
        super(message, 429, 'ERR_LIMIT_REACHED', details || message);
    }
}

module.exports = {
    AppError,
    ConnectionRefusedError,
    SessionExpiredError,
    ErpSessionExpiredError,
    ValidationError,
    LimitReachedError
};
