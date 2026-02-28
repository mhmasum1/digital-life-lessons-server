const { getCollections } = require("../config/mongo");

const createContactMessage = async (req, res) => {
    const { contactMessagesCollection } = await getCollections();
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !subject || !message) {
        return res.status(400).send({ message: "All fields are required" });
    }

    const doc = {
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        createdAt: new Date(),
        status: "new",
    };

    const result = await contactMessagesCollection.insertOne(doc);
    res.send({ success: true, insertedId: result.insertedId });
};

module.exports = { createContactMessage };