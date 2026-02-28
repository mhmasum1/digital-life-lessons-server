const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const { verifyFBToken } = require("../middleware/auth");
const { verifyAdmin } = require("../middleware/rbac");
const admin = require("../controllers/admin.controller");

router.get("/users", verifyFBToken, verifyAdmin, asyncHandler(admin.listUsersWithLessonsCount));
router.patch("/users/:id/make-admin", verifyFBToken, verifyAdmin, asyncHandler(admin.makeAdmin));
router.patch("/users/:id/role", verifyFBToken, verifyAdmin, asyncHandler(admin.updateUserRole));

router.get("/stats", verifyFBToken, verifyAdmin, asyncHandler(admin.adminStats));

// lessons admin list + actions
router.get("/lessons", verifyFBToken, verifyAdmin, asyncHandler(admin.adminLessonsList));
router.patch("/lessons/:id/toggle-visibility", verifyFBToken, verifyAdmin, asyncHandler(admin.toggleLessonVisibility));
router.patch("/lessons/:id/featured", verifyFBToken, verifyAdmin, asyncHandler(admin.setFeatured));
router.patch("/lessons/:id/reviewed", verifyFBToken, verifyAdmin, asyncHandler(admin.setReviewed));
router.delete("/lessons/:id/hard-delete", verifyFBToken, verifyAdmin, asyncHandler(admin.hardDeleteLesson));

// reported lessons grouping
router.get("/reported-lessons", verifyFBToken, verifyAdmin, asyncHandler(admin.groupedReportedLessons));
router.delete("/reported-lessons/:lessonId", verifyFBToken, verifyAdmin, asyncHandler(admin.ignoreLessonReports));

module.exports = router;