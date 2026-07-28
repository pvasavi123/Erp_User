'use strict';

const querystring  = require('querystring');
const exceljs      = require('exceljs');
const config       = require('../../core/config');
const CONSTANTS    = require('../../core/constants');
const logger       = require('../../core/logger');
const { generateOAuthState } = require('../../core/helpers');
const QuickBooksService    = require('./service');
const QuickBooksTokenRepository = require('./repository');

/**
 * QuickbooksController
 * -----------------------------------------------------------------
 * Handles all incoming HTTP requests for the QuickBooks module.
 * Delegates all business logic to QuickBooksService.
 * Does NOT contain any data-transformation or mapping logic —
 * that responsibility lives in mapper.js (used by the Service).
 * -----------------------------------------------------------------
 */
class QuickbooksController {

    /**
     * GET /api/quickbooks/connect
     * Generates the QuickBooks OAuth authorization URL and redirects.
     */
    connectQuickbooks = async (req, res) => {
        try {
            const { QuickBooksToken } = require('../../core/database');
            const mail = req.query.mail || req.session?.user_mail || req.session?.admin?.email || req.session?.googleUser?.email || null;
            const { Op } = require('sequelize');
            const whereClause = { status: { [Op.ne]: 'Disconnected' } };
            if (mail) whereClause.mail = mail;
            const qbCount = await QuickBooksToken.count({ where: whereClause });
            const tier = (req.query.tier || 'pro').toLowerCase();

            let maxAllowed = 10;
            if (tier === 'basic') maxAllowed = 1;
            else if (tier === 'standard') maxAllowed = 3;

            if (qbCount >= maxAllowed) {
                return res.send(`
                    <html>
                        <body style="font-family:sans-serif; text-align:center; padding: 40px; background:#fff1f2; color:#9f1239;">
                            <div style="font-size: 50px; margin-bottom: 20px;">⚠️</div>
                            <h2>Connection Limit Reached</h2>
                            <p style="font-size: 14px; color: #4b5563;">Your subscription tier (${tier.toUpperCase()}) allows a maximum of ${maxAllowed} connected company.</p>
                            <p style="font-size: 14px; color: #4b5563;">Please disconnect an existing company or upgrade your plan to connect more.</p>
                            <button onclick="window.close()" style="margin-top: 20px; padding:10px 20px; background:#be123c; color:white; border:none; border-radius:5px; cursor:pointer; font-weight: bold;">Close Window</button>
                        </body>
                    </html>
                `);
            }

            const state = generateOAuthState();
            req.session.oauth_state = state;
            req.session.user_mail = req.query.mail || null;

            const params = {
                client_id:     config.QB.CLIENT_ID,
                response_type: 'code',
                scope:         CONSTANTS.QUICKBOOKS.SCOPES,
                redirect_uri:  config.QB.REDIRECT_URI,
                state
            };

            const authUrl = `${CONSTANTS.QUICKBOOKS.AUTH_URL}?${querystring.stringify(params)}`;
            res.redirect(authUrl);
        } catch (error) {
            logger.error('Error generating QB OAuth URL', error);
            res.status(500).json({ error: 'Failed to generate authorization url' });
        }
    };

    /**
     * GET /api/quickbooks/callback
     * Handles the OAuth callback, exchanges code for tokens.
     */
    quickbooksCallback = async (req, res) => {
        try {
            const { code, realmId } = req.query;
            const mail = req.session?.user_mail || req.session?.admin?.email || req.session?.googleUser?.email || null;
            const sessionInfo = JSON.stringify(req.session || {});
            await QuickBooksService.exchangeAndSaveToken(code, realmId, sessionInfo, mail);
            return res.send(CONSTANTS.QUICKBOOKS.SUCCESS_HTML);
        } catch (error) {
            logger.error('QB OAuth callback failed', error.response?.data || error.message);
            return res.status(400).json({
                error:   'Failed to connect',
                details: error.response?.data || error.message
            });
        }
    };

    /**
     * GET /api/quickbooks/tokens
     * Returns all stored QuickBooks OAuth tokens (for debugging).
     */
    listQuickbooksTokens = async (req, res) => {
        try {
            const tokens = await QuickBooksTokenRepository.getAllTokens();
            res.json({ tokens });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    /**
     * GET /api/quickbooks/customers
     * Returns a list of mapped CustomerDTOs.
     */
    getCustomers = async (req, res) => {
        try {
            const customers = await QuickBooksService.getCustomers();
            res.json({ customers });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/vendors
     * Returns a list of mapped VendorDTOs.
     */
    getVendors = async (req, res) => {
        try {
            const vendors = await QuickBooksService.getVendors();
            res.json({ vendors });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/accounts
     * Returns a list of mapped AccountDTOs.
     */
    getAccounts = async (req, res) => {
        try {
            const accounts = await QuickBooksService.getAccounts();
            res.json({ accounts });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/classes
     * Returns a list of mapped ClassDTOs.
     */
    getClasses = async (req, res) => {
        try {
            const classes = await QuickBooksService.getClasses();
            res.json({ classes });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/locations
     * Returns a list of mapped LocationDTOs.
     */
    getLocations = async (req, res) => {
        try {
            const locations = await QuickBooksService.getLocations();
            res.json({ locations });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/company
     * Returns company information DTO.
     */
    getCompanyInfo = async (req, res) => {
        try {
            const company = await QuickBooksService.getCompanyInfo();
            res.json({ company });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };

    /**
     * GET /api/quickbooks/export
     * Exports company, customers, vendors, accounts, classes, and locations as an Excel file.
     */
    exportMasterData = async (req, res) => {
        try {
            const [company, customers, vendors, accounts, classes, locations] = await Promise.all([
                QuickBooksService.getCompanyInfo().catch(() => null),
                QuickBooksService.getCustomers().catch(() => []),
                QuickBooksService.getVendors().catch(() => []),
                QuickBooksService.getAccounts().catch(() => []),
                QuickBooksService.getClasses().catch(() => []),
                QuickBooksService.getLocations().catch(() => [])
            ]);

            const wb = new exceljs.Workbook();

            if (company) {
                const wsCompany = wb.addWorksheet('Company');
                wsCompany.addRow(['ID', 'Company Name', 'Legal Name']);
                wsCompany.addRow([company.id, company.name, company.legalName]);
            }

            const wsCustomers = wb.addWorksheet('Customers');
            wsCustomers.addRow(['ID', 'Name', 'Company Name', 'Email', 'Balance']);
            for (const c of customers) {
                wsCustomers.addRow([c.id, c.name, c.companyName, c.email, c.balance]);
            }

            const wsVendors = wb.addWorksheet('Vendors');
            wsVendors.addRow(['ID', 'Name', 'Company Name', 'Email', 'Balance']);
            for (const v of vendors) {
                wsVendors.addRow([v.id, v.name, v.companyName, v.email, v.balance]);
            }

            const wsAccounts = wb.addWorksheet('Accounts');
            wsAccounts.addRow(['ID', 'Acct #', 'Name', 'Account Type', 'Sub Type', 'Balance']);
            for (const a of accounts) {
                wsAccounts.addRow([a.id, a.acctNum, a.name, a.accountType, a.accountSubType, a.currentBalance]);
            }

            const wsClasses = wb.addWorksheet('Classes');
            wsClasses.addRow(['ID', 'Name', 'Status']);
            for (const c of classes) {
                wsClasses.addRow([c.id, c.name, c.active]);
            }

            const wsLocations = wb.addWorksheet('Locations');
            wsLocations.addRow(['ID', 'Name', 'Status']);
            for (const l of locations) {
                wsLocations.addRow([l.id, l.name, l.active]);
            }

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="quickbooks_master_data.xlsx"');

            await wb.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    /**
     * POST /api/quickbooks/disconnect
     * Clears all stored QuickBooks tokens.
     */
    disconnectQuickbooks = async (req, res) => {
        try {
            await QuickBooksTokenRepository.clearTokens();
            res.json({ success: true, message: 'QuickBooks tokens cleared successfully.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    };
}

module.exports = new QuickbooksController();
