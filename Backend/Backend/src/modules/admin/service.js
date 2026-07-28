'use strict';

const bcrypt          = require('bcrypt');
const AdminRepository = require('./repository');
const AdminMapper     = require('./mapper');

/**
 * AdminService
 * -----------------------------------------------------------------
 * Responsible for all Admin business logic.
 * Uses AdminMapper to strip sensitive fields before returning data.
 * -----------------------------------------------------------------
 */
class AdminService {

    /**
     * Authenticate an admin by email and password.
     * @param {string} email
     * @param {string} password
     * @returns {AdminDTO} clean DTO (no password field)
     */
    static async login(email, password) {
        const admin = await AdminRepository.findByEmail(email);

        if (!admin) {
            throw new Error('Invalid Email');
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            throw new Error('Invalid Password');
        }

        return AdminMapper.toAdminDTO(admin);
    }

    /**
     * Create a new admin account.
     * @param {string} name
     * @param {string} email
     * @param {string} password
     * @returns {AdminDTO} clean DTO
     */
    static async signup(name, email, password) {
        const existing = await AdminRepository.findByEmail(email);
        if (existing) {
            throw new Error('Email already registered');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = await AdminRepository.create({
            name,
            email,
            password: hashedPassword
        });

        return AdminMapper.toAdminDTO(admin);
    }
}

module.exports = AdminService;