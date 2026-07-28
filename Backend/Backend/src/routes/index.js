const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const CONSTANTS = require('../core/constants');

const authRoutes         = require('../modules/auth/auth.routes');
const subscriptionRoutes = require('../modules/subscription/subscription.routes');
const paymentsRoutes     = require('../modules/payments/payments.routes');
const quickbooksRoutes   = require('../modules/quickbooks/routes');
const xeroRoutes         = require('../modules/xero/routes');
const adminRoutes        = require('../modules/admin/routes');     // legacy — kept for backward compat
const googleRoutes       = require('../modules/google/routes');    // legacy — kept for backward compat
const microsoftRoutes    = require('../modules/microsoft/routes'); // legacy alias — matches registered Entra redirect URI

const { QuickBooksToken, XeroToken } = require('../core/database');
const QuickBooksService = require('../modules/quickbooks/service');
const QuickBooksMapper = require('../modules/quickbooks/mapper');
const XeroService = require('../modules/xero/service');
const XeroMapper = require('../modules/xero/mapper');

// ── Canonical auth endpoint ──────────────────────────────────────────
router.use('/auth',         authRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/payments',     paymentsRoutes);

// ── Business modules ─────────────────────────────────────────────────
router.use('/quickbooks', quickbooksRoutes);
router.use('/xero',       xeroRoutes);

// ── Unified connections & pull routing ──────────────────────────────
router.get('/connections', async (req, res) => {
    try {
        const mail = req.query.mail || req.session?.user_mail || req.session?.admin?.email || req.session?.googleUser?.email || null;
        
        const qbWhere   = {};
        const xeroWhere = {};
        
        if (mail) {
            qbWhere.mail   = mail;
            xeroWhere.mail = mail;
        }

        const qbTokens   = await QuickBooksToken.findAll({ where: qbWhere });
        const xeroTokens = await XeroToken.findAll({ where: xeroWhere });

        const list = [
            ...qbTokens.map(t => ({
                platform:     'QuickBooks',
                companyName:  t.company_name || 'QuickBooks Company',
                companyId:    t.realm_id,
                status:       t.status || 'Active',
                lastSyncedAt: t.last_synced_at || t.updated_at || null,
                createdAt:    t.created_at || null
            })),
            ...xeroTokens.map(t => ({
                platform:     'Xero',
                companyName:  t.company_name || 'Xero Organisation',
                companyId:    t.tenant_id,
                status:       t.status || 'Active',
                lastSyncedAt: t.last_synced_at || t.updated_at || null,
                createdAt:    t.created_at || null
            }))
        ];
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/connections/stats?mail=...&plan=standard
 * Returns per-platform connection counts so the dashboard can display
 * platform-specific "Connected / Max" stats.
 * Plan limit applies independently per platform:
 *   Basic=1, Standard=3, Pro=10 — for EACH of QB and Xero.
 */
router.get('/connections/stats', async (req, res) => {
    try {
        const mail = req.query.mail || req.session?.user_mail || null;
        const plan = (req.query.plan || 'pro').toLowerCase();

        let maxPerPlatform = 10;
        if (plan === 'basic')    maxPerPlatform = 1;
        else if (plan === 'standard') maxPerPlatform = 3;

        const whereClause = mail ? { mail } : {};

        const qbCount   = await QuickBooksToken.count({ where: whereClause });
        const xeroCount = await XeroToken.count({       where: whereClause });

        res.json({
            plan,
            maxPerPlatform,
            quickbooks: {
                connected:  qbCount,
                remaining:  Math.max(0, maxPerPlatform - qbCount)
            },
            xero: {
                connected:  xeroCount,
                remaining:  Math.max(0, maxPerPlatform - xeroCount)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.delete('/connections/:id', async (req, res) => {
    try {
        const companyId = req.params.id;
        const [qbUpdated] = await QuickBooksToken.update(
            { status: 'Disconnected' },
            { where: { realm_id: companyId } }
        );
        const [xeroUpdated] = await XeroToken.update(
            { status: 'Disconnected' },
            { where: { tenant_id: companyId } }
        );
        res.json({ success: qbUpdated > 0 || xeroUpdated > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/connections/:id/activate', async (req, res) => {
    try {
        const companyId = req.params.id;
        const [qbUpdated] = await QuickBooksToken.update(
            { status: 'Active' },
            { where: { realm_id: companyId } }
        );
        const [xeroUpdated] = await XeroToken.update(
            { status: 'Active' },
            { where: { tenant_id: companyId } }
        );
        res.json({ success: qbUpdated > 0 || xeroUpdated > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/connections/:id/rename', async (req, res) => {
    try {
        const companyId = req.params.id;
        const { companyName } = req.body;
        if (!companyName) {
            return res.status(400).json({ error: 'companyName is required' });
        }
        const [qbUpdated] = await QuickBooksToken.update(
            { company_name: companyName },
            { where: { realm_id: companyId } }
        );
        const [xeroUpdated] = await XeroToken.update(
            { company_name: companyName },
            { where: { tenant_id: companyId } }
        );
        res.json({ success: qbUpdated > 0 || xeroUpdated > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/pull-master-data', async (req, res) => {
    try {
        const { companyId, platform, tier } = req.body;
        if (!platform) {
            return res.status(400).json({ error: 'Missing platform.' });
        }

        const normPlatform = platform.toLowerCase();
        const activeTier = (tier || 'pro').toLowerCase();
        
        let maxAllowed = 10;
        if (activeTier === 'basic') maxAllowed = 1;
        else if (activeTier === 'standard') maxAllowed = 3;

        // Retrieve connections to pull
        let tokens = [];
        if (normPlatform === 'quickbooks') {
            const rawTokens = companyId
                ? await QuickBooksToken.findAll({ where: { realm_id: companyId } })
                : await QuickBooksToken.findAll({ order: [['updated_at', 'DESC']] });
            
            tokens = rawTokens.slice(0, maxAllowed).map(t => ({
                platform: 'quickbooks',
                companyId: t.realm_id,
                companyName: t.company_name || 'QuickBooks Company',
                accessToken: t.access_token,
                refreshToken: t.refresh_token,
                realm_id: t.realm_id,
                access_token: t.access_token
            }));
        } else if (normPlatform === 'xero') {
            const rawTokens = companyId
                ? await XeroToken.findAll({ where: { tenant_id: companyId } })
                : await XeroToken.findAll({ where: { status: 'Active' }, order: [['updated_at', 'DESC']] });
            
            tokens = rawTokens.slice(0, maxAllowed).map(t => ({
                platform: 'xero',
                companyId: t.tenant_id,
                companyName: t.company_name || 'Xero Organisation',
                accessToken: t.access_token,
                refreshToken: t.refresh_token,
                tenant_id: t.tenant_id,
                access_token: t.access_token
            }));
        }

        if (tokens.length === 0) {
            return res.status(404).json({ error: `No active connections found for ${platform}.` });
        }

        const aggregated = {
            company: [],
            customers: [],
            vendors: [],
            accounts: [],
            classes: [],
            locations: []
        };

        for (const token of tokens) {
            const currentId = token.companyId;

            if (normPlatform === 'quickbooks') {
                try {
                    const rawComp = await QuickBooksService.executeQuery('SELECT * FROM CompanyInfo', token);
                    const comp = QuickBooksMapper.toCompanyInfo(rawComp);
                    if (comp) {
                        comp.id = currentId;
                        aggregated.company.push(comp);
                    }
                    
                    const rawCust = await QuickBooksService.executeQuery('SELECT * FROM Customer', token);
                    const customers = QuickBooksMapper.toCustomerList(rawCust);
                    
                    const rawVend = await QuickBooksService.executeQuery('SELECT * FROM Vendor', token);
                    const vendors = QuickBooksMapper.toVendorList(rawVend);

                    const rawAcc = await QuickBooksService.executeQuery('SELECT * FROM Account', token);
                    const accounts = QuickBooksMapper.toAccountList(rawAcc);

                    const rawClass = await QuickBooksService.executeQuery('SELECT * FROM Class', token);
                    const classes = QuickBooksMapper.toClassList(rawClass);

                    const rawLoc = await QuickBooksService.executeQuery('SELECT * FROM Department', token);
                    const locations = QuickBooksMapper.toLocationList(rawLoc);

                    const orgName = comp ? (comp.name || comp.legalName || currentId) : 'QuickBooks Company';
                    for (const item of [...customers, ...vendors, ...accounts, ...classes, ...locations]) {
                        item.clientId   = orgName;
                        item.clientName = orgName;
                    }

                    aggregated.customers.push(...customers);
                    aggregated.vendors.push(...vendors);
                    aggregated.accounts.push(...accounts);
                    aggregated.classes.push(...classes);
                    aggregated.locations.push(...locations);

                    // Update last_synced_at in database for QB token
                    await QuickBooksToken.update(
                        { last_synced_at: new Date() },
                        { where: { realm_id: currentId } }
                    );
                } catch (err) {
                    console.error(`Error pulling QB data for connection ${currentId}:`, err.message);
                }
            } else if (normPlatform === 'xero') {
                try {
                    const headers = {
                        Authorization:    `Bearer ${token.accessToken}`,
                        'Xero-Tenant-Id': currentId,
                        Accept:           'application/json'
                    };

                    const xeroGet = async (url) => {
                        try {
                            return await axios.get(url, { headers });
                        } catch (err) {
                            if (err.response && err.response.status === 401) {
                                try {
                                    const credentials = require('../core/helpers').encodeBasicAuth(
                                        require('../core/config').XERO.CLIENT_ID,
                                        require('../core/config').XERO.CLIENT_SECRET
                                    );
                                    const refreshRes = await axios.post(
                                        CONSTANTS.XERO.TOKEN_URL,
                                        new URLSearchParams({
                                            grant_type:    'refresh_token',
                                            refresh_token: token.refreshToken
                                        }),
                                        {
                                            headers: {
                                                Authorization:  `Basic ${credentials}`,
                                                'Content-Type': 'application/x-www-form-urlencoded'
                                            }
                                        }
                                    );
                                    const data = refreshRes.data;
                                    await XeroToken.update(
                                        {
                                            access_token: data.access_token,
                                            refresh_token: data.refresh_token
                                        },
                                        { where: { tenant_id: currentId } }
                                    );
                                    token.accessToken = data.access_token;
                                    token.refreshToken = data.refresh_token;
                                    headers.Authorization = `Bearer ${data.access_token}`;
                                    return await axios.get(url, { headers });
                                } catch (refreshErr) {
                                    console.error("Failed to refresh Xero token:", refreshErr.message);
                                    try {
                                        await XeroToken.update({ status: 'Disconnected' }, { where: { tenant_id: currentId } });
                                    } catch (dbErr) {
                                        console.error(`Failed to mark Xero token as Disconnected for tenant ${currentId}:`, dbErr.message);
                                    }
                                    throw err;
                                }
                            }
                            throw err;
                        }
                    };

                    let orgName = token.companyName || currentId;
                    // Trigger rebuild
                    try {
                        const orgRes = await xeroGet(CONSTANTS.XERO.ORGANISATION_URL);
                        const orgObj = XeroMapper.toOrganisation(orgRes.data);
                        if (orgObj && orgObj.name) orgName = orgObj.name;
                    } catch (_) {}

                    const [compRes, contactRes, accRes, classRes, locRes] = await Promise.all([
                        xeroGet(CONSTANTS.XERO.ORGANISATION_URL).catch(() => null),
                        xeroGet(CONSTANTS.XERO.CONTACTS_URL).catch(() => null),
                        xeroGet(CONSTANTS.XERO.ACCOUNTS_URL).catch(() => null),
                        xeroGet(CONSTANTS.XERO.TRACKING_CATEGORIES_URL).catch(() => null),
                        xeroGet(CONSTANTS.XERO.TRACKING_CATEGORIES_URL).catch(() => null)
                    ]);

                    const company = compRes ? XeroMapper.toOrganisation(compRes.data) : null;
                    if (company) {
                        company.id = currentId;
                        aggregated.company.push(company);
                    }

                    const contacts = contactRes ? XeroMapper.toContactList(contactRes.data) : [];
                    const accounts = accRes ? XeroMapper.toAccountList(accRes.data) : [];
                    const classes = classRes ? XeroMapper.toTrackingList(classRes.data, 'class') : [];
                    const locations = locRes ? XeroMapper.toTrackingList(locRes.data, 'location') : [];

                    for (const item of [...contacts, ...accounts, ...classes, ...locations]) {
                        item.clientId   = orgName;
                        item.clientName = orgName;
                    }

                    const customers = contacts.filter(c => c.isCustomer || !c.isSupplier);
                    const vendors   = contacts.filter(c => c.isSupplier);

                    aggregated.customers.push(...customers);
                    aggregated.vendors.push(...vendors);
                    aggregated.accounts.push(...accounts);
                    aggregated.classes.push(...classes);
                    aggregated.locations.push(...locations);

                    // Update last_synced_at in database for Xero token
                    await XeroToken.update(
                        { last_synced_at: new Date() },
                        { where: { tenant_id: currentId } }
                    );
                } catch (err) {
                    console.error(`Error pulling Xero data for connection ${currentId}:`, err.message);
                }
            }
        }

        // Return first company as object to keep frontend happy if it expects single object
        const responsePayload = {
            company: aggregated.company.length === 1 ? aggregated.company[0] : aggregated.company,
            customers: aggregated.customers,
            vendors: aggregated.vendors,
            accounts: aggregated.accounts,
            classes: aggregated.classes,
            locations: aggregated.locations
        };

        return res.json(responsePayload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Legacy aliases (will be removed once all clients use /api/auth) ──
router.use('/admin',     adminRoutes);
router.use('/google',    googleRoutes);
router.use('/microsoft', microsoftRoutes);

module.exports = router;
