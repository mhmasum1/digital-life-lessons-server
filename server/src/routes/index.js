const router = require("express").Router();

router.use("/users", require("./users.routes"));
router.use("/lessons", require("./lessons.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/reports", require("./reports.routes"));
router.use("/favorites", require("./favorites.routes"));
router.use("/contact-messages", require("./contact.routes"));
router.use("/", require("./payments.routes"));
router.use("/stats", require("./stats.routes"));

module.exports = router;