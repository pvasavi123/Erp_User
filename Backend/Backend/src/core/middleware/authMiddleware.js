const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Middleware to protect routes with JWT authentication
 */
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        // Bearer Token
        const token = authHeader.split(' ')[1];

        jwt.verify(token, config.JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden: Invalid or expired token"
                });
            }

            req.user = user;
            next();
        });
    } else {
        res.status(401).json({
            success: false,
            message: "Unauthorized: Missing authorization header"
        });
    }
};

module.exports = authenticateJWT;
