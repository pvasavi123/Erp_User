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

// `alter: true` makes Sequelize diff every model against the live MySQL
// schema and ALTER the table to match on every single startup. With
// nodemon restarting on every file save, and MySQL's mysql2 driver
// re-issuing `CHANGE COLUMN ... UNIQUE` for any `unique: true` field each
// time (rather than recognizing the constraint already exists), this
// silently piles up a new duplicate unique index per restart until MySQL's
// 64-key-per-table limit is hit and the server refuses to start at all
// (ER_TOO_MANY_KEYS). Only opt into `alter: true` deliberately (e.g. right
// after changing a model) via DB_SYNC_ALTER=true in .env — normal restarts
// should just verify tables exist without altering them.
const shouldAlter = process.env.DB_SYNC_ALTER === 'true';
if (shouldAlter) {
    logger.info('DB_SYNC_ALTER=true — syncing with { alter: true }. Turn this off once your schema is stable.');
}

sequelize.sync({ alter: shouldAlter }).then(() => {
    logger.info("Database synchronized.");
    app.listen(config.PORT, () => {
        logger.info(`Node.js backend running on port ${config.PORT}`);
    });
}).catch(err => {
    logger.error("Unable to connect to the database:", err);
});
