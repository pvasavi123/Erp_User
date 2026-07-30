'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { validateQuickBooksState } = require('../../core/middleware/oauthMiddleware');
const { authenticate } = require('../auth/auth.middleware');

// OAuth
router.get('/connect',    controller.connectQuickbooks);
router.get('/callback',   validateQuickBooksState, controller.quickbooksCallback);
router.post('/disconnect', authenticate, controller.disconnectQuickbooks);
router.get('/tokens/',    authenticate, controller.listQuickbooksTokens);

// Data endpoints
router.get(['/customers', '/customers/'], authenticate, controller.getCustomers);
router.get(['/vendors', '/vendors/'],     authenticate, controller.getVendors);
router.get(['/accounts', '/accounts/'],   authenticate, controller.getAccounts);
router.get(['/classes', '/classes/'],     authenticate, controller.getClasses);
router.get(['/locations', '/locations/'], authenticate, controller.getLocations);
router.get(['/company', '/company/'],     authenticate, controller.getCompanyInfo);
router.get(['/export', '/export/'],       authenticate, controller.exportMasterData);

module.exports = router;
