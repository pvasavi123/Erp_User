const path = require('path');
const dotenv = require('dotenv');

// Attempt loading .env from current directory, package directory, and explicitly configured paths
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

module.exports = {
    PORT: process.env.PORT || 8000,
    SESSION_SECRET: 'finaccural-node-secret',
    JWT_SECRET: process.env.JWT_SECRET || 'jwt-finaccural-secret-key-123',
    DB: {
        HOST: process.env.DB_HOST || 'localhost',
        PORT: process.env.DB_PORT || 3306,
        NAME: process.env.DB_NAME || 'quickbooks_xero',
        USER: process.env.DB_USER || 'root',
        PASSWORD: process.env.DB_PASSWORD || '123456'
    },
    QB: {
        CLIENT_ID: process.env.QB_CLIENT_ID,
        CLIENT_SECRET: process.env.QB_CLIENT_SECRET,
        REDIRECT_URI: process.env.QB_REDIRECT_URI
    },
    XERO: {
        CLIENT_ID: process.env.XERO_CLIENT_ID,
        CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
        REDIRECT_URI: process.env.XERO_REDIRECT_URI,
        SCOPES: process.env.XERO_SCOPES || 'openid profile email offline_access accounting.contacts accounting.settings.read'
    },
    GOOGLE: {
        CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8000/api/auth/google/callback'
    }
};
