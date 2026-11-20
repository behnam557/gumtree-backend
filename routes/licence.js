const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

router.get("/check", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Login required."
    });
  }

  const token = authHeader.slice(7).trim();

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error("Licence token error:", error.name, error.message);

    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        message: "Login expired."
      });
    }

    return res.status(500).json({
      message: "Could not verify login."
    });
  }

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "User not found."
      });
    }

    const user = result.rows[0];

    const manualAccessActive =
      !!user.access_expires_at &&
      new Date(user.access_expires_at).getTime() > Date.now();

    const active =
      user.subscription_active === true ||
      manualAccessActive;

    return res.json({
      active,
      email: user.email,
      access_expires_at: user.access_expires_at || null
    });
  } catch (error) {
    console.error("Licence database error:", error);

    // Database/Supabase/Render failure is not an authentication failure.
    // 503 tells the extension to keep the last verified licence state.
    return res.status(503).json({
      message: "Licence service temporarily unavailable."
    });
  }
});

module.exports = router;
