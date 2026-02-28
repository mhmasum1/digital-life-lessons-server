const router = require("express").Router();
const { asyncHandler } = require("../middleware/asyncHandler");
const pay = require("../controllers/payments.controller");

// keep same root endpoints
router.post("/create-checkout-session", asyncHandler(pay.createCheckoutSession));
router.patch("/payment-success", asyncHandler(pay.paymentSuccess));

module.exports = router;