const { getCollections, mustObjectId } = require("../config/mongo");
const { asyncHandler } = require("./asyncHandler");

const getIsPremium = async (email) => {
    if (!email) return false;
    const { usersCollection } = await getCollections();
    const u = await usersCollection.findOne({ email }, { projection: { isPremium: 1 } });
    return !!u?.isPremium;
};

const verifyLessonOwnerOrAdmin = asyncHandler(async (req, res, next) => {
    const { lessonsCollection, usersCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const lesson = await lessonsCollection.findOne({ _id: oid, isDeleted: { $ne: true } });
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    const email = req.decoded?.email;
    const user = await usersCollection.findOne({ email });

    const isOwner = lesson.creatorEmail === email;
    const isAdmin = user?.role === "admin";

    if (!isOwner && !isAdmin) return res.status(403).send({ message: "forbidden" });

    req.lesson = lesson;
    next();
});

module.exports = { getIsPremium, verifyLessonOwnerOrAdmin };