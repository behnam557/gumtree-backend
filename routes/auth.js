const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

router.post("/register", async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const existingUser = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db
      .prepare("INSERT INTO users (email, password) VALUES (?, ?)")
      .run(email, hashedPassword);

    const token = createToken(result.lastInsertRowid);

    res.json({
      token,
      email,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Register failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    const token = createToken(user.id);

    res.json({
      token,
      email: user.email,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

module.exports = router;
