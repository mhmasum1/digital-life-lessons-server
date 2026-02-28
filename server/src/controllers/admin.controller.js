const { getCollections, mustObjectId } = require("../config/mongo");

const listUsersWithLessonsCount = async (req, res) => {
    const { usersCollection } = await getCollections();

    const pipeline = [
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "lessons",
                let: { email: "$email" },
                pipeline: [
                    { $match: { $expr: { $eq: ["$creatorEmail", "$$email"] }, isDeleted: { $ne: true } } },
                    { $count: "count" },
                ],
                as: "lessonMeta",
            },
        },
        {
            $addFields: {
                lessonsCount: { $ifNull: [{ $first: "$lessonMeta.count" }, 0] },
            },
        },
        { $project: { lessonMeta: 0 } },
    ];

    const users = await usersCollection.aggregate(pipeline).toArray();
    res.send(users);
};

const makeAdmin = async (req, res) => {
    const { usersCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid user id" });

    const result = await usersCollection.updateOne(
        { _id: oid },
        { $set: { role: "admin", updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) return res.status(404).send({ message: "User not found" });
    res.send(result);
};

const updateUserRole = async (req, res) => {
    const { usersCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid user id" });

    const { role } = req.body || {};
    if (!["admin", "user"].includes(role)) return res.status(400).send({ message: "Invalid role" });

    const target = await usersCollection.findOne({ _id: oid });
    if (!target) return res.status(404).send({ message: "User not found" });

    if (req.decoded.email === target.email && role !== "admin") {
        return res.status(400).send({ message: "You cannot demote yourself" });
    }

    const result = await usersCollection.updateOne(
        { _id: oid },
        { $set: { role, updatedAt: new Date() } }
    );

    res.send(result);
};

const adminStats = async (req, res) => {
    const { usersCollection, lessonsCollection, reportsCollection } = await getCollections();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const last30 = new Date();
    last30.setDate(last30.getDate() - 29);
    last30.setHours(0, 0, 0, 0);

    const [totalUsers, totalLessons, publicLessons, totalReports, todaysNewLessons] = await Promise.all([
        usersCollection.countDocuments(),
        lessonsCollection.countDocuments({ isDeleted: { $ne: true } }),
        lessonsCollection.countDocuments({ visibility: "public", isDeleted: { $ne: true } }),
        reportsCollection.countDocuments(),
        lessonsCollection.countDocuments({ createdAt: { $gte: startOfToday }, isDeleted: { $ne: true } }),
    ]);

    const lessonGrowthRaw = await lessonsCollection
        .aggregate([
            { $match: { isDeleted: { $ne: true }, createdAt: { $gte: last30 } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ])
        .toArray();

    const userGrowthRaw = await usersCollection
        .aggregate([
            { $match: { createdAt: { $gte: last30 } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ])
        .toArray();

    const fillSeries = (raw) => {
        const map = new Map(raw.map((r) => [r._id, r.count]));
        const out = [];
        for (let i = 0; i < 30; i++) {
            const d = new Date(last30);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            out.push({ date: key, count: map.get(key) || 0 });
        }
        return out;
    };

    res.send({
        totalUsers,
        totalLessons,
        publicLessons,
        totalReports,
        todaysNewLessons,
        lessonGrowth: fillSeries(lessonGrowthRaw),
        userGrowth: fillSeries(userGrowthRaw),
    });
};

const adminLessonsList = async (req, res) => {
    const { lessonsCollection, reportsCollection } = await getCollections();
    const { visibility = "all", category = "", flagged = "all" } = req.query;

    const match = { isDeleted: { $ne: true } };
    if (visibility === "public") match.visibility = "public";
    if (visibility === "private") match.visibility = "private";
    if (category) match.category = category;

    const [total, pub, priv] = await Promise.all([
        lessonsCollection.countDocuments({ isDeleted: { $ne: true } }),
        lessonsCollection.countDocuments({ isDeleted: { $ne: true }, visibility: "public" }),
        lessonsCollection.countDocuments({ isDeleted: { $ne: true }, visibility: "private" }),
    ]);

    const pipeline = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: "reports",
                localField: "_id",
                foreignField: "lessonId",
                as: "reports",
            },
        },
        { $addFields: { flagsCount: { $size: "$reports" } } },
        { $project: { reports: 0 } },
    ];

    let lessons = await lessonsCollection.aggregate(pipeline).toArray();

    if (flagged === "true") lessons = lessons.filter((l) => (l.flagsCount || 0) > 0);
    if (flagged === "false") lessons = lessons.filter((l) => (l.flagsCount || 0) === 0);

    const flaggedCountAgg = await reportsCollection
        .aggregate([{ $group: { _id: "$lessonId" } }, { $count: "uniqueFlaggedLessons" }])
        .toArray();

    res.send({
        stats: {
            total,
            public: pub,
            private: priv,
            flagged: flaggedCountAgg?.[0]?.uniqueFlaggedLessons || 0,
        },
        lessons,
    });
};

const toggleLessonVisibility = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const lesson = await lessonsCollection.findOne({ _id: oid });
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    const nextVisibility = lesson.visibility === "public" ? "private" : "public";
    await lessonsCollection.updateOne({ _id: oid }, { $set: { visibility: nextVisibility, updatedAt: new Date() } });

    res.send({ success: true, visibility: nextVisibility });
};

const setFeatured = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const { featured } = req.body;
    await lessonsCollection.updateOne({ _id: oid }, { $set: { isFeatured: !!featured, updatedAt: new Date() } });

    res.send({ success: true });
};

const setReviewed = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const { reviewed } = req.body;
    await lessonsCollection.updateOne({ _id: oid }, { $set: { isReviewed: !!reviewed, updatedAt: new Date() } });

    res.send({ success: true });
};

const hardDeleteLesson = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const result = await lessonsCollection.deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).send({ message: "Lesson not found" });
    res.send({ success: true });
};

const groupedReportedLessons = async (req, res) => {
    const { reportsCollection, usersCollection } = await getCollections();

    const grouped = await reportsCollection
        .aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$lessonId",
                    reportCount: { $sum: 1 },
                    reports: {
                        $push: {
                            _id: "$_id",
                            reason: "$reason",
                            message: "$message",
                            reporterEmail: "$reporterEmail",
                            status: "$status",
                            createdAt: "$createdAt",
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: "lessons",
                    localField: "_id",
                    foreignField: "_id",
                    as: "lesson",
                },
            },
            { $unwind: { path: "$lesson", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    lessonId: "$_id",
                    reportCount: 1,
                    reports: 1,
                    lessonTitle: "$lesson.title",
                    lessonDeleted: "$lesson.isDeleted",
                    lessonVisibility: "$lesson.visibility",
                    category: "$lesson.category",
                },
            },
            { $sort: { reportCount: -1 } },
        ])
        .toArray();

    const emails = [
        ...new Set(
            grouped.flatMap((g) => (g.reports || []).map((r) => r.reporterEmail)).filter(Boolean)
        ),
    ];

    const reporters = await usersCollection
        .find({ email: { $in: emails } })
        .project({ email: 1, name: 1, photoURL: 1 })
        .toArray();

    const rMap = new Map(reporters.map((u) => [u.email, u]));

    const out = grouped.map((g) => ({
        ...g,
        reports: (g.reports || []).map((r) => ({
            ...r,
            reporterName: rMap.get(r.reporterEmail)?.name || "",
            reporterPhotoURL: rMap.get(r.reporterEmail)?.photoURL || "",
        })),
    }));

    res.send(out);
};

const ignoreLessonReports = async (req, res) => {
    const { reportsCollection } = await getCollections();
    const lessonId = mustObjectId(req.params.lessonId);
    if (!lessonId) return res.status(400).send({ message: "Invalid lesson id" });

    const result = await reportsCollection.deleteMany({ lessonId });
    res.send({ success: true, deleted: result.deletedCount });
};

module.exports = {
    listUsersWithLessonsCount,
    makeAdmin,
    updateUserRole,
    adminStats,
    adminLessonsList,
    toggleLessonVisibility,
    setFeatured,
    setReviewed,
    hardDeleteLesson,
    groupedReportedLessons,
    ignoreLessonReports,
};