import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import TradingEngine from "./tradingEngine.js";
import MarketData from "./marketData.js";

const app = express();

const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.type("html");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

/*
|--------------------------------------------------------------------------
| TRADING ENGINE
|--------------------------------------------------------------------------
*/

const engine = new TradingEngine();
const market = new MarketData();

/*
|--------------------------------------------------------------------------
| COMPLETED CANDLE → TRADING ENGINE
|--------------------------------------------------------------------------
*/

market.setCandleCloseHandler((candle, candles) => {
  try {
    const result = engine.processCompletedCandle(
      candle,
      candles
    );

    console.log(
      "Candle processed:",
      JSON.stringify(result)
    );
  } catch (error) {
    console.error(
      "Trading engine error:",
      error.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| START MARKET DATA
|--------------------------------------------------------------------------
*/

market.connect("BTCUSDT", "1m");

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U",
    mode: "demo",
    tradingEngine: true,
    marketData: market.getStatus(),
    time: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| MARKET STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/market/status", (req, res) => {
  res.json({
    ok: true,
    ...market.getStatus()
  });
});

/*
|--------------------------------------------------------------------------
| MARKET CONNECT
|--------------------------------------------------------------------------
*/

app.post("/api/market/connect", (req, res) => {
  try {
    const symbol =
      req.body.symbol || "BTCUSDT";

    const timeframe =
      req.body.timeframe || "1m";

    market.connect(
      symbol,
      timeframe
    );

    engine.setSymbol(symbol);
    engine.setTimeframe(timeframe);

    res.json({
      ok: true,
      message:
        "Market data connection started",
      symbol:
        symbol.toUpperCase(),
      timeframe
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
| TRADING STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/trading/status", (req, res) => {
  res.json({
    ok: true,
    ...engine.getStatus()
  });
});

/*
|--------------------------------------------------------------------------
| START DEMO BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/start", (req, res) => {
  try {
    const result = engine.start();

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
| STOP DEMO BOT
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
| CHANGE TIMEFRAME
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/timeframe",
  (req, res) => {
    try {
      const timeframe =
        req.body.timeframe;

      if (!timeframe) {
        return res.status(400).json({
          ok: false,
          error:
            "Timeframe is required"
        });
      }

      engine.setTimeframe(
        timeframe
      );

      market.connect(
        engine.symbol,
        timeframe
      );

      res.json({
        ok: true,
        timeframe:
          engine.timeframe,
        message:
          "Timeframe changed to " +
          timeframe
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OPEN DEMO POSITION
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/open",
  (req, res) => {
    try {
      const signal =
        req.body.signal;

      const price =
        Number(req.body.price);

      const candleTime =
        req.body.candleTime ||
        Date.now();

      const result =
        engine.openDemoPosition(
          signal,
          price,
          candleTime
        );

      if (!result.ok) {
        return res
          .status(400)
          .json(result);
      }

      res.json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CLOSE DEMO POSITION
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/close",
  (req, res) => {
    try {
      const price =
        Number(req.body.price);

      const reason =
        req.body.reason ||
        "CANDLE_CLOSE";

      const result =
        engine.closeAtCandleBoundary(
          price,
          reason
        );

      res.json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ANALYZE MARKET
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/analyze",
  (req, res) => {
    try {
      const result =
        engine.analyzeMarket(
          req.body
        );

      res.json({
        ok: true,
        analysis: result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TRADE HISTORY
|--------------------------------------------------------------------------
*/

app.get(
  "/api/trading/trades",
  (req, res) => {
    res.json({
      ok: true,
      trades:
        engine.getTrades()
    });
  }
);

/*
|--------------------------------------------------------------------------
| API 404
|--------------------------------------------------------------------------
*/

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      ok: false,
      error:
        "API endpoint not found"
    });
  }
);

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================"
    );

    console.log(
      "AI MONSTER U"
    );

    console.log(
      "Website + Trading Engine"
      );

    console.log(
      "Market Data"
    );

    console.log(
      "Mode: DEMO"
    );

    console.log(
      "Server running on port " +
        PORT
    );

    console.log(
      "================================"
    );
  }
);
