import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Serve frontend files from the repository root
app.use(express.static(__dirname));

const PORT = Number(process.env.PORT) || 3001;
const TRADING_MODE = process.env.TRADING_MODE || "demo";

let botRunning = false;

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: TRADING_MODE,
    time: new Date().toISOString()
  });
});

// Trading status
app.get("/api/trading/status", (req, res) => {
  res.json({
    connected: false,
    mode: TRADING_MODE,
    botRunning,
    broker: null,
    message: "MT5 execution bridge is not connected yet."
  });
});

// Start demo trading engine
app.post("/api/trading/start", (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message:
        "Live trading is disabled until a verified MT5 execution bridge is connected."
    });
  }

  botRunning = true;

  res.json({
    ok: true,
    botRunning: true,
    mode: "demo",
    message:
      "AI MONSTER U demo engine started. No real broker order has been placed."
  });
});

// Stop trading
app.post("/api/trading/stop", (req, res) => {
  botRunning = false;

  res.json({
    ok: true,
    botRunning: false,
    message: "AI MONSTER U trading engine stopped."
  });
});

// Emergency close
app.post("/api/trading/emergency-close", (req, res) => {
  botRunning = false;

  res.status(503).json({
    ok: false,
    botRunning: false,
    message: "Emergency close requires an active MT5 execution bridge."
  });
});

// Frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI MONSTER U backend running on port ${PORT}`);
});
