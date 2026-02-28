const { getCollections, mustObjectId } = require("../config/mongo");

const upsertUser = async (req, res) => {
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
};

const getUserByEmail = async (req, res) => {
    const { usersCollection } = await getCollections();
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send(user || {});
};

const checkAdminSelf = async (req, res) => {
    const { usersCollection } = await getCollections();
    const email = req.params.email;

    if (req.decoded.email !== email) return res.status(403).send({ message: "forbidden" });

    const user = await usersCollection.findOne({ email });
    res.send({ admin: user?.role === "admin" });
};

const listUsersRaw = async (req, res) => {
    const { usersCollection } = await getCollections();
    const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(users);
};

const deleteUserByEmail = async (req, res) => {
    const { usersCollection } = await getCollections();
    const email = req.params.email;

    if (req.decoded.email === email) return res.status(400).send({ message: "You cannot delete yourself" });

    const result = await usersCollection.deleteOne({ email });
    if (result.deletedCount === 0) return res.status(404).send({ message: "User not found" });
    res.send(result);
};

module.exports = {
    upsertUser,
    getUserByEmail,
    checkAdminSelf,
    listUsersRaw,
    deleteUserByEmail,
};