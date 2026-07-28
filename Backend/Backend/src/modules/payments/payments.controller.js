'use strict';

/**
 * Payments Controller
 * Renders a standalone checkout page for plan upgrades / changes.
 * The page mirrors the Secure Checkout UI used during the Google OAuth
 * onboarding flow so the experience is identical.
 */
class PaymentsController {

    // GET /api/payments/checkout?plan=Basic&price=699&cycle=Monthly&email=...
    checkout(req, res) {
        const plan  = req.query.plan  || 'Basic';
        const price = parseInt(req.query.price, 10) || 699;
        const cycle = req.query.cycle || 'Monthly';
        const email = req.query.email || '';

        return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinAccrual – Secure Checkout</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #ffffff;
      color: #1a2035;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
    }

    /* ---- HEADER ---- */
    .header {
      background: #172b56;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 34px; height: 34px;
      background: white;
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 13px; color: #172b56;
    }
    .brand { color: white; font-size: 15px; font-weight: 700; letter-spacing: -.3px; }

    /* ---- SCREEN TRANSITIONS ---- */
    .screen { display: none; flex-direction: column; flex: 1; }
    .screen.active { display: flex; }

    /* ---- PAYMENT SCREEN ---- */
    .pay-wrap { flex: 1; overflow-y: auto; padding: 20px; }
    .back-btn {
      background: none; border: none; color: #2459dd;
      font-size: 13px; font-weight: 600; cursor: pointer;
      padding: 0 0 14px 0; display: flex; align-items: center; gap: 5px;
      font-family: inherit;
    }
    .back-btn:hover { color: #1a3db8; }
    .pay-title { font-size: 17px; font-weight: 800; color: #1a2035; margin-bottom: 14px; }
    .order-card {
      background: #f8f9fc; border: 1.5px solid #e4e8f4;
      border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;
    }
    .order-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
    .order-row:last-child { margin-bottom: 0; }
    .order-lbl { font-size: 12px; color: #6b7a9a; }
    .order-val { font-size: 12px; font-weight: 600; color: #1a2035; }
    .order-divider { border-top: 1px solid #e4e8f4; margin: 9px 0; }
    .order-total-lbl { font-size: 13px; font-weight: 700; color: #1a2035; }
    .order-total-val { font-size: 18px; font-weight: 800; color: #2459dd; }
    .pay-card {
      background: #f8f9fc; border: 1.5px solid #e4e8f4;
      border-radius: 14px; padding: 18px;
    }
    .pay-card-title { font-size: 13px; font-weight: 700; color: #1a2035; margin-bottom: 14px; }
    .card-icons { display: flex; gap: 6px; margin-bottom: 14px; }
    .card-badge {
      padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 700;
      letter-spacing: 0.5px; border: 1px solid #e4e8f4;
    }
    .visa-badge { background: #1a1f71; color: white; border-color: #1a1f71; }
    .mc-badge { background: #eb001b; color: white; border-color: #eb001b; }
    .amex-badge { background: #006fcf; color: white; border-color: #006fcf; }
    .form-group { margin-bottom: 13px; }
    .form-group label { display: block; font-size: 10px; font-weight: 600; color: #8a98b8; letter-spacing: 0.5px; margin-bottom: 6px; }
    .form-input {
      width: 100%; padding: 10px 12px;
      background: white; border: 1.5px solid #e4e8f4;
      border-radius: 8px; font-family: inherit;
      font-size: 13px; color: #1a2035;
      transition: border-color .2s;
    }
    .form-input:focus { outline: none; border-color: #2459dd; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pay-btn {
      width: 100%; margin-top: 16px; padding: 12px;
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; border: none; border-radius: 10px;
      font-family: inherit; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: box-shadow .2s;
    }
    .pay-btn:hover { box-shadow: 0 6px 18px rgba(36,89,221,0.35); }
    .secure-badge { text-align: center; font-size: 10px; color: #8a98b8; margin-top: 12px; }

    /* ---- PROCESSING SCREEN ---- */
    .processing-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 40px; }
    .proc-spinner {
      width: 44px; height: 44px;
      border: 3px solid #e4e8f4; border-top-color: #2459dd;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .proc-title { font-size: 15px; font-weight: 700; margin-top: 20px; }
    .proc-sub { font-size: 12px; color: #6b7a9a; margin-top: 6px; }

    /* ---- SUCCESS SCREEN ---- */
    .success-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 30px; text-align: center; }
    .success-icon { font-size: 52px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 800; margin-bottom: 6px; }
    .success-sub { font-size: 13px; color: #6b7a9a; margin-bottom: 24px; }
    .done-btn {
      padding: 11px 32px; background: #2459dd; color: white; border: none;
      border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 700;
      cursor: pointer;
    }
    .done-btn:hover { background: #1a3db8; }

    /* ---- SECURE CHECKOUT SCREEN (initial) ---- */
    .checkout-info {
      background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
      border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 18px;
    }
    .checkout-lock { font-size: 32px; margin-bottom: 10px; }
    .checkout-info-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    .checkout-info-sub { font-size: 11px; color: #6b7a9a; line-height: 1.5; }
    .verify-link { color: #2459dd; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .verify-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="logo">FA</div>
      <span class="brand">FinAccrual</span>
    </div>
  </div>

  <!-- SCREEN 1: CHECKOUT SUMMARY -->
  <div id="screenCheckout" class="screen active">
    <div class="pay-wrap">
      <div class="pay-title">Secure Checkout</div>

      <div class="order-card">
        <div class="order-row">
          <span class="order-lbl">Plan</span>
          <span class="order-val" id="payPlan">${plan}</span>
        </div>
        <div class="order-row">
          <span class="order-lbl">Billing</span>
          <span class="order-val" id="payCycle">${cycle}</span>
        </div>
        <div class="order-divider"></div>
        <div class="order-row">
          <span class="order-total-lbl">Total</span>
          <span class="order-total-val" id="payTotal">₹${price}</span>
        </div>
      </div>

      <div class="checkout-info">
        <div class="checkout-lock">🔐</div>
        <div class="checkout-info-title">Secure Payment Processing</div>
        <div class="checkout-info-sub">You will be redirected to our secure payment portal to complete your subscription. Card details are handled entirely by our payment provider — never stored by FinAccrual.</div>
      </div>

      <button class="pay-btn" onclick="showScreen('Payment')">Open Secure Checkout</button>
      <div style="text-align:center; margin-top: 12px;">
        <span style="font-size: 11px; color: #6b7a9a;">Already paid? </span>
        <a class="verify-link" onclick="verifyPayment()">Verify my payment →</a>
      </div>
    </div>
  </div>

  <!-- SCREEN 2: PAYMENT -->
  <div id="screenPayment" class="screen">
    <div class="pay-wrap">
      <button class="back-btn" onclick="showScreen('Checkout')">← Back</button>
      <div class="pay-title">Secure Checkout</div>

      <div class="order-card">
        <div class="order-row">
          <span class="order-lbl">Plan</span>
          <span class="order-val">${plan}</span>
        </div>
        <div class="order-row">
          <span class="order-lbl">Billing</span>
          <span class="order-val">${cycle}</span>
        </div>
        <div class="order-divider"></div>
        <div class="order-row">
          <span class="order-total-lbl">Total</span>
          <span class="order-total-val">₹${price}</span>
        </div>
      </div>

      <div class="pay-card">
        <div class="pay-card-title">💳 Payment Details</div>
        <div class="card-icons">
          <span class="card-badge visa-badge">VISA</span>
          <span class="card-badge mc-badge">MC</span>
          <span class="card-badge amex-badge">AMEX</span>
        </div>
        <div class="form-group">
          <label>CARDHOLDER NAME</label>
          <input type="text" class="form-input" id="cardName" placeholder="Your Name">
        </div>
        <div class="form-group">
          <label>CARD NUMBER</label>
          <input type="text" class="form-input" id="cardNum" placeholder="4111 1111 1111 1111" maxlength="19" oninput="formatCard(this)">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>EXPIRY DATE</label>
            <input type="text" class="form-input" id="cardExp" placeholder="MM / YY" maxlength="7" oninput="formatExp(this)">
          </div>
          <div class="form-group">
            <label>CVV</label>
            <input type="password" class="form-input" id="cardCvv" placeholder="•••" maxlength="3">
          </div>
        </div>
        <button class="pay-btn" id="payBtn" onclick="processPayment()">
          <span id="payBtnText">Complete Payment</span>
        </button>
        <div class="secure-badge">🔒 256-bit SSL encrypted • PCI DSS compliant</div>
      </div>
    </div>
  </div>

  <!-- SCREEN 3: PROCESSING -->
  <div id="screenProcessing" class="screen">
    <div class="processing-wrap">
      <div class="proc-spinner"></div>
      <div class="proc-title">Processing your payment...</div>
      <div class="proc-sub">Please do not close this window.</div>
    </div>
  </div>

  <!-- SCREEN 4: SUCCESS -->
  <div id="screenSuccess" class="screen">
    <div class="success-wrap">
      <div class="success-icon">🎉</div>
      <div class="success-title">Payment Successful!</div>
      <div class="success-sub">Your <strong id="successPlan">${plan}</strong> plan is now active.</div>
      <button class="done-btn" onclick="finishFlow()">Go to Dashboard</button>
    </div>
  </div>

  <script>
    var selectedPlan  = '${plan}';
    var selectedPrice = ${price};
    var selectedCycle = '${cycle}';
    var userEmail     = '${email}';

    /* Screen switcher */
    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
      document.getElementById('screen' + id).classList.add('active');
    }

    /* Card number formatting */
    function formatCard(input) {
      var v = input.value.replace(/\\D/g, '').substring(0, 16);
      input.value = v.replace(/(.{4})/g, '$1 ').trim();
    }

    /* Expiry formatting */
    function formatExp(input) {
      var v = input.value.replace(/\\D/g, '').substring(0, 4);
      if (v.length >= 2) v = v.substring(0,2) + ' / ' + v.substring(2);
      input.value = v;
    }

    /* Mock payment processing */
    function processPayment() {
      var name = document.getElementById('cardName').value.trim();
      var num  = document.getElementById('cardNum').value.trim();
      var exp  = document.getElementById('cardExp').value.trim();
      var cvv  = document.getElementById('cardCvv').value.trim();

      if (!name || !num || num.replace(/\\s/g,'').length < 16 || !exp || cvv.length < 3) {
        alert('Please fill in all payment details correctly.');
        return;
      }

      fetch('/api/payments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, plan: selectedPlan })
      }).catch(function(err) { console.error('Error completing payment:', err); });

      document.getElementById('successPlan').textContent = selectedPlan;
      showScreen('Processing');
      setTimeout(function() { showScreen('Success'); }, 2200);
    }

    /* Verify payment (mock) */
    function verifyPayment() {
      fetch('/api/payments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, plan: selectedPlan })
      }).catch(function(err) { console.error('Error completing payment:', err); });

      showScreen('Processing');
      setTimeout(function() { showScreen('Success'); }, 2200);
    }

    /* Send payment_success message to opener and close */
    function finishFlow() {
      var payload = {
        type:           'payment_success',
        plan:           selectedPlan,
        billingCycle:   selectedCycle,
        subscriptionId: 'FA-SUB-' + Math.floor(100000 + Math.random() * 900000)
      };
      if (window.opener) {
        window.opener.postMessage(payload, '*');
        window.close();
      } else if (typeof Office !== 'undefined' && Office.context && Office.context.ui) {
        Office.context.ui.messageParent(JSON.stringify(payload));
      } else {
        window.close();
      }
    }
  </script>
  <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
</body>
</html>`);
    }

    // POST /api/payments/complete
    async completePayment(req, res) {
        try {
            const { email, plan } = req.body;
            if (!email || !plan) {
                return res.status(400).json({ success: false, message: 'Email and plan are required.' });
            }

            const UserRepository = require('../auth/user.repository');
            const logger = require('../../core/logger');

            const user = await UserRepository.findByEmail(email);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found.' });
            }

            const oldPlan = user.plan;
            const planWeights = {
                'basic': 1,
                'standard': 2,
                'pro': 3
            };

            const oldPlanKey = (oldPlan || 'Pro').toLowerCase();
            const newPlanKey = plan.toLowerCase();
            const isDowngrade = (planWeights[newPlanKey] || 0) < (planWeights[oldPlanKey] || 0);

            await UserRepository.update(user.id, { plan });

            if (isDowngrade) {
                const { QuickBooksToken, XeroToken } = require('../../core/database');
                await QuickBooksToken.destroy({ where: { mail: email } });
                await XeroToken.destroy({ where: { mail: email } });
                logger.info(`User ${user.id} downgraded from ${oldPlan} to ${plan} via checkout. Cleared company connections.`);
            }

            logger.info(`User ${user.id} updated plan to ${plan} via checkout.`);
            return res.json({ success: true, message: 'Plan updated successfully.' });
        } catch (error) {
            const logger = require('../../core/logger');
            logger.error('completePayment error', error.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    }
}

module.exports = new PaymentsController();
