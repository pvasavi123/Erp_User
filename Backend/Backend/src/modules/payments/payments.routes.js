'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./payments.controller');

/**
 * Payments Routes
 * ----------------------------------------------------------------
 * All endpoints are mounted at /api/payments by routes/index.js
 *
 * Public:
 *   GET  /api/payments/checkout   – renders the standalone checkout page
 * ----------------------------------------------------------------
 */

// Standalone checkout page (opened in a popup from the taskpane)
router.get('/checkout', controller.checkout);
router.post('/complete', controller.completePayment);

module.exports = router;
