let stripe = null;
if (!process.env.STRIPE_SECRET) console.warn("⚠️ STRIPE_SECRET is missing in .env");
if (process.env.STRIPE_SECRET) stripe = require("stripe")(process.env.STRIPE_SECRET);

module.exports = { stripe };