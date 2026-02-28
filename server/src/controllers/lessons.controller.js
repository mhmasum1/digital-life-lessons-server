const { getCollections, mustObjectId } = require("../config/mongo");
const { getIsPremium } = require("../middleware/lessonAccess");

const createLesson = async (req, res) => {
    const { lessonsCollection, usersCollection } = await getCollections();
    const lesson = req.body;

    if (!lesson?.title || !lesson?.shortDescription) {
        return res.status(400).send({ message: "Title and short description are required" });
    }

    const creatorEmail = req.decoded.email;
    const user = await usersCollection.findOne({ email: creatorEmail });

    const doc = {
        title: lesson.title,
        shortDescription: lesson.shortDescription,
        details: lesson.details || "",
        category: lesson.category || "Self-Growth",
        emotionalTone: lesson.emotionalTone || "Reflective",
        accessLevel: lesson.accessLevel || "free",
        visibility: lesson.visibility || "public",
        creatorEmail,
        creatorName: lesson.creatorName || user?.name || "",
        creatorPhotoURL: lesson.creatorPhotoURL || user?.photoURL || "",
        savedCount: 0,
        likesCount: 0,
        likes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        isFeatured: false,
        isReviewed: false,
    };

    const result = await lessonsCollection.insertOne(doc);
    res.send(result);
};

const myLessons = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const email = req.query.email;
    if (!email) return res.status(400).send({ message: "email query parameter is required" });

    if (email !== req.decoded.email) return res.status(403).send({ message: "forbidden" });

    const lessons = await lessonsCollection
        .find({ creatorEmail: email, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .toArray();

    res.send(lessons);
};

const deleteMyLesson = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const email = req.decoded?.email;
    const lesson = await lessonsCollection.findOne({ _id: oid });

    if (!lesson || lesson.isDeleted === true) return res.status(404).send({ message: "Lesson not found" });
    if (lesson.creatorEmail !== email) return res.status(403).send({ message: "forbidden" });

    const result = await lessonsCollection.updateOne(
        { _id: oid },
        { $set: { isDeleted: true, updatedAt: new Date() } }
    );

    res.send(result);
};

const publicLessons = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const { search = "", category = "", tone = "", sort = "newest", page = "1", limit = "9" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
    const skip = (pageNum - 1) * limitNum;

    const filter = { visibility: "public", isDeleted: { $ne: true } };

    if (category) filter.category = category;
    if (tone) filter.emotionalTone = tone;

    if (search.trim()) {
        filter.$or = [
            { title: { $regex: search.trim(), $options: "i" } },
            { shortDescription: { $regex: search.trim(), $options: "i" } },
        ];
    }

    const sortDoc = sort === "mostSaved" ? { savedCount: -1, createdAt: -1 } : { createdAt: -1 };

    const [lessons, total] = await Promise.all([
        lessonsCollection.find(filter).sort(sortDoc).skip(skip).limit(limitNum).toArray(),
        lessonsCollection.countDocuments(filter),
    ]);

    res.send({
        lessons,
        pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
};

const featuredLessons = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const lessons = await lessonsCollection
        .find({ visibility: "public", isDeleted: { $ne: true }, isFeatured: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
    res.send({ lessons });
};

const mostSavedLessons = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const lessons = await lessonsCollection
        .find({ visibility: "public", isDeleted: { $ne: true } })
        .sort({ savedCount: -1 })
        .limit(6)
        .toArray();
    res.send({ lessons });
};

const lessonDetails = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const lesson = await lessonsCollection.findOne({ _id: oid, isDeleted: { $ne: true } });
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    if (lesson.accessLevel === "premium") {
        const email = req.decoded?.email;
        const isOwner = lesson.creatorEmail === email;
        const isPremium = await getIsPremium(email);
        if (!isPremium && !isOwner) return res.status(403).send({ message: "Premium access required" });
    }

    res.send(lesson);
};

const updateLesson = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const body = req.body || {};
    const allowedFields = ["title", "shortDescription", "details", "category", "emotionalTone", "accessLevel", "visibility"];

    const updateDoc = { $set: { updatedAt: new Date() } };
    for (const f of allowedFields) if (body[f] !== undefined) updateDoc.$set[f] = body[f];

    const result = await lessonsCollection.updateOne({ _id: oid }, updateDoc);
    res.send(result);
};

const toggleLike = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const userId = req.decoded.email;
    const lesson = await lessonsCollection.findOne({ _id: oid, isDeleted: { $ne: true } });
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    const likes = lesson.likes || [];
    const hasLiked = likes.includes(userId);

    if (hasLiked) {
        await lessonsCollection.updateOne({ _id: oid }, { $pull: { likes: userId }, $inc: { likesCount: -1 } });
    } else {
        await lessonsCollection.updateOne({ _id: oid }, { $addToSet: { likes: userId }, $inc: { likesCount: 1 } });
    }

    const updatedLesson = await lessonsCollection.findOne({ _id: oid });
    res.send({ success: true, liked: !hasLiked, likesCount: updatedLesson?.likesCount || 0 });
};

const getComments = async (req, res) => {
    const { commentsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const comments = await commentsCollection.find({ lessonId: oid }).sort({ createdAt: -1 }).toArray();
    res.send({ comments });
};

const addComment = async (req, res) => {
    const { commentsCollection, usersCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const { comment } = req.body;
    if (!comment || !comment.trim()) return res.status(400).send({ message: "Comment text is required" });

    const userEmail = req.decoded.email;
    const user = await usersCollection.findOne({ email: userEmail });

    const commentDoc = {
        lessonId: oid,
        userName: user?.name || "Anonymous",
        userEmail,
        userPhoto: user?.photoURL || "",
        text: comment.trim(),
        createdAt: new Date(),
    };

    const result = await commentsCollection.insertOne(commentDoc);
    const createdComment = await commentsCollection.findOne({ _id: result.insertedId });
    res.send(createdComment);
};

// admin-only: list lessons at /lessons (existing)
const adminLessonsRaw = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const lessons = await lessonsCollection.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).toArray();
    res.send(lessons);
};

// admin-only: soft delete at /lessons/:id (existing)
const adminDeleteLesson = async (req, res) => {
    const { lessonsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

    const result = await lessonsCollection.updateOne(
        { _id: oid },
        { $set: { isDeleted: true, updatedAt: new Date() } }
    );
    res.send(result);
};

module.exports = {
    createLesson,
    myLessons,
    deleteMyLesson,
    publicLessons,
    featuredLessons,
    mostSavedLessons,
    lessonDetails,
    updateLesson,
    toggleLike,
    getComments,
    addComment,
    adminLessonsRaw,
    adminDeleteLesson,
};