-- Run this once against your quickbooks_xero database to fix
-- "ER_TOO_MANY_KEYS: Too many keys specified; max 64 keys allowed" on `users`.
--
-- Cause: sequelize.sync({ alter: true }) was running on every nodemon
-- restart, and re-issuing `ALTER TABLE users CHANGE email email ... UNIQUE`
-- each time added ANOTHER unique index instead of recognizing the existing
-- one, until MySQL's 64-key-per-table limit was hit. server.js has been
-- fixed so this won't recur (alter now only runs when DB_SYNC_ALTER=true
-- is set in .env) — this script just cleans up the indexes that already
-- piled up.
--
-- How to run:
--   mysql -u root -p quickbooks_xero < fix_duplicate_email_indexes.sql
-- or paste the contents into MySQL Workbench / phpMyAdmin / your client
-- of choice with the `quickbooks_xero` database selected.

USE quickbooks_xero;

-- 1) See how many indexes currently exist on `email` (informational —
--    safe to run on its own first if you want to look before cleaning up).
SELECT INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email';

-- 2) Drop every unique index on `email` except one, whatever they're named
--    and however many there are.
DELIMITER $$
DROP PROCEDURE IF EXISTS drop_dup_email_indexes $$
CREATE PROCEDURE drop_dup_email_indexes()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE idx_name VARCHAR(255);
    DECLARE keep_one INT DEFAULT 0;
    DECLARE cur CURSOR FOR
        SELECT DISTINCT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'email' AND INDEX_NAME <> 'PRIMARY';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO idx_name;
        IF done THEN
            LEAVE read_loop;
        END IF;
        IF keep_one = 0 THEN
            SET keep_one = 1; -- keep the first index we encounter
        ELSE
            SET @sql = CONCAT('ALTER TABLE users DROP INDEX `', idx_name, '`');
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END IF;
    END LOOP;
    CLOSE cur;
END $$
DELIMITER ;

CALL drop_dup_email_indexes();
DROP PROCEDURE drop_dup_email_indexes;

-- 3) Confirm only one index remains on `email`.
SELECT INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email';
