require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Firebase Admin SDK
const admin = require("firebase-admin");

const path = require("path");
const serviceAccount = require(
    path.join(__dirname, "..", "digital-life-lessons-firebase-adminsdk.json")
);


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

if (!process.env.STRIPE_SECRET) console.warn("⚠️ STRIPE_SECRET is missing in .env");
const stripe = process.env.STRIPE_SECRET ? require("stripe")(process.env.STRIPE_SECRET) : null;

const app = express();

// ===== Middleware =====
const allowedOrigin = process.env.SITE_DOMAIN;

app.use(
    cors({
        origin: allowedOrigin ? [allowedOrigin] : true,
        credentials: true,
    })
);
app.use(express.json());

// ===== Helpers =====
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const mustObjectId = (id) => {
    if (!ObjectId.isValid(id)) return null;
    return new ObjectId(id);
};

// ===== Mongo (serverless cache) =====
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeyfvq1.mongodb.net/?appName=Cluster0`;

const globalCache =
    globalThis.__mongoCache || (globalThis.__mongoCache = { client: null, db: null, promise: null });

async function getDB() {
    if (globalCache.db) return globalCache.db;
    if (globalCache.promise) return globalCache.promise;

    globalCache.promise = (async () => {
        const client = new MongoClient(uri, {
            serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        });

        await client.connect();
        const db = client.db("digital_life_lessons_db");

        globalCache.client = client;
        globalCache.db = db;

        console.log("MongoDB connected (digital_life_lessons_db)");
        return db;
    })();

    return globalCache.promise;
}

async function getCollections() {
    const database = await getDB();
    return {
        usersCollection: database.collection("users"),
        lessonsCollection: database.collection("lessons"),
        reportsCollection: database.collection("reports"),
        favoritesCollection: database.collection("favorites"),
        commentsCollection: database.collection("comments"),
    };
}

// ===== Auth (Firebase Admin token verify) =====
const verifyFBToken = async (req, res, next) => {
    const authHeader = req.headers.authorization; // "Bearer <token>"
    if (!authHeader) return res.status(401).send({ message: "unauthorized" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).send({ message: "unauthorized" });

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded; // decoded.email, decoded.uid
        next();
    } catch (err) {
        return res.status(401).send({ message: "unauthorized" });
    }
};

const verifyAdmin = asyncHandler(async (req, res, next) => {
    const { usersCollection } = await getCollections();
    const email = req.decoded?.email;
    const user = await usersCollection.findOne({ email });
    if (!user || user.role !== "admin") return res.status(403).send({ message: "forbidden" });
    next();
});

const getIsPremium = async (email) => {
    if (!email) return false;
    const { usersCollection } = await getCollections();
    const u = await usersCollection.findOne({ email }, { projection: { isPremium: 1 } });
    return !!u?.isPremium;
};

// ✅ Owner/Admin middleware for lesson update/delete
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

    req.lesson = lesson; // optional
    next();
});

// ===== Routes =====
app.get("/", (req, res) => res.send("Digital Life Lessons server is running ✅"));

// ===== Users =====
app.post(
    "/users",
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const user = req.body;
        if (!user?.email) return res.status(400).send({ message: "Email is required" });

        const filter = { email: user.email };
        const updateDoc = {
            $set: {
                email: user.email,
                name: user.name || user.displayName || "",
                photoURL: user.photoURL || "",
                updatedAt: new Date(),
            },
            $setOnInsert: {
                createdAt: new Date(),
                role: "user",
                isPremium: false,
            },
        };

        const result = await usersCollection.updateOne(filter, updateDoc, { upsert: true });
        res.send(result);
    })
);

app.get(
    "/users/:email",
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const user = await usersCollection.findOne({ email: req.params.email });
        res.send(user || {});
    })
);

// ✅ Admin check (protected)
app.get(
    "/users/admin/:email",
    verifyFBToken,
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const email = req.params.email;

        // user can only check self
        if (req.decoded.email !== email) return res.status(403).send({ message: "forbidden" });

        const user = await usersCollection.findOne({ email });
        res.send({ admin: user?.role === "admin" });
    })
);

// ✅ Admin: list users
app.get(
    "/users",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(users);
    })
);

app.patch(
    "/admin/users/:id/make-admin",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid user id" });

        const result = await usersCollection.updateOne(
            { _id: oid },
            { $set: { role: "admin", updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) return res.status(404).send({ message: "User not found" });
        res.send(result);
    })
);

app.delete(
    "/users/:email",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { usersCollection } = await getCollections();
        const email = req.params.email;

        if (req.decoded.email === email) return res.status(400).send({ message: "You cannot delete yourself" });

        const result = await usersCollection.deleteOne({ email });
        if (result.deletedCount === 0) return res.status(404).send({ message: "User not found" });

        res.send(result);
    })
);

// ===== Admin stats =====
app.get(
    "/admin/stats",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { usersCollection, lessonsCollection, reportsCollection } = await getCollections();

        const [totalUsers, totalLessons, publicLessons, totalReports] = await Promise.all([
            usersCollection.countDocuments(),
            lessonsCollection.countDocuments({ isDeleted: { $ne: true } }),
            lessonsCollection.countDocuments({ visibility: "public", isDeleted: { $ne: true } }),
            reportsCollection.countDocuments(),
        ]);

        res.send({ totalUsers, totalLessons, publicLessons, totalReports });
    })
);

// ===== Lessons =====

// ✅ Create lesson (PROTECTED) + creatorEmail from token
app.post(
    "/lessons",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
            // 🔐 Trust token/db user info
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
    })
);

// My lessons (recommended: protect + force email match)
app.get(
    "/lessons/my",
    verifyFBToken,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "email query parameter is required" });

        if (email !== req.decoded.email) return res.status(403).send({ message: "forbidden" });

        const lessons = await lessonsCollection
            .find({ creatorEmail: email, isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .toArray();

        res.send(lessons);
    })
);

// Delete my lesson (owner) — keep your old endpoint but use token verify
app.delete(
    "/lessons/my/:id",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
    })
);

// ✅ Public list: show ALL public lessons (free + premium)
app.get(
    "/lessons/public",
    asyncHandler(async (req, res) => {
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
    })
);

// Featured
app.get(
    "/lessons/featured",
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const lessons = await lessonsCollection
            .find({ visibility: "public", isDeleted: { $ne: true }, isFeatured: true })
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray();
        res.send({ lessons });
    })
);

// Most-saved
app.get(
    "/lessons/most-saved",
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const lessons = await lessonsCollection
            .find({ visibility: "public", isDeleted: { $ne: true } })
            .sort({ savedCount: -1 })
            .limit(6)
            .toArray();
        res.send({ lessons });
    })
);

// ✅ Details: login required + premium guard (+ owner can view)
app.get(
    "/lessons/:id",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
    })
);

// ✅ Update lesson (owner/admin protected)
app.patch(
    "/lessons/:id",
    verifyFBToken,
    verifyLessonOwnerOrAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const body = req.body || {};
        const allowedFields = ["title", "shortDescription", "details", "category", "emotionalTone", "accessLevel", "visibility"];

        const updateDoc = { $set: { updatedAt: new Date() } };
        for (const f of allowedFields) if (body[f] !== undefined) updateDoc.$set[f] = body[f];

        // 🔐 never allow creatorEmail to be changed
        if (updateDoc.$set.creatorEmail) delete updateDoc.$set.creatorEmail;

        const result = await lessonsCollection.updateOne({ _id: oid }, updateDoc);
        res.send(result);
    })
);

// Like
app.patch(
    "/lessons/:id/like",
    verifyFBToken,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const userId = req.decoded.email; // using email as unique
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
    })
);

// Comments
app.get(
    "/lessons/:id/comments",
    asyncHandler(async (req, res) => {
        const { commentsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const comments = await commentsCollection.find({ lessonId: oid }).sort({ createdAt: -1 }).toArray();
        res.send({ comments });
    })
);

app.post(
    "/lessons/:id/comments",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
    })
);

// ===== Admin lessons =====
app.get(
    "/lessons",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const lessons = await lessonsCollection.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).toArray();
        res.send(lessons);
    })
);

app.delete(
    "/lessons/:id",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const result = await lessonsCollection.updateOne(
            { _id: oid },
            { $set: { isDeleted: true, updatedAt: new Date() } }
        );
        res.send(result);
    })
);

app.delete(
    "/admin/lessons/:id/hard-delete",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const result = await lessonsCollection.deleteOne({ _id: oid });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Lesson not found" });
        res.send({ success: true });
    })
);

app.patch(
    "/admin/lessons/:id/toggle-visibility",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const lesson = await lessonsCollection.findOne({ _id: oid });
        if (!lesson) return res.status(404).send({ message: "Lesson not found" });

        const nextVisibility = lesson.visibility === "public" ? "private" : "public";
        await lessonsCollection.updateOne({ _id: oid }, { $set: { visibility: nextVisibility, updatedAt: new Date() } });

        res.send({ success: true, visibility: nextVisibility });
    })
);

app.patch(
    "/admin/lessons/:id/featured",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const { featured } = req.body;
        await lessonsCollection.updateOne({ _id: oid }, { $set: { isFeatured: !!featured, updatedAt: new Date() } });

        res.send({ success: true });
    })
);

app.patch(
    "/admin/lessons/:id/reviewed",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid lesson id" });

        const { reviewed } = req.body;
        await lessonsCollection.updateOne({ _id: oid }, { $set: { isReviewed: !!reviewed, updatedAt: new Date() } });

        res.send({ success: true });
    })
);

// ===== Stats =====
app.get(
    "/stats/top-contributors",
    asyncHandler(async (req, res) => {
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
    })
);

// ===== Reports =====
app.post(
    "/reports",
    verifyFBToken,
    asyncHandler(async (req, res) => {
        const { reportsCollection } = await getCollections();
        const { lessonId, reason, message } = req.body;

        const oid = mustObjectId(lessonId);
        if (!oid) return res.status(400).send({ message: "Valid lessonId is required" });

        const doc = {
            lessonId: oid,
            reason: reason || "Other",
            message: message || "",
            reporterEmail: req.decoded.email,
            status: "pending",
            createdAt: new Date(),
        };

        const result = await reportsCollection.insertOne(doc);
        res.send(result);
    })
);

app.get(
    "/reports",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { reportsCollection } = await getCollections();
        const reports = await reportsCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(reports);
    })
);

app.patch(
    "/reports/:id/resolve",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { reportsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid report id" });

        const result = await reportsCollection.updateOne(
            { _id: oid },
            { $set: { status: "resolved", resolvedAt: new Date() } }
        );
        res.send(result);
    })
);

app.delete(
    "/reports/:id",
    verifyFBToken,
    verifyAdmin,
    asyncHandler(async (req, res) => {
        const { reportsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid report id" });

        const result = await reportsCollection.deleteOne({ _id: oid });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Report not found" });

        res.send({ success: true });
    })
);

// ===== Favorites =====
app.post(
    "/favorites",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
    })
);

app.get(
    "/favorites",
    verifyFBToken,
    asyncHandler(async (req, res) => {
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
    })
);

app.delete(
    "/favorites/:id",
    verifyFBToken,
    asyncHandler(async (req, res) => {
        const { favoritesCollection, lessonsCollection } = await getCollections();
        const oid = mustObjectId(req.params.id);
        if (!oid) return res.status(400).send({ message: "Invalid favorite id" });

        const email = req.decoded.email;
        const fav = await favoritesCollection.findOne({ _id: oid });

        if (!fav || fav.userEmail !== email) return res.status(403).send({ message: "forbidden" });

        const result = await favoritesCollection.deleteOne({ _id: oid });

        await lessonsCollection.updateOne({ _id: fav.lessonId, savedCount: { $gt: 0 } }, { $inc: { savedCount: -1 } });
        res.send(result);
    })
);

// ===== Stripe =====
app.post(
    "/create-checkout-session",
    asyncHandler(async (req, res) => {
        if (!stripe) return res.status(500).send({ message: "Stripe not configured" });

        const { usersCollection } = await getCollections();
        const { email, plan } = req.body;

        if (!email) return res.status(400).send({ message: "Email is required" });

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser?.isPremium) {
            return res.status(400).send({ message: "You are already a Premium user. Lifetime access is active." });
        }

        const amount = 1500 * 100;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            customer_email: email,
            line_items: [
                {
                    price_data: {
                        currency: "bdt",
                        unit_amount: amount,
                        product_data: { name: "Digital Life Lessons Premium – Lifetime" },
                    },
                    quantity: 1,
                },
            ],
            metadata: { email, plan: plan || "premium_lifetime" },
            success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
        });

        res.send({ url: session.url });
    })
);

app.patch(
    "/payment-success",
    asyncHandler(async (req, res) => {
        if (!stripe) return res.status(500).send({ message: "Stripe not configured" });

        const { usersCollection } = await getCollections();
        const sessionId = req.query.session_id;
        if (!sessionId) return res.status(400).send({ message: "session_id is required" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const email = session.customer_email || session.metadata?.email;

        if (session.payment_status === "paid" && email) {
            const filter = { email };
            const updateDoc = {
                $set: {
                    email,
                    isPremium: true,
                    premiumSince: new Date(),
                    lastTransactionId: session.payment_intent,
                },
                $setOnInsert: { createdAt: new Date() },
            };

            const result = await usersCollection.updateOne(filter, updateDoc, { upsert: true });

            return res.send({
                success: true,
                email,
                transactionId: session.payment_intent,
                paymentStatus: session.payment_status,
                dbResult: result,
            });
        }

        res.send({ success: false, message: "Payment not completed", paymentStatus: session.payment_status });
    })
);

// ===== Error handler =====
app.use((err, req, res, next) => {
    console.error("API Error:", err);
    res.status(500).send({ message: "Server error" });
});

module.exports = app;

if (require.main === module) {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
}
