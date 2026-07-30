exports.validateQuickBooksState = (req, res, next) => {
    const { state } = req.query;
    const storedState = req.session?.oauth_state;

    // If the session's stored state is missing, the backend session expired
    // sometime during the OAuth redirect round-trip. Reject immediately
    // instead of silently adopting whatever state the incoming request
    // supplies — that adoption is a CSRF bypass.
    if (!storedState) {
        return res.status(400).json({ error: 'Session expired. Please reconnect.' });
    }

    if (state !== storedState) {
        return res.status(400).json({ error: "Invalid State" });
    }

    next();
};

exports.validateXeroState = (req, res, next) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).json({ error: "Authorization code not received from Xero." });
    }

    if (state !== req.session.xero_state) {
        return res.status(400).json({ error: "Invalid state parameter." });
    }
    next();
};
