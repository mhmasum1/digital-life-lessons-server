const allowedOrigin = process.env.SITE_DOMAIN;

const corsOptions = {
    origin: allowedOrigin ? [allowedOrigin] : true,
    credentials: true,
};

module.exports = { corsOptions };