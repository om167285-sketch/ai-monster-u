import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import TradingEngine from "./tradingEngine.js";

const app = express();

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json());

const engine = new TradingEngine();

app.get("/api/health", function (req, res) {
  res.json({
    ok: true,
    service: "AI MONSTER U Trading Engine",
    mode: "demo",
    time: new Date().toISOString()
  });
});

app.get("/api/trading/status", function (req, res) {
  res.json({
    ok: true,
    mode: "demo",
    ...engine.getStatus()
  });
});

app.post("/api/trading/start", function (req, res) {
  try {
    res.json(engine.start());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/stop", function (req, res) {
  try {
    res.json(engine.stop());
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/trading/timeframe", function (req, res) {
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

app.post("/api/trading/analyze", function (req, res) {
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

app.post("/api/trading/open", function (req, res) {
  try {
    const signal = req.body.signal;
    const price = Number(req.body.price);
    const candleTime = req.body.candleTime || Date.now();

    const result = engine.openDemoPosition(
      signal,
      price,
      candleTime
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

app.post("/api/trading/close", function (req, res) {
  try {
    const price = Number(req.body.price);
    const reason = req.body.reason || "CANDLE_CLOSE";

    res.json(
      engine.closeAtCandleBoundary(
        price,
        reason
      )
    );
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/trading/trades", function (req, res) {
  res.json({
    ok: true,
    trades: engine.getTrades()
  });
});

app.use(express.static(dirname));

app.get("/", function (req, res) {
  res.sendFile(
    path.join(dirname, "dashboard.html")
  );
});

app.listen(PORT, "0.0.0.0", function () {
  console.log("====================================");
  console.log("AI MONSTER U");
  console.log("Trading Engine");
  console.log("====================================");
  console.log("Server started");
  console.log("Mode: DEMO");
  console.log("MT5 Bridge: NOT REQUIRED");
  console.log("Port: " + PORT);
  console.log("====================================");
});
