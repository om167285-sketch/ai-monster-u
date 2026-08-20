import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import TradingEngine from "./tradingEngine.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

const engine = new TradingEngine();

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Engine",
    mode: "demo",
    time: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| BOT STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/trading/status", (req, res) => {
  res.json({
    ok: true,
    mode: "demo",
    ...engine.getStatus()
  });
});

/*
|--------------------------------------------------------------------------
| START BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/start", (req, res) => {
  try {
    const result = engine.start();

    res.json({
      ...result,
      mode: "demo"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| STOP BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/stop", (req, res) => {
  try {
    const result = engine.stop();

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| SET TIMEFRAME
|--------------------------------------------------------------------------
*/

app.post("/api/trading/timeframe", (req, res) => {
  try {
    const { timeframe } = req.body;

    engine.setTimeframe(timeframe);

    res.json({
      ok: true,
      timeframe: engine.timeframe,
      message: Timeframe changed to ${timeframe}
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| MARKET ANALYSIS
|--------------------------------------------------------------------------
*/

app.post("/api/trading/analyze", (req, res) => {
  try {
    const analysis = engine.analyzeMarket(req.body);

    res.json({
      ok: true,
      timeframe: engine.timeframe,
      analysis
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| OPEN DEMO POSITION
|--------------------------------------------------------------------------
*/

app.post("/api/trading/open", (req, res) => {
  try {
    const { signal, price, candleTime } = req.body;

    const result = engine.openDemoPosition(
      signal,
      Number(price),
      candleTime || Date.now()
    );

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json({
      ...result,
      mode: "demo"
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| CLOSE POSITION
|--------------------------------------------------------------------------
*/

app.post("/api/trading/close", (req, res) => {
  try {
    const { price, reason } = req.body;

    const result = engine.closeAtCandleBoundary(
      Number(price),
      reason || "CANDLE_CLOSE"
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| TRADES
|--------------------------------------------------------------------------
*/

app.get("/api/trading/trades", (req, res) => {
  res.json({
    ok: true,
    trades: engine.getTrades()
  });
});

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/index.html")
  );
});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("====================================");
  console.log("       AI MONSTER U");
  console.log("       Trading Engine");
  console.log("====================================");
  console.log(`Server running on port ${PORT}`);
  console.log("Mode: DEMO");
  console.log("MT5 Bridge: NOT REQUIRED");
  console.log("====================================");
});
