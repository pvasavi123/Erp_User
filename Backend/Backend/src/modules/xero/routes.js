'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { validateXeroState } = require('../../core/middleware/oauthMiddleware');
const { authenticate } = require('../auth/auth.middleware');

// OAuth
router.get('/connect',             controller.connectXero);
router.get('/callback',            validateXeroState, controller.xeroCallback);
router.post('/select-companies',   controller.selectCompanies);
router.post('/disconnect',         authenticate, controller.disconnectXero);
router.get(['/tokens', '/tokens/'], authenticate, controller.listXeroTokens);

// Data endpoints
router.get(['/contacts', '/contacts/'],         authenticate, controller.getContacts);
router.get(['/accounts', '/accounts/'],         authenticate, controller.getAccounts);
router.get(['/classes', '/classes/'],           authenticate, controller.getClasses);
router.get(['/locations', '/locations/'],       authenticate, controller.getLocations);
router.get(['/organisation', '/organisation/'], authenticate, controller.getOrganisation);

module.exports = router;