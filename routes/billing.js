const express = require("express");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../db");

const router = express.Router();

async function sendEmail({ to, subject, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Resend API error: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function sendOwnerPaymentEmail({
  customerEmail,
  amountTotal,
  currency,
  stripeCustomerId,
  stripeSessionId,
}) {
  const formattedAmount =
    typeof amountTotal === "number"
      ? `£${(amountTotal / 100).toFixed(2)}`
      : `Unknown ${(currency || "").toUpperCase()}`;

  const result = await sendEmail({
    to: process.env.OWNER_NOTIFICATION_EMAIL,
    subject: "New CrossPoster payment received",
    text:
      "A new payment has been received.\n\n" +
      "Customer email: " + (customerEmail || "Unknown") + "\n" +
      "Amount: " + formattedAmount + "\n" +
      "Currency: " + String(currency || "").toUpperCase() + "\n" +
      "Stripe customer ID: " + (stripeCustomerId || "Unknown") + "\n" +
      "Checkout session ID: " + (stripeSessionId || "Unknown"),
  });

  console.log("Owner payment email sent:", result);
}

async function sendCustomerPaymentEmail({
  customerEmail,
  amountTotal,
  currency,
}) {
  if (!customerEmail) {
    console.log("Customer email skipped: no customer email found");
    return;
  }

  const formattedAmount =
    typeof amountTotal === "number"
      ? `£${(amountTotal / 100).toFixed(2)}`
      : `Unknown ${(currency || "").toUpperCase()}`;

  const result = await sendEmail({
    to: customerEmail,
    subject: "Your CrossPoster subscription is active",
    text:
      "Thank you for your payment.\n\n" +
      "Your CrossPoster subscription is now active.\n\n" +
      "Amount paid: " + formattedAmount + "\n" +
      "Currency: " + String(currency || "").toUpperCase() + "\n\n" +
      "If you need help, please contact: " +
      (process.env.SUPPORT_EMAIL || "crossposterhelp@gmail.com"),
  });

  console.log("Customer payment email sent:", result);
}

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
      mode: "payment",
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
        const customerEmail =
          (session.customer_details && session.customer_details.email) ||
          (session.metadata && session.metadata.email) ||
          "";

        console.log(
          "Webhook checkout.session.completed received for:",
          customerEmail || "Unknown"
        );

        if (userId) {
          await db.query(
            "UPDATE users SET subscription_active = true, stripe_customer_id = $1 WHERE id = $2",
            [customerId, userId]
          );
        }

        try {
          await sendOwnerPaymentEmail({
            customerEmail,
            amountTotal: session.amount_total,
            currency: session.currency,
            stripeCustomerId: customerId,
            stripeSessionId: session.id,
          });
        } catch (emailError) {
          console.error("Owner email send failed:", emailError);
        }

        try {
          await sendCustomerPaymentEmail({
            customerEmail,
            amountTotal: session.amount_total,
            currency: session.currency,
          });
        } catch (emailError) {
          console.error("Customer email send failed:", emailError);
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
