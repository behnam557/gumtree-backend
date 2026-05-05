const express = require("express");
const cors = require("cors");
require("dotenv").config();
require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/billing", require("./routes/billing"));
app.use("/api/licence", require("./routes/licence"));
app.get("/", (req, res) => {
  res.send("Backend is working");
});
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port " + (process.env.PORT || 5000));
});