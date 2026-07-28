'use strict';

/**
 * Microsoft module routes
 * ----------------------------------------------------------------
 * Legacy/top-level alias for the canonical /api/auth/microsoft/*
 * endpoints, mounted at /api/microsoft by routes/index.js.
 *
 * This exists because the Microsoft Entra ID app registration's
 * redirect URI is already configured (see .env: MICROSOFT_REDIRECT_URI)
 * as http://localhost:8000/api/microsoft/callback, and the frontend
 * taskpane (AuthService.openMicrosoftPopup) opens
 * http://localhost:8000/api/microsoft/connect directly — mirrors the
 * same "canonical + legacy alias" pattern already used for Google
 * (see modules/google/routes.js).
 *
 * All business logic lives in auth.controller.js / auth.service.js;
 * this file only maps HTTP verbs+paths to it.
 * ----------------------------------------------------------------
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../auth/auth.controller');

router.get('/connect',  controller.microsoftConnect);
router.get('/callback', controller.microsoftCallback);

module.exports = router;
