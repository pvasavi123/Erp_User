'use strict';

const bcrypt         = require('bcrypt');
const UserRepository = require('./user.repository');
const JwtService     = require('./jwt.service');
const GoogleService  = require('./google.service');
const logger         = require('../../core/logger');

/**
 * AuthService
 * ----------------------------------------------------------------
 * Central business-logic layer for all authentication flows:
 *   - Local signup / login
 *   - Google OAuth callback (upsert user, return JWT)
 *
 * Controllers stay thin — they only call methods here and shape
 * the HTTP response.
 * ----------------------------------------------------------------
 */
class AuthService {

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /**
     * Build a safe public DTO from a User model instance.
     * Never exposes password_hash or google_id.
     * @param {object} user - Sequelize User instance
     * @returns {{ id, name, email, role, provider }}
     */
    static _toUserDTO(user) {
        return {
            id:       user.id,
            name:     user.name,
            email:    user.email,
            role:     user.role,
            provider: user.provider,
            plan:     user.plan
        };
    }

    /**
     * Generate a JWT whose payload matches the spec in the plan.
     * @param {object} user - Sequelize User instance
     * @returns {string} signed JWT
     */
    static _buildToken(user) {
        return JwtService.generateToken({
            userId: user.id,
            email:  user.email,
            role:   user.role
        });
    }

    // ----------------------------------------------------------------
    // Local Email / Password
    // ----------------------------------------------------------------

    /**
     * Register a new local (email + password) user.
     *
     * @param {string} name
     * @param {string} email
     * @param {string} password   Plain-text; hashed here before storage.
     * @returns {Promise<{ token: string, user: UserDTO }>}
     * @throws {Error} if email already registered
     */
    static async signup(name, email, password) {
        const normalised = email.toLowerCase().trim();

        const existing = await UserRepository.findByEmail(normalised);
        if (existing) {
            throw new Error('Email already registered');
        }

        const password_hash = await bcrypt.hash(password, 10);

        const user = await UserRepository.create({
            name:          name.trim(),
            email:         normalised,
            password_hash,
            provider:      'local',
            role:          'user'
        });

        return {
            token: AuthService._buildToken(user),
            user:  AuthService._toUserDTO(user)
        };
    }

    /**
     * Authenticate a local user with email and password.
     *
     * @param {string} email
     * @param {string} password   Plain-text password to check.
     * @returns {Promise<{ token: string, user: UserDTO }>}
     * @throws {Error} if credentials are invalid
     */
    static async login(email, password) {
        const normalised = email.toLowerCase().trim();
        const user       = await UserRepository.findByEmail(normalised);

        if (!user) {
            throw new Error('Invalid email or password');
        }

        if (user.provider !== 'local' || !user.password_hash) {
            throw new Error('This account uses Google sign-in. Please use "Continue with Google".');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        return {
            token: AuthService._buildToken(user),
            user:  AuthService._toUserDTO(user)
        };
    }

    // ----------------------------------------------------------------
    // Google OAuth
    // ----------------------------------------------------------------

    /**
     * Return the Google OAuth 2.0 authorisation URL to redirect the
     * browser to.
     * @returns {string}
     */
    static getGoogleAuthUrl() {
        return GoogleService.getAuthUrl();
    }

    /**
     * Handle the Google OAuth callback.
     * - Exchanges the code for tokens.
     * - Fetches the Google profile.
     * - Upserts the user in the database (create if new, update google_id if returning).
     * - Returns the user DTO and JWT.
     *
     * @param {string} code   OAuth2 authorisation code from query string.
     * @returns {Promise<{ token: string, user: UserDTO, isNewUser: boolean }>}
     */
    static async handleGoogleCallback(code) {
        const tokens  = await GoogleService.exchangeCodeForToken(code);
        const profile = await GoogleService.getUserProfile(tokens.access_token);

        const googleId = profile.sub;
        const email    = (profile.email || '').toLowerCase().trim();
        const name     = profile.name  || profile.email || 'User';

        // 1. Try to find by Google ID (fastest, most stable)
        let user = await UserRepository.findByGoogleId(googleId);

        // 2. Fall back to email lookup (handles users who signed up locally first)
        if (!user) {
            user = await UserRepository.findByEmail(email);
        }

        if (user) {
            // Returning user — ensure google_id is persisted if missing
            if (!user.google_id) {
                user = await UserRepository.update(user.id, {
                    google_id: googleId,
                    provider:  'google'
                });
            }
        } else {
            // New user — create account
            user = await UserRepository.create({
                name,
                email,
                provider:  'google',
                google_id: googleId,
                role:      'user'
            });
        }

        const isNewUser = !user.created_at ||
            (new Date() - new Date(user.created_at)) < 5000;

        return {
            token:     AuthService._buildToken(user),
            user:      AuthService._toUserDTO(user),
            isNewUser: user.provider === 'google' && !user.password_hash
        };
    }
}

module.exports = AuthService;
