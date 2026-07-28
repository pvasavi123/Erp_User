'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./subscription.controller');
const { authenticate } = require('../auth/auth.middleware');

// POST /api/subscription/upgrade
router.post('/upgrade', authenticate, controller.upgrade);

module.exports = router;
