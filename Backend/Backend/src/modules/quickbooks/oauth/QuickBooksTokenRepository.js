const IOAuthTokenRepository = require('../../../core/oauth/interfaces/IOAuthTokenRepository');
const { QuickBooksToken } = require('../../../core/database');

class QuickBooksTokenRepository extends IOAuthTokenRepository {
    async getToken(realmId) {
        const token = await QuickBooksToken.findOne({ where: { realm_id: realmId } });
        if (!token) return null;

        // Access token expiry: calculated from updatedAt + expires_in seconds
        const expiresAt = new Date(token.updated_at.getTime() + token.expires_in * 1000);

        // Refresh token expiry: QuickBooks refresh tokens live for 100 days.
        // x_refresh_token_expires_in is stored in seconds from when the token was issued.
        // We recalculate from created_at (tokens are re-issued on every refresh).
        let refreshTokenExpiresAt = null;
        if (token.x_refresh_token_expires_in && token.x_refresh_token_expires_in > 0) {
            refreshTokenExpiresAt = new Date(
                token.updated_at.getTime() + token.x_refresh_token_expires_in * 1000
            );
        }

        return {
            accessToken:           token.access_token,
            refreshToken:          token.refresh_token,
            expiresAt:             expiresAt,
            refreshTokenExpiresAt: refreshTokenExpiresAt,
            rawToken:              token
        };
    }

    async saveToken(realmId, { accessToken, refreshToken, expiresAt, refreshTokenExpiresIn }) {
        // Calculate expires_in relative to now
        const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

        const updatePayload = {
            access_token:  accessToken,
            refresh_token: refreshToken,
            expires_in:    expiresIn,
            status:        'Active'
        };

        // Persist the refresh token lifetime when provided by the OAuth response
        if (refreshTokenExpiresIn != null && refreshTokenExpiresIn > 0) {
            updatePayload.x_refresh_token_expires_in = refreshTokenExpiresIn;
        }

        await QuickBooksToken.update(updatePayload, {
            where: { realm_id: realmId }
        });
    }

    async markDisconnected(realmId) {
        await QuickBooksToken.update({
            status: 'Disconnected'
        }, {
            where: { realm_id: realmId }
        });
    }
}

module.exports = QuickBooksTokenRepository;
