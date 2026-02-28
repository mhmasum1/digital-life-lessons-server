const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const contact = require("../controllers/contact.controller");

router.post("/", asyncHandler(contact.createContactMessage));

module.exports = router;