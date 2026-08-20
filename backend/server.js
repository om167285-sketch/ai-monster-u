import express from "express";
import cors from "cors";
import TradingEngine from "./tradingEngine.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const engine = new TradingEngine();

app.get("/", (req, res) => {
  res.send("AI MONSTER U is LIVE");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U",
    mode: "demo",
    tradingEngine: true,
    time: new Date().toISOString()
  });
});

app.get("/api/trading/status", (req, res) => {
  res.json({
    ok: true,
    mode: "demo",
    ...engine.getStatus()
  });
});

app.post("/api/trading/start", (req, res) => {
  try {
    res.json(engine.start());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/stop", (req, res) => {
  try {
    res.json(engine.stop());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/timeframe", (req, res) => {
  try {
    const timeframe = req.body.timeframe;

    engine.setTimeframe(timeframe);

    res.json({
      ok: true,
      timeframe: engine.timeframe,
      message: "Timeframe changed to " + timeframe
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/analyze", (req, res) => {
  try {
    const analysis = engine.analyzeMarket(req.body);

    res.json({
      ok: true,
      timeframe: engine.timeframe,
      analysis: analysis
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/open", (req, res) => {
  try {
    const result = engine.openDemoPosition(
      req.body.signal,
      Number(req.body.price),
      req.body.candleTime || Date.now()
    );

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/close", (req, res) => {
  try {
    const result = engine.closeAtCandleBoundary(
      Number(req.body.price),
      req.body.reason || "CANDLE_CLOSE"
    );

    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/trading/trades", (req, res) => {
  res.json({
    ok: true,
    trades: engine.getTrades()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("AI MONSTER U");
  console.log("Trading Engine");
  console.log("Mode: DEMO");
  console.log("Server running on port " + PORT);
  console.log("================================");
});
