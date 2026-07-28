const { XeroToken, QuickBooksToken } = require('../../core/database');

class XeroTokenRepository {
    static async getLatestToken() {
        return await XeroToken.findOne({ order: [['updated_at', 'DESC']] });
    }

    static async getActiveTokens() {
        return await XeroToken.findAll({ where: { status: 'Active' }, order: [['updated_at', 'DESC']] });
    }

    static async getAllTokens() {
        return await XeroToken.findAll({ order: [['created_at', 'DESC']] });
    }

    static async upsertToken(tokenData) {
        if (!tokenData.tenant_id) return null;

        return await XeroToken.upsert({
            tenant_id:     tokenData.tenant_id,
            access_token:  tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in:    tokenData.expires_in,
            token_type:    tokenData.token_type,
            scope:         tokenData.scope,
            session_info:  tokenData.session_info,
            mail:          tokenData.mail,
            company_name:  tokenData.company_name,
            status:        tokenData.status || 'Active'
        });
    }

    static async clearTokens() {
        return await XeroToken.destroy({ truncate: true, restartIdentity: true });
    }
}

module.exports = XeroTokenRepository;
