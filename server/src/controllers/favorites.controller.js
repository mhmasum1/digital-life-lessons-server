const { getCollections, mustObjectId } = require("../config/mongo");

const addFavorite = async (req, res) => {
    const { favoritesCollection, lessonsCollection } = await getCollections();
    const { lessonId } = req.body;

    const lessonObjectId = mustObjectId(lessonId);
    if (!lessonObjectId) return res.status(400).send({ message: "Valid lessonId is required" });

    const email = req.decoded.email;

    const existing = await favoritesCollection.findOne({ lessonId: lessonObjectId, userEmail: email });
    if (existing) return res.status(400).send({ message: "Already in favorites" });

    const favDoc = { lessonId: lessonObjectId, userEmail: email, createdAt: new Date() };
    const result = await favoritesCollection.insertOne(favDoc);

    await lessonsCollection.updateOne({ _id: lessonObjectId }, { $inc: { savedCount: 1 } });
    res.send(result);
};

const listFavorites = async (req, res) => {
    const { favoritesCollection } = await getCollections();
    const email = req.decoded.email;

    const favs = await favoritesCollection
        .aggregate([
            { $match: { userEmail: email } },
            { $lookup: { from: "lessons", localField: "lessonId", foreignField: "_id", as: "lesson" } },
            { $unwind: "$lesson" },
            { $match: { "lesson.isDeleted": { $ne: true } } },
            { $sort: { createdAt: -1 } },
            { $project: { _id: 1, lesson: 1, createdAt: 1 } },
        ])
        .toArray();

    res.send({ favorites: favs });
};

const removeFavorite = async (req, res) => {
    const { favoritesCollection, lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid favorite id" });

    const email = req.decoded.email;
    const fav = await favoritesCollection.findOne({ _id: oid });

    if (!fav || fav.userEmail !== email) return res.status(403).send({ message: "forbidden" });

    const result = await favoritesCollection.deleteOne({ _id: oid });

    await lessonsCollection.updateOne({ _id: fav.lessonId, savedCount: { $gt: 0 } }, { $inc: { savedCount: -1 } });
    res.send(result);
};

module.exports = { addFavorite, listFavorites, removeFavorite };