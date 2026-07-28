const express = require('express');
const cors = require('cors');
const session = require('express-session');
const routes = require('./routes');
const config = require('./core/config');

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

module.exports = app;