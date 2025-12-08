
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 5000;

app.use(
    cors({
        origin: process.env.SITE_DOMAIN,
        credentials: true,
    })
);
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Digital Life Lessons server is running");
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
