const express = require("express");
const cors = require("cors");

require("dotenv").config();
require("./db");

const app = express();

app.use(cors());

// Stripe billing routes must come BEFORE express.json()
// because webhook needs raw body
app.use("/api/billing", require("./routes/billing"));

// Normal JSON routes
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/licence", require("./routes/licence"));

app.get("/", (req, res) => {
  res.send("Backend is working");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
