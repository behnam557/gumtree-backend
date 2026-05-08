const express = require("express");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../db");

const router = express.Router();

router.post("/create-checkout-session", express.json(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Login required." });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userResult = await db.query(
      "SELECT * FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "User not found." });
    }

    const user = userResult.rows[0];

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({ message: "Stripe price ID missing." });
    }

    let stripeCustomerId = user.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: String(user.id),
        },
      });

      stripeCustomerId = customer.id;

      await db.query(
        "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
        [stripeCustomerId, user.id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      client_reference_id: String(user.id),
      metadata: {
        userId: String(user.id),
        email: user.email,
      },
      success_url:
        "https://gumtree-backend-9aaz.onrender.com/api/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://gumtree-backend-9aaz.onrender.com/api/billing/cancel",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: error.message || "Checkout failed." });
  }
});

router.get("/success", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.query.session_id
    );

    const userId = session.metadata && session.metadata.userId;
    const customerId = session.customer;

    if (userId) {
      await db.query(
        "UPDATE users SET subscription_active = true, stripe_customer_id = $1 WHERE id = $2",
        [customerId, userId]
      );
    }

    res.send("Payment successful. You can close this page and reopen CrossPoster.");
  } catch (error) {
    console.error("Success activation error:", error);
    res.status(500).send("Payment succeeded, but activation failed.");
  }
});

router.get("/cancel", (req, res) => {
  res.send("Payment cancelled. You can close this page.");
});

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("Webhook signature failed:", error.message);
      return res.status(400).send("Webhook Error: " + error.message);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata && session.metadata.userId;
        const customerId = session.customer;

        if (userId) {
          await db.query(
            "UPDATE users SET subscription_active = true, stripe_customer_id = $1 WHERE id = $2",
            [customerId, userId]
          );
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await db.query(
          "UPDATE users SET subscription_active = false WHERE stripe_customer_id = $1",
          [customerId]
        );
      }

      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        await db.query(
          "UPDATE users SET subscription_active = false WHERE stripe_customer_id = $1",
          [customerId]
        );
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook handling error:", error);
      res.status(500).json({ message: "Webhook handling failed." });
    }
  }
);

module.exports = router;
