'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../auth/auth.controller');
const { authenticate } = require('../auth/auth.middleware');

router.get('/connect', controller.googleConnect);
router.get('/callback', controller.googleCallback);
router.get('/me', authenticate, controller.getMe);

module.exports = router;
