import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;
const TRADING_MODE = process.env.TRADING_MODE || "demo";

let botRunning = false;

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: TRADING_MODE,
    time: new Date().toISOString()
  });
});

app.get("/api/trading/status", (req, res) => {
  res.json({
    connected: false,
    mode: TRADING_MODE,
    botRunning,
    broker: null,
    message: "MT5 execution bridge is not connected yet."
  });
});

app.post("/api/trading/start", (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message: "Live trading is disabled until a verified MT5 execution bridge is connected."
    });
  }

  botRunning = true;

  res.json({
    ok: true,
    botRunning: true,
    mode: "demo",
    message: "AI MONSTER U demo engine started. No real broker order has been placed."
  });
});

app.post("/api/trading/stop", (req, res) => {
  botRunning = false;

  res.json({
    ok: true,
    botRunning: false,
    message: "AI MONSTER U trading engine stopped."
  });
});

app.post("/api/trading/emergency-close", (req, res) => {
  botRunning = false;

  res.status(503).json({
    ok: false,
    botRunning: false,
    message: "Emergency close requires an active MT5 execution bridge."
  });
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    message: "Backend is online."
  });
});

app.listen(PORT, () => {
  console.log(`AI MONSTER U backend running on port ${PORT}`);
});
