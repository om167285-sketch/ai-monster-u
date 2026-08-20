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

// Serve frontend
app.use(express.static(__dirname));

const PORT = Number(process.env.PORT) || 3001;
const TRADING_MODE = process.env.TRADING_MODE || "demo";

const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL;
const MT5_BRIDGE_TOKEN = process.env.MT5_BRIDGE_TOKEN;

let botRunning = false;

// =====================================================
// MT5 BRIDGE REQUEST
// =====================================================

async function bridgeRequest(endpoint) {
  if (!MT5_BRIDGE_URL) {
    throw new Error("MT5_BRIDGE_URL is not configured.");
  }

  if (!MT5_BRIDGE_TOKEN) {
    throw new Error("MT5_BRIDGE_TOKEN is not configured.");
  }

  const url = ${MT5_BRIDGE_URL.replace(/\/$/, "")}${endpoint};

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Bridge-Token": MT5_BRIDGE_TOKEN,
      "Accept": "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      MT5 bridge returned non-JSON response. HTTP ${response.status}
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error || MT5 bridge returned HTTP ${response.status}
    );
  }

  return data;
}

// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================================
// BACKEND HEALTH
// =====================================================

app.get("/api/health", async (req, res) => {
  let mt5Connected = false;
  let bridgeStatus = "offline";

  try {
    const bridge = await bridgeRequest("/health");

    mt5Connected = bridge.mt5_connected === true;
    bridgeStatus = "online";
  } catch (error) {
    bridgeStatus = "offline";
  }

  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: TRADING_MODE,
    mt5Connected,
    bridgeStatus,
    time: new Date().toISOString()
  });
});

// =====================================================
// MT5 TRADING STATUS
// =====================================================

app.get("/api/trading/status", async (req, res) => {
  try {
    const health = await bridgeRequest("/health");
    const account = await bridgeRequest("/account");

    res.json({
      ok: true,
      connected: health.mt5_connected === true,
      mode: TRADING_MODE,
      botRunning,

      broker: {
        name: "Exness",
        server: account.server,
        currency: account.currency,
        balance: account.balance,
        equity: account.equity,
        tradeAllowed: account.trade_allowed
      },

      message: "MT5 demo account connected."
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

// =====================================================
// MARKET DATA
// =====================================================

app.get("/api/market", async (req, res) => {
  try {
    const market = await bridgeRequest("/market");

    res.json({
      ok: true,
      symbol: market.symbol,
      bid: market.bid,
      ask: market.ask,
      time: market.time,
      time_msc: market.time_msc
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: "Unable to read MT5 market data.",
      error: error.message
    });
  }
});

// =====================================================
// START DEMO BOT
// =====================================================

app.post("/api/trading/start", async (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message:
        "Live trading is disabled. Verified MT5 demo execution is required first."
    });
  }

  try {
    const health = await bridgeRequest("/health");

    if (!health.mt5_connected) {
      return res.status(503).json({
        ok: false,
        message: "MT5 is not connected."
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
  } catch (error) {
    res.status(503).json({
      ok: false,
      botRunning: false,
      message: "Cannot start demo engine because MT5 bridge is unavailable.",
      error: error.message
    });
  }
});

// =====================================================
// STOP BOT
// =====================================================

app.post("/api/trading/stop", (req, res) => {
  botRunning = false;

  res.json({
    ok: true,
    botRunning: false,
    message: "AI MONSTER U trading engine stopped."
  });
});

// =====================================================
// EMERGENCY CLOSE
// =====================================================

app.post("/api/trading/emergency-close", (req, res) => {
  botRunning = false;

  res.status(503).json({
    ok: false,
    botRunning: false,
    message:
      "Emergency close is not enabled until authenticated MT5 order execution is implemented."
  });
});

// =====================================================
// DEBUG CONFIGURATION STATUS
// Does NOT reveal the secret token.
// =====================================================

app.get("/api/bridge/config", (req, res) => {
  res.json({
    ok: true,
    bridgeUrlConfigured: Boolean(MT5_BRIDGE_URL),
    bridgeTokenConfigured: Boolean(MT5_BRIDGE_TOKEN),
    tradingMode: TRADING_MODE
  });
});

// =====================================================
// SERVER
// =====================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("========================================");
  console.log("AI MONSTER U Trading Backend");
  console.log(`Port: ${PORT}`);
  console.log(`Trading mode: ${TRADING_MODE}`);
  console.log(
    MT5 bridge URL configured: ${MT5_BRIDGE_URL ? "YES" : "NO"}
  );
  console.log(
    MT5 bridge token configured: ${MT5_BRIDGE_TOKEN ? "YES" : "NO"}
  );
  console.log("========================================");
});
