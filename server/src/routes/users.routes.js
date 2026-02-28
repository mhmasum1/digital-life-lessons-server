const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const { verifyFBToken } = require("../middleware/auth");
const { verifyAdmin } = require("../middleware/rbac");
const {
    upsertUser,
    getUserByEmail,
    checkAdminSelf,
    listUsersRaw,
    deleteUserByEmail,
} = require("../controllers/users.controller");

router.post("/", asyncHandler(upsertUser));
router.get("/:email", asyncHandler(getUserByEmail));

router.get("/admin/:email", verifyFBToken, asyncHandler(checkAdminSelf));
router.get("/", verifyFBToken, verifyAdmin, asyncHandler(listUsersRaw));
router.delete("/:email", verifyFBToken, verifyAdmin, asyncHandler(deleteUserByEmail));

module.exports = router;