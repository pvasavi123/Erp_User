const crypto = require('crypto');

exports.generateOAuthState = () => crypto.randomBytes(16).toString('base64url');

exports.encodeBasicAuth = (clientId, clientSecret) => {
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
};
