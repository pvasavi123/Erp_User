'use strict';

const UserRepository = require('../auth/user.repository');
const logger = require('../../core/logger');

/**
 * SubscriptionController
 * Handles subscription plan upgrades with input validation.
 * Ensures only allowed plans are set and logs actions.
 */
class SubscriptionController {
  // POST /api/subscription/upgrade
  async upgrade(req, res) {
    try {
      const { plan } = req.body;
      const allowedPlans = ['Basic', 'Standard', 'Pro'];
      if (!plan || !allowedPlans.includes(plan)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing plan.' });
      }
      // Update user's plan; assume auth middleware populates req.user.userId
      const user = await UserRepository.findById(req.user.userId);
      const oldPlan = user ? user.plan : null;

      const planWeights = {
        'basic': 1,
        'standard': 2,
        'pro': 3
      };

      const oldPlanKey = (oldPlan || 'Pro').toLowerCase();
      const newPlanKey = plan.toLowerCase();
      const isDowngrade = (planWeights[newPlanKey] || 0) < (planWeights[oldPlanKey] || 0);

      await UserRepository.update(req.user.userId, { plan });

      if (isDowngrade && req.user.email) {
        const { QuickBooksToken, XeroToken } = require('../../core/database');
        await QuickBooksToken.destroy({ where: { mail: req.user.email } });
        await XeroToken.destroy({ where: { mail: req.user.email } });
        logger.info(`User ${req.user.userId} downgraded from ${oldPlan} to ${plan}. Cleared company connections.`);
      }

      logger.info(`User ${req.user.userId} updated plan to ${plan}`);
      return res.json({ success: true, message: 'Plan upgraded successfully.' });
    } catch (error) {
      logger.error('Subscription upgrade error', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
  }
}

module.exports = new SubscriptionController();
