
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

        // ===== Root route =====
        app.get("/", (req, res) => {
            res.send("Digital Life Lessons server is running");
        });

        // ===== Listen after DB connection =====
        app.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } finally {
        // client.close() korini – server chalbe
    }
}

run().catch(console.dir);
