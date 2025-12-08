
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


        // create / upsert user
        app.post("/users", async (req, res) => {
            try {
                const user = req.body; // { email, name, photoURL, ...}
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

        // fetch single user by email
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

        // ===== Root route =====
        app.get("/", (req, res) => {
            res.send("Digital Life Lessons server is running");
        });

        // ===== Listen =====
        app.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } finally {
        // client.close() korini – server chalbe
    }
}

run().catch(console.dir);
