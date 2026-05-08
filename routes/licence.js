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
      "SELECT * FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ active: false });
    }

    const user = result.rows[0];

    res.json({
      active: user.subscription_active === true,
      email: user.email,
    });
  } catch (error) {
    console.error("Licence check error:", error);
    res.status(401).json({ active: false });
  }
});

module.exports = router;
