const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const { verifyFBToken } = require("../middleware/auth");
const { verifyAdmin } = require("../middleware/rbac");
const { verifyLessonOwnerOrAdmin } = require("../middleware/lessonAccess");
const lessons = require("../controllers/lessons.controller");

// create lesson
router.post("/", verifyFBToken, asyncHandler(lessons.createLesson));

// my lessons
router.get("/my", verifyFBToken, asyncHandler(lessons.myLessons));
router.delete("/my/:id", verifyFBToken, asyncHandler(lessons.deleteMyLesson));

// public lists
router.get("/public", asyncHandler(lessons.publicLessons));
router.get("/featured", asyncHandler(lessons.featuredLessons));
router.get("/most-saved", asyncHandler(lessons.mostSavedLessons));

// comments
router.get("/:id/comments", asyncHandler(lessons.getComments));
router.post("/:id/comments", verifyFBToken, asyncHandler(lessons.addComment));

// details + premium guard
router.get("/:id", verifyFBToken, asyncHandler(lessons.lessonDetails));

// update (owner/admin)
router.patch("/:id", verifyFBToken, verifyLessonOwnerOrAdmin, asyncHandler(lessons.updateLesson));

// like
router.patch("/:id/like", verifyFBToken, asyncHandler(lessons.toggleLike));

// ✅ admin-only existing routes under /lessons
router.get("/", verifyFBToken, verifyAdmin, asyncHandler(lessons.adminLessonsRaw));
router.delete("/:id", verifyFBToken, verifyAdmin, asyncHandler(lessons.adminDeleteLesson));

module.exports = router;