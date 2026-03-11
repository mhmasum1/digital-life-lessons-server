const corsOptions = {
    origin: true,
    credentials: true,
};


// const allowedOrigins = [
//   "http://localhost:5173",
//   process.env.SITE_DOMAIN,
// ].filter(Boolean);

// const corsOptions = {
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true);

//     if (allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     }

//     return callback(new Error("Not allowed by CORS"));
//   },
//   credentials: true,
// };

// module.exports = { corsOptions };