'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./auth.controller');
const { authenticate } = require('./auth.middleware');

/**
 * Auth Routes
 * ----------------------------------------------------------------
 * All endpoints are mounted at /api/auth by routes/index.js
 *
 * Public:
 *   POST /api/auth/signup
 *   POST /api/auth/login
 *   GET  /api/auth/google/connect
 *   GET  /api/auth/google/callback
 *   GET  /api/auth/microsoft/connect
 *   GET  /api/auth/microsoft/callback
 *
 * Protected (JWT required):
 *   GET  /api/auth/me
 * ----------------------------------------------------------------
 */

// Local auth
router.post('/signup', controller.signup);
router.post('/login',  controller.login);

// Google OAuth
router.get('/google/connect',  controller.googleConnect);
router.get('/google/callback', controller.googleCallback);

// Microsoft Entra ID (Azure AD) OAuth
router.get('/microsoft/connect',  controller.microsoftConnect);
router.get('/microsoft/callback', controller.microsoftCallback);

// Protected endpoints
router.get('/me', authenticate, controller.getMe);
router.post('/update-plan', authenticate, controller.updatePlan);

module.exports = router;
