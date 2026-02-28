const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const { verifyFBToken } = require("../middleware/auth");
const { verifyAdmin } = require("../middleware/rbac");
const reports = require("../controllers/reports.controller");

router.post("/", verifyFBToken, asyncHandler(reports.createReport));
router.get("/", verifyFBToken, verifyAdmin, asyncHandler(reports.listReports));
router.patch("/:id/resolve", verifyFBToken, verifyAdmin, asyncHandler(reports.resolveReport));
router.delete("/:id", verifyFBToken, verifyAdmin, asyncHandler(reports.deleteReport));

module.exports = router;