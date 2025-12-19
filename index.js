require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 5000;

// ===== Middleware =====
app.use(
    cors({
        origin: process.env.SITE_DOMAIN,
        credentials: true,
    })
);
app.use(express.json());

// ===== MongoDB Connect =====
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeyfvq1.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

let usersCollection;
let lessonsCollection;

async function run() {
    try {
        await client.connect();
        const db = client.db("digital_life_lessons_db");

        usersCollection = db.collection("users");
        lessonsCollection = db.collection("lessons");

        console.log("MongoDB connected (digital_life_lessons_db)");

        // ===================== AUTH / JWT =====================
        app.post("/jwt", async (req, res) => {
            try {
                const user = req.body; // { email }
                if (!user?.email) {
                    return res.status(400).send({ message: "email required" });
                }

                const dbUser = await usersCollection.findOne({ email: user.email });
                if (!dbUser) {
                    return res.status(401).send({ message: "unauthorized" });
                }

                const token = jwt.sign(
                    { email: user.email },
                    process.env.ACCESS_TOKEN_SECRET,
                    { expiresIn: "7d" }
                );

                res.send({ token });
            } catch (err) {
                console.error("POST /jwt error:", err);
                res.status(500).send({ message: "Failed to create token" });
            }
        });

        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).send({ message: "unauthorized" });

            const token = authHeader.split(" ")[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) return res.status(401).send({ message: "unauthorized" });
                req.decoded = decoded; // { email }
                next();
            });
        };

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded?.email;
            const user = await usersCollection.findOne({ email });
            if (!user || user.role !== "admin") {
                return res.status(403).send({ message: "forbidden" });
            }
            next();
        };

        // ===================== USERS APIs =====================

        // create / upsert user
        app.post("/users", async (req, res) => {
            try {
                const user = req.body;
                if (!user?.email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const filter = { email: user.email };
                const updateDoc = {
                    $set: {
                        email: user.email,
                        name: user.name || user.displayName || "",
                        photoURL: user.photoURL || "",
                        isPremium: user.isPremium || false,
                        updatedAt: new Date(),
                    },
                    $setOnInsert: {
                        createdAt: new Date(),
                        role: "user", // ✅ default role
                    },
                };
                const options = { upsert: true };

                const result = await usersCollection.updateOne(
                    filter,
                    updateDoc,
                    options
                );
                res.send(result);
            } catch (err) {
                console.error("POST /users error:", err);
                res.status(500).send({ message: "Failed to save user" });
            }
        });

        // single user by email
        app.get("/users/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({ email });
                res.send(user || {});
            } catch (err) {
                console.error("GET /users/:email error:", err);
                res.status(500).send({ message: "Failed to fetch user" });
            }
        });

        // check admin by email (for client AdminRoute/useAdmin)
        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            try {
                const email = req.params.email;

                if (req.decoded.email !== email) {
                    return res.status(403).send({ message: "forbidden" });
                }

                const user = await usersCollection.findOne({ email });
                res.send({ admin: user?.role === "admin" });
            } catch (err) {
                console.error("GET /users/admin/:email error:", err);
                res.status(500).send({ message: "Failed to verify admin" });
            }
        });

        // admin: get all users
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const users = await usersCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(users);
            } catch (err) {
                console.error("GET /users error:", err);
                res.status(500).send({ message: "Failed to load users" });
            }
        });

        // admin: make admin
        app.patch("/users/admin/:email", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const email = req.params.email;
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { role: "admin", updatedAt: new Date() } }
                );
                res.send(result);
            } catch (err) {
                console.error("PATCH /users/admin/:email error:", err);
                res.status(500).send({ message: "Failed to make admin" });
            }
        });

        // ===================== LESSONS APIs (your existing) =====================

        app.post("/lessons", async (req, res) => {
            try {
                const lesson = req.body;

                if (!lesson?.title || !lesson?.shortDescription) {
                    return res
                        .status(400)
                        .send({ message: "Title and short description are required" });
                }

                const doc = {
                    title: lesson.title,
                    shortDescription: lesson.shortDescription,
                    details: lesson.details || "",
                    category: lesson.category || "Self-Growth",
                    emotionalTone: lesson.emotionalTone || "Reflective",
                    accessLevel: lesson.accessLevel || "free",
                    visibility: lesson.visibility || "public",
                    creatorEmail: lesson.creatorEmail || "",
                    creatorName: lesson.creatorName || "",
                    creatorPhotoURL: lesson.creatorPhotoURL || "",
                    savedCount: lesson.savedCount || 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    isDeleted: false,
                };

                const result = await lessonsCollection.insertOne(doc);
                res.send(result);
            } catch (err) {
                console.error("POST /lessons error:", err);
                res.status(500).send({ message: "Failed to create lesson" });
            }
        });

        app.get("/lessons/my", async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) {
                    return res
                        .status(400)
                        .send({ message: "email query parameter is required" });
                }

                const lessons = await lessonsCollection
                    .find({ creatorEmail: email, isDeleted: { $ne: true } })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(lessons);
            } catch (err) {
                console.error("GET /lessons/my error:", err);
                res.status(500).send({ message: "Failed to load your lessons" });
            }
        });

        app.get("/lessons/public", async (req, res) => {
            try {
                const lessons = await lessonsCollection
                    .find({ visibility: "public", isDeleted: { $ne: true } })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({ lessons });
            } catch (err) {
                console.error("GET /lessons/public error:", err);
                res.status(500).send({ message: "Failed to load public lessons" });
            }
        });

        app.get("/lessons/featured", async (req, res) => {
            try {
                const lessons = await lessonsCollection
                    .find({ visibility: "public", isDeleted: { $ne: true } })
                    .sort({ createdAt: -1 })
                    .limit(6)
                    .toArray();

                res.send({ lessons });
            } catch (err) {
                console.error("GET /lessons/featured error:", err);
                res.status(500).send({ message: "Failed to load featured lessons" });
            }
        });

        app.get("/lessons/most-saved", async (req, res) => {
            try {
                const lessons = await lessonsCollection
                    .find({ visibility: "public", isDeleted: { $ne: true } })
                    .sort({ savedCount: -1 })
                    .limit(6)
                    .toArray();

                res.send({ lessons });
            } catch (err) {
                console.error("GET /lessons/most-saved error:", err);
                res.status(500).send({ message: "Failed to load most saved lessons" });
            }
        });

        app.get("/lessons/:id", async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid lesson id" });
                }

                const lesson = await lessonsCollection.findOne({
                    _id: new ObjectId(id),
                    isDeleted: { $ne: true },
                });

                if (!lesson) {
                    return res.status(404).send({ message: "Lesson not found" });
                }

                res.send(lesson);
            } catch (err) {
                console.error("GET /lessons/:id error:", err);
                res.status(500).send({ message: "Failed to load lesson" });
            }
        });

        app.patch("/lessons/:id", async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid lesson id" });
                }

                const body = req.body || {};
                const allowedFields = [
                    "title",
                    "shortDescription",
                    "details",
                    "category",
                    "emotionalTone",
                    "accessLevel",
                    "visibility",
                ];

                const updateDoc = {
                    $set: {
                        updatedAt: new Date(),
                    },
                };

                allowedFields.forEach((field) => {
                    if (body[field] !== undefined) {
                        updateDoc.$set[field] = body[field];
                    }
                });

                const result = await lessonsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    updateDoc
                );

                res.send(result);
            } catch (err) {
                console.error("PATCH /lessons/:id error:", err);
                res.status(500).send({ message: "Failed to update lesson" });
            }
        });

        // ===================== STATS APIs =====================
        app.get("/stats/top-contributors", async (req, res) => {
            try {
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

                const contributors = await lessonsCollection
                    .aggregate(pipeline)
                    .toArray();

                res.send({ contributors });
            } catch (err) {
                console.error("GET /stats/top-contributors error:", err);
                res.status(500).send({ message: "Failed to load contributors" });
            }
        });

        // ===================== STRIPE =====================
        app.post("/create-checkout-session", async (req, res) => {
            try {
                const { email, plan } = req.body;

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
                }

                const existingUser = await usersCollection.findOne({ email });
                if (existingUser?.isPremium) {
                    return res.status(400).send({
                        message: "You are already a Premium user. Lifetime access is active.",
                    });
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
                                product_data: {
                                    name: "Digital Life Lessons Premium – Lifetime",
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    metadata: { email, plan: plan || "premium_lifetime" },
                    success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
                });

                res.send({ url: session.url });
            } catch (err) {
                console.error("POST /create-checkout-session error:", err);
                res.status(500).send({ message: "Failed to create checkout session" });
            }
        });

        app.patch("/payment-success", async (req, res) => {
            try {
                const sessionId = req.query.session_id;
                if (!sessionId) {
                    return res.status(400).send({ message: "session_id is required" });
                }

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
                        $setOnInsert: {
                            createdAt: new Date(),
                        },
                    };

                    const options = { upsert: true };
                    const result = await usersCollection.updateOne(
                        filter,
                        updateDoc,
                        options
                    );

                    return res.send({
                        success: true,
                        email,
                        transactionId: session.payment_intent,
                        paymentStatus: session.payment_status,
                        dbResult: result,
                    });
                }

                return res.send({
                    success: false,
                    message: "Payment not completed",
                    paymentStatus: session.payment_status,
                });
            } catch (err) {
                console.error("PATCH /payment-success error:", err);
                res.status(500).send({ message: "Failed to process payment success" });
            }
        });

        // ===== Root route =====
        app.get("/", (req, res) => {
            res.send("Digital Life Lessons server is running");
        });

        // ===== Listen =====
        app.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

run().catch(console.dir);
