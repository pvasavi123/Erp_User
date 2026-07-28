'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { validateQuickBooksState } = require('../../core/middleware/oauthMiddleware');

// OAuth
router.get('/connect',    controller.connectQuickbooks);
router.get('/callback',   validateQuickBooksState, controller.quickbooksCallback);
router.post('/disconnect', controller.disconnectQuickbooks);
router.get('/tokens/',    controller.listQuickbooksTokens);

// Data endpoints
router.get(['/customers', '/customers/'], controller.getCustomers);
router.get(['/vendors', '/vendors/'],     controller.getVendors);
router.get(['/accounts', '/accounts/'],   controller.getAccounts);
router.get(['/classes', '/classes/'],     controller.getClasses);
router.get(['/locations', '/locations/'], controller.getLocations);
router.get(['/company', '/company/'],     controller.getCompanyInfo);
router.get(['/export', '/export/'],       controller.exportMasterData);

module.exports = router;
