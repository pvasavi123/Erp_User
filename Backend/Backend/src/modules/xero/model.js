const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "XeroToken",
    {
      tenant_id: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
      access_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      refresh_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      expires_in: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      token_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      scope: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      session_info: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      mail: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: 'Xero Organisation'
      },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: 'Active'
      },
      last_synced_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
    },
    {
      tableName: "xero_tokens",
      underscored: true,
      timestamps: true,
    }
  );
};