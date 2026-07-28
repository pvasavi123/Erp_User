'use strict';

const AdminService = require('./service');
const jwt = require('jsonwebtoken');
const config = require('../../core/config');

/**
 * AdminController
 * -----------------------------------------------------------------
 * Handles all incoming HTTP requests for the Admin module.
 * Delegates all business logic to AdminService.
 * The Service already returns clean DTOs via AdminMapper,
 * so the controller can pass them directly to the response.
 * -----------------------------------------------------------------
 */
class AdminController {

    /**
     * POST /api/admin/login
     * Authenticates an admin user.
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and Password are required'
                });
            }

            const admin = await AdminService.login(email, password);

            req.session.admin = admin;

            const token = jwt.sign(
                { id: admin.id, email: admin.email, role: 'admin' },
                config.JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.status(200).json({
                success: true,
                message: 'Login Successful',
                admin,
                token
            });
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/admin/signup
     * Creates a new admin user.
     */
    async signup(req, res) {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, Email and Password are required'
                });
            }

            const admin = await AdminService.signup(name, email, password);

            req.session.admin = admin;

            const token = jwt.sign(
                { id: admin.id, email: admin.email, role: 'admin' },
                config.JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.status(201).json({
                success: true,
                message: 'Signup Successful',
                admin,
                token
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new AdminController();