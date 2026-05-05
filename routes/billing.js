const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../db");

const router = express.Router();

router.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: "price_1TTQfS2LrMxK0iBVxo7QsIEj",
          quantity: 1,
        },
      ],
      success_url: "http://localhost:5000/api/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:5000/api/billing/cancel",
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/success", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    const email = session.customer_details.email;

    db.prepare("UPDATE users SET subscriptionActive = 1 WHERE email = ?").run(email);

    res.send("Payment successful. Your account is now active.");
  } catch (error) {
    res.status(500).send("Payment succeeded, but activation failed.");
  }
});

router.get("/cancel", (req, res) => {
  res.send("Payment cancelled.");
});

module.exports = router;