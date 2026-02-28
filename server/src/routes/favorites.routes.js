const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const { verifyFBToken } = require("../middleware/auth");
const fav = require("../controllers/favorites.controller");

router.post("/", verifyFBToken, asyncHandler(fav.addFavorite));
router.get("/", verifyFBToken, asyncHandler(fav.listFavorites));
router.delete("/:id", verifyFBToken, asyncHandler(fav.removeFavorite));

module.exports = router;