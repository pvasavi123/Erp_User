const dns = require('dns');

// Force DNS resolution to prefer IPv4 over IPv6. 
// This prevents connection timeouts (ETIMEDOUT) when the host or local network
// resolves IPv6 addresses but cannot route them properly.
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const app = require('./app');
const { sequelize } = require('./core/database');
const config = require('./core/config');
const logger = require('./core/logger');

sequelize.sync({ alter: true }).then(() => {
    logger.info("Database synchronized.");
    app.listen(config.PORT, () => {
        logger.info(`Node.js backend running on port ${config.PORT}`);
    });
}).catch(err => {
    logger.error("Unable to connect to the database:", err);
});
