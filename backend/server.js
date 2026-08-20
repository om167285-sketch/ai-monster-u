import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;
const TRADING_MODE = process.env.TRADING_MODE || "demo";

const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL;
const MT5_BRIDGE_TOKEN = process.env.MT5_BRIDGE_TOKEN;

let botRunning = false;

async function bridgeRequest(endpoint) {
  if (!MT5_BRIDGE_URL) {
    throw new Error("MT5_BRIDGE_URL is missing");
  }

  if (!MT5_BRIDGE_TOKEN) {
    throw new Error("MT5_BRIDGE_TOKEN is missing");
  }

  const url =
    MT5_BRIDGE_URL.replace(/\/$/, "") + endpoint;

 async function bridgeRequest(endpoint) {
  if (!MT5_BRIDGE_URL) {
    throw new Error("MT5_BRIDGE_URL is missing");
  }

  if (!MT5_BRIDGE_TOKEN) {
    throw new Error("MT5_BRIDGE_TOKEN is missing");
  }

  const url = MT5_BRIDGE_URL.replace(/\/$/, "") + endpoint;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Bridge-Token": MT5_BRIDGE_TOKEN,
      "Accept": "application/json"
    },
    redirect: "manual"
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(
      Bridge returned HTTP ${response.status} ${response.statusText} instead of JSON. Response: ${text.slice(0, 100)}
    );
  }

  const data = JSON.parse(text);

  if (!response.ok) {
    throw new Error(
      data.error || Bridge returned HTTP ${response.status}
    );
  }

  return data;
}
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "MT5 bridge request failed"
    );
  }

  return data;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Backend",
    mode: TRADING_MODE
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const bridge = await bridgeRequest("/health");

    res.json({
      ok: true,
      service: "AI MONSTER U Trading Backend",
      mode: TRADING_MODE,
      mt5Connected: bridge.mt5_connected === true,
      time: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: "AI MONSTER U Trading Backend",
      mode: TRADING_MODE,
      mt5Connected: false,
      error: error.message
    });
  }
});

app.get("/api/trading/status", async (req, res) => {
  try {
    const health = await bridgeRequest("/health");
    const account = await bridgeRequest("/account");

    res.json({
      ok: true,
      connected: health.mt5_connected === true,
      mode: TRADING_MODE,
      botRunning: botRunning,
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
      botRunning: botRunning,
      broker: null,
      message: "MT5 bridge unavailable.",
      error: error.message
    });
  }
});

app.get("/api/market", async (req, res) => {
  try {
    const market = await bridgeRequest("/market");

    res.json(market);
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/start", async (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message: "Live trading is disabled."
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
      message: "Demo trading engine started. No real order placed."
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: "MT5 bridge unavailable.",
      error: error.message
    });
  }
});

app.post("/api/trading/stop", (req, res) => {
  botRunning = false;

  res.json({
    ok: true,
    botRunning: false,
    message: "Trading engine stopped."
  });
});

app.post("/api/trading/emergency-close", (req, res) => {
  botRunning = false;

  res.status(503).json({
    ok: false,
    message: "Emergency close is not enabled yet."
  });
});

app.get("/api/bridge/config", (req, res) => {
  res.json({
    ok: true,
    bridgeUrlConfigured: Boolean(MT5_BRIDGE_URL),
    bridgeTokenConfigured: Boolean(MT5_BRIDGE_TOKEN),
    tradingMode: TRADING_MODE
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("AI MONSTER U backend running");
  console.log("Port:", PORT);
  console.
    log("Mode:", TRADING_MODE);
  console.log("Bridge URL configured:", Boolean(MT5_BRIDGE_URL));
  console.log("Bridge token configured:", Boolean(MT5_BRIDGE_TOKEN));
});
