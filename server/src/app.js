const express = require("express");
const cors = require("cors");
const { corsOptions } = require("./config/cors");
const routes = require("./routes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => res.send("Digital Life Lessons server is running ✅"));

app.use(routes);

// centralized error handler
app.use(errorHandler);

module.exports = app;