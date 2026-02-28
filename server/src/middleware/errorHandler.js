function errorHandler(err, req, res, next) {
    console.error("API Error:", err);
    res.status(500).send({ message: "Server error" });
}

module.exports = { errorHandler };