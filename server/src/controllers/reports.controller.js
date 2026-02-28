const { getCollections, mustObjectId } = require("../config/mongo");

const createReport = async (req, res) => {
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
};

const listReports = async (req, res) => {
    const { reportsCollection } = await getCollections();
    const reports = await reportsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(reports);
};

const resolveReport = async (req, res) => {
    const { reportsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid report id" });

    const result = await reportsCollection.updateOne(
        { _id: oid },
        { $set: { status: "resolved", resolvedAt: new Date() } }
    );
    res.send(result);
};

const deleteReport = async (req, res) => {
    const { reportsCollection } = await getCollections();
    const oid = mustObjectId(req.params.id);
    if (!oid) return res.status(400).send({ message: "Invalid report id" });

    const result = await reportsCollection.deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).send({ message: "Report not found" });

    res.send({ success: true });
};

module.exports = { createReport, listReports, resolveReport, deleteReport };