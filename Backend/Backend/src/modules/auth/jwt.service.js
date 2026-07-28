'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../../core/config');

/**
 * JwtService
 * ----------------------------------------------------------------
 * Centralised JWT utilities used by AuthService and AuthMiddleware.
 * Keeping JWT logic here means the secret and expiry are defined in
 * exactly one place.
 * ----------------------------------------------------------------
 */
class JwtService {

    /**
     * Sign a JWT token with the given payload.
     * @param {{ userId: string|number, email: string, role: string }} payload
     * @returns {string} signed JWT
     */
    static generateToken(payload) {
        return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '24h' });
    }

    /**
     * Verify and decode a JWT token.
     * Throws if the token is invalid or expired.
     * @param {string} token
     * @returns {object} decoded payload
     */
    static verifyToken(token) {
        return jwt.verify(token, config.JWT_SECRET);
    }
}

module.exports = JwtService;
