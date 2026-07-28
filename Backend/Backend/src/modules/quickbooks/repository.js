const { QuickBooksToken, XeroToken } = require('../../core/database');

class QuickBooksTokenRepository {
    static async getLatestToken() {
        return await QuickBooksToken.findOne({ order: [['updated_at', 'DESC']] });
    }

    static async getActiveTokens() {
        return await QuickBooksToken.findAll({ where: { status: 'Active' }, order: [['updated_at', 'DESC']] });
    }

    static async getAllTokens() {
        return await QuickBooksToken.findAll({ order: [['created_at', 'DESC']] });
    }

    static async upsertToken(tokenData) {
        return await QuickBooksToken.upsert(tokenData);
    }

    static async clearTokens() {
        return await QuickBooksToken.destroy({ truncate: true, restartIdentity: true });
    }

    static async clearXeroTokens() {
        return await XeroToken.destroy({ where: {} });
    }
}

module.exports = QuickBooksTokenRepository;
