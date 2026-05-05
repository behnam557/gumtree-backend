const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

router.get("/check", (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ active: false });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.userId);

    if (!user) {
      return res.status(401).json({ active: false });
    }

    res.json({
      active: user.subscriptionActive === 1,
      email: user.email,
    });
  } catch (error) {
    res.status(401).json({ active: false });
  }
});

module.exports = router;