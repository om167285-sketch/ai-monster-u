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

// Serve frontend files
app.use(express.static(__dirname));

const PORT = Number(process.env.PORT) || 3001;
const TRADING_MODE = process.env.TRADING_MODE || "demo";

const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL;
const MT5_BRIDGE_TOKEN = process.env.MT5_BRIDGE_TOKEN;

let botRunning = false;

// --------------------------------------------------
// MT5 BRIDGE HELPER
// --------------------------------------------------

async function bridgeRequest(endpoint) {
  if (!MT5_BRIDGE_URL || !MT5_BRIDGE_TOKEN) {
    throw new Error("MT5 bridge environment variables are not configured.");
  }

  const response = await fetch(
    ${MT5_BRIDGE_URL}${endpoint},
    {
      method: "GET",
      headers: {
        "X-Bridge-Token": MT5_BRIDGE_TOKEN,
        "Accept": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      MT5 bridge returned HTTP ${response.status}
    );
  }

  return await response.json();
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/api/health", async (req, res) => {
  let mt5Connected = false;

  try {
    const bridge = await bridgeRequest("/health");
    mt5Connected = bridge.mt5_connected === true;
  } catch (error) {
    mt5Connected = false;
  }

  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: TRADING_MODE,
    mt5Connected,
    time: new Date().toISOString()
  });
});

// --------------------------------------------------
// TRADING STATUS
// --------------------------------------------------

app.get("/api/trading/status", async (req, res) => {
  try {
    const [health, account] = await Promise.all([
      bridgeRequest("/health"),
      bridgeRequest("/account")
    ]);

    res.json({
      ok: true,
      connected: health.mt5_connected === true,
      mode: TRADING_MODE,
      botRunning,
      broker: {
        server: account.server,
        currency: account.currency,
        balance: account.balance,
        equity: account.equity,
        tradeAllowed: account.trade_allowed
      },
      message: "MT5 demo account connected successfully."
    });

  } catch (error) {
    res.status(503).json({
      ok: false,
      connected: false,
      mode: TRADING_MODE,
      botRunning,
      broker: null,
      message: "MT5 execution bridge is unavailable.",
      error: error.message
    });
  }
});

// --------------------------------------------------
// MARKET DATA
// --------------------------------------------------

app.get("/api/market", async (req, res) => {
  try {
    const market = await bridgeRequest("/market");

    res.json(market);
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: "Unable to read MT5 market data.",
      error: error.message
    });
  }
});

// --------------------------------------------------
// START TRADING
// --------------------------------------------------

app.post("/api/trading/start", (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message:
        "Live trading is disabled until the MT5 execution system is verified."
    });
  }

  botRunning = true;

  res.json({
    ok: true,
    botRunning: true,
    mode: "demo",
    message:
      "AI MONSTER U demo trading engine started. No real broker order has been placed."
  });
});

// --------------------------------------------------
// STOP TRADING
// --------------------------------------------------

app.post("/api/trading/stop", (req, res) => {
  botRunning = false;

  res.json({
    ok: true,
    botRunning: false,
    message: "AI MONSTER U trading engine stopped."
  });
});

// --------------------------------------------------
// EMERGENCY CLOSE
// --------------------------------------------------

app.post("/api/trading/emergency-close", (req, res) => {
  botRunning = false;

  res.status(503).json({
    ok: false,
    botRunning: false,
    message:
      "Emergency close is not enabled until authenticated MT5 order execution is implemented."
  });
});

// --------------------------------------------------
// FRONTEND
// --------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI MONSTER U backend running on port ${PORT}`);
  console.log(`Trading mode: ${TRADING_MODE}`);
  console.log(
    MT5 bridge configured: ${MT5_BRIDGE_URL ? "YES" : "NO"}
  );
});
