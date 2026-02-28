const { getCollections } = require("../config/mongo");
const { asyncHandler } = require("./asyncHandler");

const verifyAdmin = asyncHandler(async (req, res, next) => {
    const { usersCollection } = await getCollections();
    const email = req.decoded?.email;
    const user = await usersCollection.findOne({ email });
    if (!user || user.role !== "admin") return res.status(403).send({ message: "forbidden" });
    next();
});

module.exports = { verifyAdmin };