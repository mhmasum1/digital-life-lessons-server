const { stripe } = require("../config/stripe");
const { getCollections } = require("../config/mongo");

const createCheckoutSession = async (req, res) => {
    if (!stripe) return res.status(500).send({ message: "Stripe not configured" });

    const { usersCollection } = await getCollections();
    const { email, plan } = req.body;

    if (!email) return res.status(400).send({ message: "Email is required" });

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser?.isPremium) {
        return res.status(400).send({ message: "You are already a Premium user. Lifetime access is active." });
    }

    const amount = 1500 * 100;

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: email,
        line_items: [
            {
                price_data: {
                    currency: "bdt",
                    unit_amount: amount,
                    product_data: { name: "Digital Life Lessons Premium – Lifetime" },
                },
                quantity: 1,
            },
        ],
        metadata: { email, plan: plan || "premium_lifetime" },
        success_url: `${process.env.SITE_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment/cancel`,
    });

    res.send({ url: session.url });
};

const paymentSuccess = async (req, res) => {
    if (!stripe) return res.status(500).send({ message: "Stripe not configured" });

    const { usersCollection } = await getCollections();
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).send({ message: "session_id is required" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const email = session.customer_email || session.metadata?.email;

    if (session.payment_status === "paid" && email) {
        const filter = { email };
        const updateDoc = {
            $set: {
                email,
                isPremium: true,
                premiumSince: new Date(),
                lastTransactionId: session.payment_intent,
            },
            $setOnInsert: { createdAt: new Date() },
        };

        const result = await usersCollection.updateOne(filter, updateDoc, { upsert: true });

        return res.send({
            success: true,
            email,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            dbResult: result,
        });
    }

    res.send({ success: false, message: "Payment not completed", paymentStatus: session.payment_status });
};

module.exports = { createCheckoutSession, paymentSuccess };