const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const stats = require("../controllers/stats.controller");

router.get("/top-contributors", asyncHandler(stats.topContributors));
router.get("/author/:email", asyncHandler(stats.authorStats));

module.exports = router;