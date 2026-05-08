const { Pool } = require("pg");

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

// Remove sslmode from URL because pg can still verify certificate chain from it
connectionString = connectionString
  .replace("?sslmode=require", "")
  .replace("&sslmode=require", "");

const db = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    stripe_customer_id TEXT,
    subscription_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)
  .then(() => {
    console.log("PostgreSQL users table ready");
  })
  .catch((error) => {
    console.error("Database setup error:", error);
  });

module.exports = db;
