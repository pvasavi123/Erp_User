'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { validateXeroState } = require('../../core/middleware/oauthMiddleware');

// OAuth
router.get('/connect',             controller.connectXero);
router.get('/callback',            validateXeroState, controller.xeroCallback);
router.post('/select-companies',   controller.selectCompanies);
router.post('/disconnect',         controller.disconnectXero);
router.get(['/tokens', '/tokens/'], controller.listXeroTokens);

// Data endpoints
router.get(['/contacts', '/contacts/'],         controller.getContacts);
router.get(['/accounts', '/accounts/'],         controller.getAccounts);
router.get(['/classes', '/classes/'],           controller.getClasses);
router.get(['/locations', '/locations/'],       controller.getLocations);
router.get(['/organisation', '/organisation/'], controller.getOrganisation);

module.exports = router;