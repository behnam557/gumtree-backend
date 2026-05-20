const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

router.get("/check", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ active: false });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      "SELECT id, email, subscription_active, access_expires_at FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ active: false });
    }

    const user = result.rows[0];

    const now = new Date();
    const expiresAt = user.access_expires_at
      ? new Date(user.access_expires_at)
      : null;

    const active =
      user.subscription_active === true &&
      expiresAt &&
      expiresAt > now;

    if (user.subscription_active === true && (!expiresAt || expiresAt <= now)) {
      await db.query(
        "UPDATE users SET subscription_active = false WHERE id = $1",
        [user.id]
      );
    }

    res.json({
      active: active,
      email: user.email,
      accessExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    });
  } catch (error) {
    console.error("Licence check error:", error);
    res.status(401).json({ active: false });
  }
});

module.exports = router;
