
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
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

async function run() {
    try {
        await client.connect();
        const db = client.db("digital_life_lessons_db");
        usersCollection = db.collection("users");

        console.log("MongoDB connected (digital_life_lessons_db)");

        // ===================== USERS APIs =====================

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
                    },
                };
                const options = { upsert: true };

                const result = await usersCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            } catch (err) {
                console.error("POST /users error:", err);
                res.status(500).send({ message: "Failed to save user" });
            }
        });

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


        app.post("/create-checkout-session", async (req, res) => {
            try {
                const { email, plan } = req.body;

                if (!email) {
                    return res.status(400).send({ message: "Email is required" });
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
                    metadata: {
                        email,
                        plan: plan || "premium_lifetime",
                    },
                    success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
                });

                res.send({ url: session.url });
            } catch (err) {
                console.error("POST /create-checkout-session error:", err);
                res.status(500).send({ message: "Failed to create checkout session" });
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
    } finally {
        // client.close() 
    }
}

run().catch(console.dir);
