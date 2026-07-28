'use strict';

/**
 * OAuthPopupView
 * ----------------------------------------------------------------
 * Renders the HTML pages served *inside* the OAuth popup window
 * (window.open target) for a given identity provider.
 *
 * The popup always ends its life by posting a `window.postMessage`
 * payload back to `window.opener` (the taskpane/web app) and then
 * closing itself. The `type` string in that payload is a contract
 * with the frontend listener — see Frontend/src/taskpane/taskpane.js
 * `AuthService.openGooglePopup()` / `openMicrosoftPopup()`.
 *
 * IMPORTANT: message types are NOT simply `${provider}_authed` for
 * every provider — the Microsoft listener only recognises
 * `ms_cancelled` (not `microsoft_cancelled`) for the logout/cancel
 * event. MESSAGE_TYPES below is the single source of truth so a
 * future provider can't silently break that contract.
 * ----------------------------------------------------------------
 */

const MESSAGE_TYPES = {
    google: {
        authed:    'google_authed',
        cancelled: 'google_cancelled',
        error:     'google_error',
        label:     'Google'
    },
    microsoft: {
        authed:    'microsoft_authed',
        cancelled: 'ms_cancelled',
        error:     'microsoft_error',
        label:     'Microsoft'
    }
};

function messageTypesFor(provider) {
    const types = MESSAGE_TYPES[provider];
    if (!types) {
        throw new Error(`OAuthPopupView: unknown provider "${provider}"`);
    }
    return types;
}

class OAuthPopupView {

    /**
     * Returning user who already has an active subscription plan.
     * Shows a brief "Welcome back" message, then posts the authed
     * payload and closes.
     *
     * @param {{ provider: string, email: string, name: string, plan: string, subId: string, token: string }} data
     * @returns {string} HTML document
     */
    static renderWelcomeBack({ provider, email, name, plan, subId, token }) {
        const { authed, label } = messageTypesFor(provider);

        return `<!DOCTYPE html>
<html>
  <head><script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script></head>
  <body style="background:#f4f5f7; display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif;">
    <div style="text-align:center;">
      <h2 style="color:#172b56;">Welcome back!</h2>
      <p style="color:#6b7a9a;">You already have an active ${plan} subscription.</p>
      <p style="color:#6b7a9a; font-size:12px;">Logging you in via ${label}...</p>
    </div>
    <script>
      var payload = {
        type:           '${authed}',
        email:          '${email}',
        name:           '${name}',
        subscriptionId: '${subId}',
        plan:           '${plan}',
        billingCycle:   'monthly',
        token:          '${token}'
      };
      setTimeout(function() {
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        } else if (typeof Office !== 'undefined' && Office.context && Office.context.ui) {
          Office.context.ui.messageParent(JSON.stringify(payload));
        } else {
          window.close();
        }
      }, 1500);
    </script>
  </body>
</html>`;
    }

    /**
     * New user (or returning user without a plan yet) — renders the
     * full onboarding flow (Plans -> Payment -> Success) inside the
     * popup. On completion it persists the chosen plan via
     * PATCH /api/auth/update-plan and posts the authed payload.
     *
     * @param {{ provider: string, email: string, name: string, subId: string, token: string }} data
     * @returns {string} HTML document
     */
    static renderPlansFlow({ provider, email, name, subId, token }) {
        const { authed, cancelled, label } = messageTypesFor(provider);
        const avatar = (name || email || 'U').charAt(0).toUpperCase();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinAccrual – Choose Your Plan</title>
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
    .brand-name { font-size: 15px; font-weight: 700; color: #fff; }
    .brand-tagline { font-size: 9px; color: #6a85b0; letter-spacing: 1px; display: block; }
    .header-right { display: flex; align-items: center; gap: 8px; }
    .user-chip {
      display: flex; align-items: center; gap: 7px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 5px 10px 5px 5px;
    }
    .user-avatar {
      width: 24px; height: 24px; border-radius: 50%;
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .user-email { font-size: 11px; color: #a5bde0; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .logout-link {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #a5bde0;
      font-size: 11px; font-weight: 600;
      padding: 5px 10px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .logout-link:hover { background: rgba(255,77,77,0.15); border-color: rgba(255,77,77,0.3); color: #ff9a9a; }
    .screen { display: none; flex: 1; flex-direction: column; }
    .screen.active { display: flex; }
    .plans-wrap { flex: 1; overflow-y: auto; padding: 20px; }
    .plans-intro { text-align: center; margin-bottom: 16px; }
    .plans-intro h2 { font-size: 18px; font-weight: 800; color: #1a2035; margin-bottom: 4px; }
    .plans-intro p { font-size: 12px; color: #6b7a9a; }
    .billing-row {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; margin-bottom: 18px;
    }
    .billing-label { font-size: 12px; font-weight: 600; color: #8a98b8; transition: color 0.2s; }
    .billing-label.on { color: #1a2035; }
    .toggle-sw { position: relative; width: 38px; height: 21px; display: inline-block; }
    .toggle-sw input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: #d0d8ef; border-radius: 21px; cursor: pointer; transition: 0.3s;
    }
    .toggle-track::before {
      content: ''; position: absolute;
      width: 15px; height: 15px; left: 3px; bottom: 3px;
      background: white; border-radius: 50%; transition: 0.3s;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    input:checked ~ .toggle-track { background: #2459dd; }
    input:checked ~ .toggle-track::before { transform: translateX(17px); }
    .save-chip {
      background: #22b14c; color: white;
      font-size: 9px; font-weight: 700;
      padding: 3px 7px; border-radius: 20px;
    }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card {
      background: #f8f9fc;
      border: 1.5px solid #e4e8f4;
      border-radius: 14px;
      padding: 16px;
      position: relative;
      transition: box-shadow 0.2s, transform 0.15s;
    }
    .card:hover { box-shadow: 0 4px 18px rgba(36,89,221,0.1); transform: translateY(-1px); }
    .card.featured {
      border-color: #2459dd;
      background: linear-gradient(145deg, #eef3ff 0%, #f4f0ff 100%);
      box-shadow: 0 4px 20px rgba(36,89,221,0.1);
    }
    .popular-tag {
      position: absolute; top: -10px; left: 14px;
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; font-size: 8px; font-weight: 800;
      padding: 3px 9px; border-radius: 20px; letter-spacing: 0.5px;
    }
    .card-head { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
    .card-icon { font-size: 17px; }
    .card-name { font-size: 15px; font-weight: 700; }
    .name-starter { color: #e8a020; }
    .name-pro { color: #2459dd; }
    .name-ent { color: #0ea5e9; }
    .price-row { display: flex; align-items: baseline; gap: 1px; margin-bottom: 10px; }
    .price-curr { font-size: 14px; font-weight: 700; color: #1a2035; }
    .price-amt { font-size: 28px; font-weight: 800; color: #1a2035; line-height: 1; }
    .price-period { font-size: 11px; color: #6b7a9a; margin-left: 2px; }
    .feats { list-style: none; margin-bottom: 12px; }
    .feats li { font-size: 11px; color: #4a5a7a; margin-bottom: 5px; }
    .card-btn {
      width: 100%; padding: 10px;
      border-radius: 8px; border: none;
      font-size: 12px; font-weight: 700;
      cursor: pointer; transition: all 0.2s; font-family: inherit;
    }
    .btn-starter { background: #fff7e6; color: #b45309; border: 1.5px solid #fde68a; }
    .btn-starter:hover { background: #fef3c7; }
    .btn-pro {
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; box-shadow: 0 4px 12px rgba(36,89,221,0.25);
    }
    .btn-pro:hover { box-shadow: 0 6px 18px rgba(36,89,221,0.35); }
    .btn-ent { background: #f0f9ff; color: #0369a1; border: 1.5px solid #bae6fd; }
    .btn-ent:hover { background: #e0f2fe; }
    .secure-note { text-align: center; font-size: 10px; color: #8a98b8; margin-top: 14px; padding-bottom: 4px; }
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
    .form-group { margin-bottom: 13px; }
    .form-group label { display: block; font-size: 10px; font-weight: 600; color: #8a98b8; letter-spacing: 0.5px; margin-bottom: 6px; }
    .form-input {
      width: 100%; padding: 10px 12px;
      background: white; border: 1.5px solid #e4e8f4;
      border-radius: 8px; font-size: 13px; color: #1a2035;
      font-family: inherit; outline: none; transition: border-color 0.2s;
    }
    .form-input:focus { border-color: #2459dd; }
    .form-row { display: flex; gap: 10px; }
    .form-row .form-group { flex: 1; }
    .card-icons { display: flex; gap: 5px; margin-bottom: 12px; }
    .card-badge {
      padding: 3px 8px; border-radius: 5px;
      font-size: 10px; font-weight: 700; color: white;
    }
    .visa-badge { background: #1a1f71; }
    .mc-badge { background: #eb001b; }
    .amex-badge { background: #2e77bc; }
    .pay-btn {
      width: 100%; padding: 13px;
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; border: none; border-radius: 10px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: box-shadow 0.2s, transform 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      margin-top: 4px;
    }
    .pay-btn:hover { box-shadow: 0 6px 20px rgba(36,89,221,0.3); transform: translateY(-1px); }
    .pay-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
    .secure-badge { text-align: center; font-size: 10px; color: #8a98b8; margin-top: 10px; }
    .processing-wrap {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px;
      background: white; padding: 28px;
    }
    .proc-spinner {
      width: 48px; height: 48px;
      border: 4px solid #e4e8f4;
      border-top-color: #2459dd;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .proc-title { font-size: 16px; font-weight: 700; color: #1a2035; }
    .proc-sub { font-size: 12px; color: #8a98b8; }
    .success-wrap {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      padding: 28px 24px; text-align: center;
    }
    .success-icon-wrap {
      width: 68px; height: 68px; border-radius: 50%;
      background: linear-gradient(135deg, #22b14c, #16a34a);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 6px 24px rgba(34,177,76,0.3);
      animation: pop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .success-check { font-size: 30px; color: white; }
    .success-title { font-size: 22px; font-weight: 800; color: #1a2035; }
    .success-sub { font-size: 12px; color: #6b7a9a; margin-top: -8px; }
    .sub-id-card {
      background: #eff6ff; border: 1.5px solid #bae6fd;
      border-radius: 12px; padding: 12px 24px;
      width: 100%; max-width: 280px;
    }
    .sub-id-lbl { font-size: 10px; color: #6b7a9a; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 4px; }
    .sub-id-val { font-size: 17px; font-weight: 800; color: #1d4ed8; font-family: 'Courier New', monospace; }
    .plan-badge-card {
      background: #f0fdf4; border: 1.5px solid #bbf7d0;
      border-radius: 10px; padding: 10px 24px;
      width: 100%; max-width: 280px;
    }
    .plan-badge-lbl { font-size: 10px; color: #6b7a9a; font-weight: 600; margin-bottom: 2px; }
    .plan-badge-val { font-size: 14px; font-weight: 700; color: #15803d; }
    .continue-btn {
      margin-top: 8px; padding: 13px 32px;
      background: linear-gradient(135deg, #2459dd, #7c5cfc);
      color: white; border: none; border-radius: 10px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: box-shadow 0.2s, transform 0.2s;
    }
    .continue-btn:hover { box-shadow: 0 6px 20px rgba(36,89,221,0.3); transform: translateY(-1px); }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="logo">FA</div>
      <div>
        <div class="brand-name">FinAccrual</div>
        <span class="brand-tagline">ACCRUAL • PREPAID • DEFERRED REVENUE</span>
      </div>
    </div>
    <div class="header-right">
      <div class="user-chip">
        <div class="user-avatar">${avatar}</div>
        <span class="user-email">${email}</span>
      </div>
      <button class="logout-link" onclick="doLogout()">↩ Logout</button>
    </div>
  </div>

  <div id="screenPlans" class="screen active">
    <div class="plans-wrap">
      <div class="plans-intro">
        <h2>Choose Your Plan</h2>
        <p>Start your FinAccrual subscription to unlock Excel automation.</p>
      </div>

      <div class="billing-row">
        <span class="billing-label on" id="lblMonthly">Monthly</span>
        <label class="toggle-sw">
          <input type="checkbox" id="billingToggle">
          <span class="toggle-track"></span>
        </label>
        <span class="billing-label" id="lblYearly">Yearly</span>
        <span class="save-chip">Save 20%</span>
      </div>

      <div class="cards">
        <div class="card" id="cardBasic">
          <div class="card-head">
            <span class="card-icon">🌱</span>
            <span class="card-name name-starter">Basic</span>
          </div>
          <div class="price-row">
            <span class="price-curr">₹</span>
            <span class="price-amt" id="basicAmt">699</span>
            <span class="price-period">/mo</span>
          </div>
          <ul class="feats">
            <li>✓ 1 Connected Company</li>
            <li>✓ Excel Automation Integration</li>
            <li>✓ Secure Data Extraction</li>
          </ul>
          <button class="card-btn btn-starter" onclick="selectPlan('Basic', 699, 599)">Get Started</button>
        </div>

        <div class="card" id="cardStandard">
          <div class="card-head">
            <span class="card-icon">🚀</span>
            <span class="card-name name-ent">Standard</span>
          </div>
          <div class="price-row">
            <span class="price-curr">₹</span>
            <span class="price-amt" id="standardAmt">1299</span>
            <span class="price-period">/mo</span>
          </div>
          <ul class="feats">
            <li>✓ Up to 3 Connected Companies</li>
            <li>✓ Excel Automation Integration</li>
            <li>✓ Secure Data Extraction</li>
          </ul>
          <button class="card-btn btn-ent" onclick="selectPlan('Standard', 1299, 1199)">Get Started</button>
        </div>

        <div class="card featured" id="cardPro">
          <div class="popular-tag">MOST POPULAR</div>
          <div class="card-head">
            <span class="card-icon">💎</span>
            <span class="card-name name-pro">Pro</span>
          </div>
          <div class="price-row">
            <span class="price-curr">₹</span>
            <span class="price-amt" id="proAmt">1999</span>
            <span class="price-period">/mo</span>
          </div>
          <ul class="feats">
            <li>✓ Up to 10 Connected Companies</li>
            <li>✓ Excel Automation Integration</li>
            <li>✓ Secure Data Extraction</li>
            <li>✓ Priority Customer Support</li>
          </ul>
          <button class="card-btn btn-pro" onclick="selectPlan('Pro', 1999, 1899)">Get Started</button>
        </div>
      </div>
      <p class="secure-note">🔒 Payments are secured by Stripe / Razorpay</p>
    </div>
  </div>

  <div id="screenPayment" class="screen">
    <div class="pay-wrap">
      <button class="back-btn" onclick="showScreen('Plans')">← Back to Plans</button>
      <div class="pay-title">Secure Checkout</div>

      <div class="order-card">
        <div class="order-row">
          <span class="order-lbl">Plan</span>
          <span class="order-val" id="payPlan">Pro</span>
        </div>
        <div class="order-row">
          <span class="order-lbl">Billing</span>
          <span class="order-val" id="payCycle">Monthly</span>
        </div>
        <div class="order-divider"></div>
        <div class="order-row">
          <span class="order-total-lbl">Total</span>
          <span class="order-total-val" id="payTotal">₹1999</span>
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
          <input type="text" class="form-input" id="cardName" value="${name}" placeholder="Your Name">
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

  <div id="screenProcessing" class="screen">
    <div class="processing-wrap">
      <div class="proc-spinner"></div>
      <div class="proc-title">Processing your payment...</div>
      <div class="proc-sub">Please do not close this window.</div>
    </div>
  </div>

  <div id="screenSuccess" class="screen">
    <div class="success-wrap">
      <div class="success-icon-wrap">
        <span class="success-check">✓</span>
      </div>
      <div class="success-title">Account Created!</div>
      <div class="success-sub">Your FinAccrual subscription is now active.</div>
      <div class="sub-id-card">
        <div class="sub-id-lbl">SUBSCRIPTION ID</div>
        <div class="sub-id-val">${subId}</div>
      </div>
      <div class="plan-badge-card">
        <div class="plan-badge-lbl">PLAN</div>
        <div class="plan-badge-val" id="successPlan">Pro</div>
      </div>
      <button class="continue-btn" onclick="finishFlow()">Open FinAccrual Dashboard →</button>
    </div>
  </div>

  <script>
    var isYearly = false;
    var selectedPlan = '';
    var selectedPrice = 0;

    var prices = {
      Basic:    { monthly: 699,  yearly: 599 },
      Standard: { monthly: 1299, yearly: 1199 },
      Pro:      { monthly: 1999, yearly: 1899 }
    };

    var toggle = document.getElementById('billingToggle');
    toggle.addEventListener('change', function() {
      isYearly = toggle.checked;
      document.getElementById('lblMonthly').classList.toggle('on', !isYearly);
      document.getElementById('lblYearly').classList.toggle('on',  isYearly);
      document.getElementById('basicAmt').textContent    = isYearly ? prices.Basic.yearly    : prices.Basic.monthly;
      document.getElementById('standardAmt').textContent = isYearly ? prices.Standard.yearly : prices.Standard.monthly;
      document.getElementById('proAmt').textContent      = isYearly ? prices.Pro.yearly      : prices.Pro.monthly;
    });

    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
      document.getElementById('screen' + id).classList.add('active');
    }

    function selectPlan(plan, monthly, yearly) {
      selectedPlan  = plan;
      selectedPrice = isYearly ? yearly : monthly;

      document.getElementById('payPlan').textContent  = plan;
      document.getElementById('payCycle').textContent = isYearly ? 'Yearly' : 'Monthly';
      document.getElementById('payTotal').textContent = '₹' + selectedPrice;
      showScreen('Payment');
    }

    function formatCard(input) {
      var v = input.value.replace(/\\D/g, '').substring(0, 16);
      input.value = v.replace(/(.{4})/g, '$1 ').trim();
    }

    function formatExp(input) {
      var v = input.value.replace(/\\D/g, '').substring(0, 4);
      if (v.length >= 2) v = v.substring(0,2) + ' / ' + v.substring(2);
      input.value = v;
    }

    function processPayment() {
      var name = document.getElementById('cardName').value.trim();
      var num  = document.getElementById('cardNum').value.trim();
      var exp  = document.getElementById('cardExp').value.trim();
      var cvv  = document.getElementById('cardCvv').value.trim();

      if (!name || !num || num.replace(/\\s/g,'').length < 16 || !exp || cvv.length < 3) {
        alert('Please fill in all payment details correctly.');
        return;
      }

      document.getElementById('successPlan').textContent = selectedPlan;
      showScreen('Processing');
      setTimeout(function() { showScreen('Success'); }, 2200);
    }

    async function finishFlow() {
      try {
        await fetch('/api/auth/update-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${token}'
          },
          body: JSON.stringify({ plan: selectedPlan })
        });
      } catch (err) {
        console.error('Failed to save plan', err);
      }

      var payload = {
        type:           '${authed}',
        email:          '${email}',
        name:           '${name}',
        subscriptionId: '${subId}',
        plan:           selectedPlan,
        billingCycle:   isYearly ? 'yearly' : 'monthly',
        token:          '${token}'
      };
      if (window.opener) {
        window.opener.postMessage(payload, '*');
        window.close();
      } else if (typeof Office !== 'undefined' && Office.context && Office.context.ui) {
        Office.context.ui.messageParent(JSON.stringify(payload));
      } else {
        alert('Subscription ID: ${subId}');
      }
    }

    function doLogout() {
      if (confirm('Log out of this ${label} account?')) {
        var payload = { type: '${cancelled}' };
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        } else if (typeof Office !== 'undefined' && Office.context && Office.context.ui) {
          Office.context.ui.messageParent(JSON.stringify(payload));
        } else {
          window.close();
        }
      }
    }
  </script>
  <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
</body>
</html>`;
    }

    /**
     * Terminal error page shown inside the popup when the OAuth
     * exchange or profile lookup fails.
     *
     * @param {{ provider: string, message: string }} data
     * @returns {string} HTML document
     */
    static renderError({ provider, message }) {
        const { error } = messageTypesFor(provider);
        const safeMessage = String(message || 'Unknown error').replace(/'/g, "\\'");

        return `<!DOCTYPE html>
<html>
  <body style="background:#1a0000;color:#ffaaaa;font-family:sans-serif;text-align:center;padding:40px;">
    <div style="font-size:24px;">❌ Sign-in failed</div>
    <div style="margin-top:10px;font-size:13px;">${safeMessage}</div>
    <script>
      setTimeout(function() {
        if (window.opener) { window.opener.postMessage({ type: '${error}', message: '${safeMessage}' }, '*'); window.close(); }
        else if (typeof Office !== 'undefined') { Office.onReady(function() { Office.context.ui.messageParent(JSON.stringify({ type: '${error}' })); }); }
        else { window.close(); }
      }, 2000);
    </script>
    <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
  </body>
</html>`;
    }
}

module.exports = OAuthPopupView;
