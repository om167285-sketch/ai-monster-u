require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: process.env.TRADING_MODE || "demo",
    time: new Date().toISOString()
  });
});

app.get("/api/trading/status", (req, res) => {
  res.json({
    connected: false,
    mode: process.env.TRADING_MODE || "demo",
    botRunning: false,
    broker: null,
    message: "MT5 execution bridge is not connected yet."
  });
});

app.post("/api/trading/start", (req, res) => {
  res.status(503).json({
    ok: false,
    message:
      "Trading engine cannot start until a verified MT5 execution bridge is connected."
  });
});

app.post("/api/trading/stop", (req, res) => {
  res.json({
    ok: true,
    message: "Trading engine stop command accepted."
  });
});

app.post("/api/trading/emergency-close", (req, res) => {
  res.status(503).json({
    ok: false,
    message:
      "Emergency close requires an active MT5 execution bridge."
  });
});

app.listen(PORT, () => {
  console.log(
    AI MONSTER U backend running on port ${PORT}
  );
});
