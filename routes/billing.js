const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const bodyParser = require("body-parser");
const db = require("../db");

// CREATE CHECKOUT SESSION
router.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: "https://gumtree.com",
      cancel_url: "https://gumtree.com",
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STRIPE WEBHOOK (THIS IS THE IMPORTANT PART)
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("Webhook error:", err.message);
      return res.sendStatus(400);
    }

    // PAYMENT SUCCESS
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = session.customer_details.email;

      console.log("Payment received from:", email);

      try {
        // 🔥 THIS MATCHES YOUR LICENCE SYSTEM
        db.prepare("UPDATE users SET licence = 1 WHERE email = ?").run(email);
      } catch (err) {
        console.log("DB error:", err);
      }
    }

    res.sendStatus(200);
  }
);

module.exports = router;
