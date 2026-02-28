const { admin } = require("../config/firebase");

const verifyFBToken = async (req, res, next) => {
    const authHeader = req.headers.authorization; // "Bearer <token>"
    if (!authHeader) return res.status(401).send({ message: "unauthorized" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).send({ message: "unauthorized" });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
    } catch (err) {
        return res.status(401).send({ message: "unauthorized" });
    }
};

module.exports = { verifyFBToken };