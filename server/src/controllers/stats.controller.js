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

const homeStats = async (req, res) => {
    const { lessonsCollection, usersCollection } = await getCollections();

    const totalLessons = await lessonsCollection.countDocuments({
        isDeleted: { $ne: true },
    });

    const publicLessons = await lessonsCollection.countDocuments({
        isDeleted: { $ne: true },
        visibility: "public",
    });

    const contributors = await lessonsCollection
        .aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    creatorEmail: { $exists: true, $nin: [null, ""] },
                },
            },
            {
                $group: {
                    _id: "$creatorEmail",
                },
            },
            {
                $count: "totalContributors",
            },
        ])
        .toArray();

    const totalContributors = contributors[0]?.totalContributors || 0;

    const totalUsers = await usersCollection.countDocuments({
        isDeleted: { $ne: true },
    });

    res.send({
        totalLessons,
        publicLessons,
        totalContributors,
        totalUsers,
    });
};
const categoriesStats = async (req, res) => {
    const { lessonsCollection } = await getCollections();

    const categories = await lessonsCollection
        .aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    visibility: "public",
                },
            },
            {
                $group: {
                    _id: "$category",
                    totalLessons: { $sum: 1 },
                },
            },
            {
                $sort: { totalLessons: -1 },
            },
        ])
        .toArray();

    res.send({ categories });
};

module.exports = { topContributors, authorStats, homeStats, categoriesStats, };