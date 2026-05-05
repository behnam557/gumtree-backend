const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../db");

router.post("/create-checkout-session", async (req, res) => {
  try {
    console.log("Creating checkout session...");
    console.log("STRIPE_PRICE_ID:", process.env.STRIPE_PRICE_ID ? "exists" : "missing");
    console.log("STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY ? "exists" : "missing");

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ message: "Missing STRIPE_SECRET_KEY" });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({ message: "Missing STRIPE_PRICE_ID" });
    }

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
  } catch (error) {
    console.error("Stripe checkout error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature error:", error.message);
    return res.sendStatus(400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;

    console.log("Payment completed:", email);

    if (email) {
      try {
        db.prepare("UPDATE users SET subscriptionActive = 1 WHERE email = ?").run(email);
        console.log("Licence activated for:", email);
      } catch (error) {
        console.error("Database activation error:", error.message);
      }
    }
  }

  res.sendStatus(200);
});

module.exports = router;
