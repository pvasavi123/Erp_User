const express = require("express");

const router = express.Router();

const AdminController = require('./controller');
const authenticateJWT = require('../../core/middleware/authMiddleware');

router.post("/login", AdminController.login);
router.post("/signup", AdminController.signup);

router.get("/me", authenticateJWT, (req, res) => {
    res.json({
        success: true,
        admin: req.user
    });
});

module.exports = router;