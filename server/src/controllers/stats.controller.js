const { getCollections } = require("../config/mongo");

const topContributors = async (req, res) => {
    const { lessonsCollection } = await getCollections();

    const pipeline = [
        { $match: { isDeleted: { $ne: true } } },
        {
            $group: {
                _id: "$creatorEmail",
                totalLessons: { $sum: 1 },
                name: { $first: "$creatorName" },
                avatar: { $first: "$creatorPhotoURL" },
            },
        },
        { $sort: { totalLessons: -1 } },
        { $limit: 6 },
    ];

    const contributors = await lessonsCollection.aggregate(pipeline).toArray();
    res.send({ contributors });
};

const authorStats = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const email = req.params.email;

    const totalLessons = await lessonsCollection.countDocuments({
        creatorEmail: email,
        isDeleted: { $ne: true },
        visibility: "public",
    });

    res.send({ totalLessons });
};

module.exports = { topContributors, authorStats };