const express = require('express');
const cors = require('cors');
const session = require('express-session');
const routes = require('./routes');
const config = require('./core/config');
const { errorHandler, notFoundHandler } = require('./core/middleware/errorHandler');

const { exec } = require("child_process");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// Browsers/WebViews auto-request this on every page load. It's not an API
// route, so without this it fell through to notFoundHandler and logged a
// 404 on every single load — pure noise. 204 = "nothing here, not an error".
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api', routes);

// ---------------- ADD THIS ----------------
app.post("/api/launch-excel", (req, res) => {

    console.log("Launch Excel endpoint called");

    const frontendPath = path.resolve(__dirname, "..", "..", "..", "Frontend");

    console.log(frontendPath);

    exec("npm start", {
        cwd: frontendPath,
        shell: true
    }, (error, stdout, stderr) => {

        if (error) {
            console.error(error);
            return;
        }

        console.log(stdout);

        if (stderr) {
            console.error(stderr);
        }
    });

    res.json({
        success: true
    });
});
// -----------------------------------------

// ---------------- CENTRALIZED ERROR HANDLING ----------------
// Must be mounted LAST — after every route. Any route/middleware that
// calls next(err) (or throws inside an asyncHandler-wrapped handler)
// lands here and gets a standardized { success, code, message, details }
// JSON response with the correct HTTP status. See core/middleware/errorHandler.js.
app.use(notFoundHandler);
app.use(errorHandler);
// --------------------------------------------------------------

module.exports = app;