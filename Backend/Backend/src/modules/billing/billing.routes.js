'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./billing.controller');
const { authenticate } = require('../auth/auth.middleware');

/**
 * Billing Routes
 * ------------------------------------------------------------------
 * Merges the old /api/subscription and /api/payments endpoints.
 *
 * Subscription:
 *   POST /api/subscription/upgrade  — JWT required
 *
 * Payments:
 *   GET  /api/payments/checkout     — public (popup, no JWT)
 *   POST /api/payments/complete     — public (called from checkout popup)
 * ------------------------------------------------------------------
 */

// ── Subscription sub-path ────────────────────────────────────────
router.post('/subscription/upgrade', authenticate, controller.upgrade);

// ── Payments sub-path ────────────────────────────────────────────
router.get('/payments/checkout', authenticate, controller.checkout);
router.post('/payments/complete', authenticate, controller.completePayment);

module.exports = router;
