const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const stats = require("../controllers/stats.controller");

router.get("/home", asyncHandler(stats.homeStats));
router.get("/categories", asyncHandler(stats.categoriesStats));
router.get("/top-contributors", asyncHandler(stats.topContributors));
router.get("/author/:email", asyncHandler(stats.authorStats));

module.exports = router;