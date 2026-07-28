'use strict';

const axios = require('axios');
const querystring = require('querystring');
const logger = require('../../core/logger');

class GoogleService {
    getAuthUrl() {
        const params = {
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            prompt: 'consent'
        };
        return `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify(params)}`;
    }

    async exchangeCodeForToken(code) {
        try {
            const response = await axios.post('https://oauth2.googleapis.com/token', querystring.stringify({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.data;
        } catch (error) {
            logger.error('Failed to exchange Google code for token', error.response?.data || error.message);
            throw error;
        }
    }

    async getUserProfile(accessToken) {
        try {
            const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            return response.data;
        } catch (error) {
            logger.error('Failed to fetch Google user profile', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new GoogleService();
