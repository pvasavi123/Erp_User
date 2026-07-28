exports.validateQuickBooksState = (req, res, next) => {
    const { state } = req.query;
    const storedState = req.session.oauth_state;

    if (storedState && state && state !== storedState) {
        return res.status(400).json({ error: "Invalid State" });
    }

    if (!storedState && state) {
        req.session.oauth_state = state;
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
