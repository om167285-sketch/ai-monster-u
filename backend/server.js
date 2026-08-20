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

  const url = MT5_BRIDGE_URL.replace(/\/$/, "") + endpoint;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Bridge-Token": MT5_BRIDGE_TOKEN,
      "Accept": "application/json"
    },
    redirect: "manual"
  });

  const text = await response.text();

  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      Bridge returned HTTP ${response.status} instead of JSON
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Bridge returned invalid JSON");
  }

  if (!response.ok) {
    throw new Error(
      data.error || Bridge returned HTTP ${response.status}
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
    const bridge = await bridgeRequest("/health");

    res.json({
      ok: true,
      connected: bridge.mt5_connected === true,
      mode: TRADING_MODE,
      botRunning: botRunning,
      broker: {
        name: "Exness",
        server: "Exness-MT5Trial9"
      },
      message: "MT5 bridge connected."
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

app.get("/api/bridge/config", (req, res) => {
  res.json({
    ok: true,
    bridgeUrlConfigured: Boolean(MT5_BRIDGE_URL),
    bridgeTokenConfigured: Boolean(MT5_BRIDGE_TOKEN),
    tradingMode: TRADING_MODE
  });
});

app.post("/api/trading/start", async (req, res) => {
  if (TRADING_MODE !== "demo") {
    return res.status(403).json({
      ok: false,
      message: "Live trading is disabled."
    });
  }

  try {
    const bridge = await bridgeRequest("/health");

    if (bridge.mt5_connected !== true) {
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
      message: "Demo trading engine started."
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      botRunning: false,
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

app.listen(PORT, "0.0.0.0", () => {
  console.log("AI MONSTER U backend running");
  console.log("Port:", PORT);
  console.log("Trading mode:", TRADING_MODE);
  console.
    log(
    "MT5 bridge configured:",
    Boolean(MT5_BRIDGE_URL)
  );
  console.log(
    "MT5 token configured:",
    Boolean(MT5_BRIDGE_TOKEN)
  );
});
