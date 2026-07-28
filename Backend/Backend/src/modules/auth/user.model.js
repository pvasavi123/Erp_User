const { DataTypes } = require('sequelize');

/**
 * User Model
 * ----------------------------------------------------------------
 * Shared users table used by all authentication providers.
 *
 * provider values: 'local' | 'google'
 * role    values: 'user'  | 'admin'  (defaults to 'user')
 * ----------------------------------------------------------------
 */
module.exports = (sequelize) => {
    return sequelize.define(
        'User',
        {
            id: {
                type:          DataTypes.INTEGER,
                primaryKey:    true,
                autoIncrement: true
            },

            name: {
                type:      DataTypes.STRING(100),
                allowNull: false
            },

            email: {
                type:      DataTypes.STRING(150),
                allowNull: false,
                unique:    true
            },

            // Null for OAuth-only users who never set a local password
            password_hash: {
                type:      DataTypes.STRING,
                allowNull: true
            },

            provider: {
                type:         DataTypes.ENUM('local', 'google'),
                allowNull:    false,
                defaultValue: 'local'
            },

            // Populated for Google OAuth users
            google_id: {
                type:      DataTypes.STRING,
                allowNull: true
            },

            role: {
                type:         DataTypes.STRING(50),
                allowNull:    false,
                defaultValue: 'user'
            },

            is_active: {
                type:         DataTypes.BOOLEAN,
                allowNull:    false,
                defaultValue: true
            },

            plan: {
                type:      DataTypes.STRING(50),
                allowNull: true
            }
        },
        {
            tableName:  'users',
            timestamps: true,
            createdAt:  'created_at',
            updatedAt:  'updated_at'
        }
    );
};
