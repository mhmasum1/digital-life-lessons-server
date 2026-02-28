const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
        contactMessagesCollection: database.collection("contactMessages"),
    };
}

const mustObjectId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

module.exports = { getDB, getCollections, mustObjectId, ObjectId };