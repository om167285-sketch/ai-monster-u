import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import TradingEngine from "./tradingEngine.js";

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
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

/*
|--------------------------------------------------------------------------
| MT5 BRIDGE
|--------------------------------------------------------------------------
*/

let mt5Bridge = {
  connected: false,
  lastHeartbeat: null,

  mode: "UNKNOWN",
  account: null,
  broker: null,
  server: null,
  currency: null,

  balance: 0,
  equity: 0,
  margin: 0,
  freeMargin: 0,

  symbol: null,
  timeframe: null,
  bid: 0,
  ask: 0,

  updatedAt: null
};

/*
|--------------------------------------------------------------------------
| CANDLE STORAGE
|--------------------------------------------------------------------------
*/

const candleHistory = new Map();
const MAX_CANDLES = 300;

/*
|--------------------------------------------------------------------------
| COMMAND STATE
|--------------------------------------------------------------------------
*/

let mt5Command = {
  id: null,
  action: "NONE",
  mode: "DEMO",
  symbol: null,
  volume: 0,
  sl: 0,
  tp: 0,
  reason: null,
  createdAt: null
};

/*
|--------------------------------------------------------------------------
| EXECUTION STATE
|--------------------------------------------------------------------------
*/

let mt5Execution = {
  id: null,
  status: "NONE",
  action: null,
  ticket: null,
  symbol: null,
  volume: 0,
  price: 0,
  profit: 0,
  message: null,
  executedAt: null
};

/*
|--------------------------------------------------------------------------
| BOT STATE
|--------------------------------------------------------------------------
*/

let botRunning = false;

const lastProcessedCandle = new Map();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getMarketKey(symbol, timeframe) {
return '${symbol}:${timeframe}';
}
function timeframeMilliseconds(timeframe) {
  const values = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000
  };

  return values[timeframe] || 60 * 1000;
}

function resetMT5Command(reason = null) {
  mt5Command = {
    id: null,
    action: "NONE",
    mode: "DEMO",
    symbol: null,
    volume: 0,
    sl: 0,
    tp: 0,
    reason,
    createdAt: null
  };
}

/*
|--------------------------------------------------------------------------
| EMA
|--------------------------------------------------------------------------
*/

function calculateEMA(values, period) {
  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const numbers = values.map(Number);

  if (numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  let ema =
    numbers
      .slice(0, period)
      .reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < numbers.length; i++) {
    ema =
      (numbers[i] - ema) * multiplier +
      ema;
  }

  return ema;
}

/*
|--------------------------------------------------------------------------
| RSI
|--------------------------------------------------------------------------
*/

function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) {
    return null;
  }

  const numbers = values.map(Number);

  if (numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = numbers[i] - numbers[i - 1];

    if (change > 0) {
      gains += change;
    } else if (change < 0) {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < numbers.length; i++) {
    const change = numbers[i] - numbers[i - 1];

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain =
      ((averageGain * (period - 1)) + gain) /
      period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) /
      period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs = averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

/*
|--------------------------------------------------------------------------
| ATR
|--------------------------------------------------------------------------
*/

function calculateATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) {
    return null;
  }

  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const high = Number(current.high);
    const low = Number(current.low);
    const previousClose = Number(previous.close);

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(previousClose)
    ) {
      continue;
    }

    const trueRange = Math.max(
      high - low,
      Math.abs(high - previousClose),
      Math.abs(low - previousClose)
    );

    trueRanges.push(trueRange);
  }

  if (trueRanges.length < period) {
    return null;
  }

  const recent = trueRanges.slice(-period);

  return (
    recent.reduce((sum, value) => sum + value, 0) /
    recent.length
  );
}

/*
|--------------------------------------------------------------------------
| MARKET ANALYSIS
|--------------------------------------------------------------------------
*/

function analyzeMT5Market(candles) {
  if (!Array.isArray(candles) || candles.length < 55) {
    return {
      signal: "WAIT",
      confidence: 0,
      reason: "Waiting for enough MT5 candles",
      ema20: null,
      ema50: null,
      rsi: null,
      atr: null
    };
  }

  const closes = candles.map((candle) => Number(candle.close));

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  let buyScore = 0;
  let sellScore = 0;

  const reasons = [];

  /*
  EMA TREND
  */

  if (ema20 !== null && ema50 !== null) {
    if (ema20 > ema50) {
      buyScore += 2;
      reasons.push("EMA20 above EMA50");
    }

    if (ema20 < ema50) {
      sellScore += 2;
      reasons.push("EMA20 below EMA50");
    }
  }

  /*
  RSI
  */

  if (rsi !== null) {
    if (rsi >= 52 && rsi <= 70) {
      buyScore += 1;
      reasons.push("Bullish RSI momentum");
    }

    if (rsi <= 48 && rsi >= 30) {
      sellScore += 1;
      reasons.push("Bearish RSI momentum");
    }
  }

  /*
  CANDLE MOMENTUM
  */

  if (last.close > last.open) {
    buyScore += 1;
    reasons.push("Bullish completed candle");
  }

  if (last.close < last.open) {
    sellScore += 1;
    reasons.push("Bearish completed candle");
  }

  /*
  BREAKOUT
  */

  if (last.close > previous.high) {
    buyScore += 2;
    reasons.push("Previous candle high breakout");
  }

  if (last.close < previous.low) {
    sellScore += 2;
    reasons.
       push("Previous candle low breakdown");
  }

  let signal = "WAIT";

  if (buyScore >= 3 && buyScore > sellScore) {
    signal = "BUY";
  }

  if (sellScore >= 3 && sellScore > buyScore) {
    signal = "SELL";
  }

  const strongestScore = Math.max(
    buyScore,
    sellScore
  );

  const confidence =
    signal === "WAIT"
      ? 0
      : Math.min(
          95,
          50 + strongestScore * 7
        );

  return {
    signal,
    confidence,

    buyScore,
    sellScore,

    ema20,
    ema50,
    rsi,
    atr,

    price: last.close,

    reasons
  };
}

/*
|--------------------------------------------------------------------------
| CREATE MT5 COMMAND
|--------------------------------------------------------------------------
*/

function createMT5Command(signal, candle, analysis) {
  if (signal !== "BUY" && signal !== "SELL") {
    return null;
  }

  if (mt5Command.action !== "NONE") {
    return null;
  }

  const price = Number(candle.close);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const atr = Number(analysis.atr) || 0;

  const minimumDistance = Math.max(
    price * 0.001,
    0.00001
  );

  const stopDistance = Math.max(
    atr,
    minimumDistance
  );

  const rewardRisk = 1.5;

  const sl =
    signal === "BUY"
      ? price - stopDistance
      : price + stopDistance;

  const tp =
    signal === "BUY"
      ? price + stopDistance * rewardRisk
      : price - stopDistance * rewardRisk;

  mt5Command = {
    id: 'AMU-${Date.now()}',

    action: signal,

    mode: "DEMO",

    symbol: String(candle.symbol),

    volume: 0.01,

    sl: Number(sl.toFixed(8)),

    tp: Number(tp.toFixed(8)),

    reason: "MT5_CANDLE_AI_SIGNAL",

    createdAt: new Date().toISOString()
  };

  console.log(
    "AI MONSTER U MT5 COMMAND:",
    JSON.stringify(mt5Command)
  );

  return mt5Command;
}

/*
|--------------------------------------------------------------------------
| MT5 CANDLE
|--------------------------------------------------------------------------
*/

app.post("/api/mt5/candle", (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      open,
      high,
      low,
      close,
      volume,
      startTime,
      endTime,
      complete
    } = req.body;

    if (
      !symbol ||
      !timeframe ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined
    ) {
      return res.status(400).json({
        ok: false,
        error: "Incomplete MT5 candle"
      });
    }

    if (complete !== true) {
      return res.json({
        ok: true,
        processed: false,
        reason: "Candle is not complete"
      });
    }

    const candle = {
      symbol: String(symbol),
      timeframe: String(timeframe),

      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),

      volume: Number(volume) || 0,

      startTime: Number(startTime) || Date.now(),
      endTime: Number(endTime) || Date.now(),

      complete: true
    };

    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid candle price data"
      });
    }

    const key = getCandleKey(
      candle.symbol,
      candle.timeframe
    );

    if (!candleHistory.has(key)) {
      candleHistory.set(key, []);
    }

    const candles = candleHistory.get(key);

    /*
    Prevent duplicate candles.
    */

    const duplicate = candles.some(
      (item) =>
        item.startTime === candle.startTime
    );

    if (!duplicate) {
      candles.push(candle);
    }

    while (candles.length > MAX_CANDLES) {
      candles.shift();
    }

    /*
    Only process a candle once.
    */

    const previousProcessed =
      lastProcessedCandle.get(key);

    if (
      previousProcessed ===
      candle.startTime
    ) {
      return res.json({
        ok: true,
        processed: false,
        duplicate: true,
         candlesAvailable: candles.length
      });
    }

    lastProcessedCandle.set(
      key,
      candle.startTime
    );

    /*
    Analyze market.
    */

    const analysis =
      analyzeMT5Market(candles);

    let command = null;

    /*
    Demo MT5 command generation.
    */

    if (
      botRunning &&
      String(mt5Bridge.mode).toUpperCase() ===
        "DEMO"
    ) {
      command = createMT5Command(
        analysis.signal,
        candle,
        analysis
      );
    }

    res.json({
      ok: true,

      processed: true,

      candle,

      candlesAvailable: candles.length,

      analysis,

      command
    });
  } catch (error) {
    console.error(
      "MT5 candle error:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U",
    mode: mt5Bridge.mode,
    botRunning,
    tradingEngine: true,
    mt5Bridge: mt5Bridge.connected,
    pendingCommand:
      mt5Command.action !== "NONE",
    time: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| START BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/start", (req, res) => {
  try {
    botRunning = true;

    const result = engine.start();

    res.json({
      ok: true,
      running: true,
      mode: "DEMO",
      result,
      message:
        "AI MONSTER U Demo trading started"
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
    botRunning = false;

    const result = engine.stop();

    resetMT5Command("BOT_STOPPED");

    res.json({
      ok: true,
      running: false,
      result,
      message:
        "AI MONSTER U trading stopped"
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
| TRADING STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/trading/status", (req, res) => {
  let engineStatus = {};

  try {
    engineStatus = engine.getStatus();
  } catch (error) {
    engineStatus = {
      error: error.message
    };
  }

  res.json({
    ok: true,

    running: botRunning,

    mode: mt5Bridge.mode,

    mt5: mt5Bridge,

    pendingCommand: mt5Command,

    lastExecution: mt5Execution,

    engine: engineStatus
  });
});

/*
|--------------------------------------------------------------------------
| MT5 HEARTBEAT
|--------------------------------------------------------------------------
*/

app.post("/api/mt5/heartbeat", (req, res) => {
  try {
    const {
      account,
      broker,
      server,
      currency,
      balance,
      equity,
      margin,
      freeMargin,
      mode,
      symbol,
      timeframe,
      bid,
      ask
    } = req.body;

    if (
      account === undefined ||
      broker === undefined ||
      server === undefined
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid MT5 heartbeat"
      });
    }

    mt5Bridge = {
      connected: true,

      lastHeartbeat:
        new Date().toISOString(),

      mode: mode
        ? String(mode).toUpperCase()
        : "UNKNOWN",

      account: String(account),

      broker: String(broker),

      server: String(server),

      currency: currency
        ? String(currency)
        : null,

      balance: Number(balance) || 0,

      equity: Number(equity) || 0,

      margin: Number(margin) || 0,
       freeMargin:
        Number(freeMargin) || 0,

      symbol: symbol
        ? String(symbol)
        : null,

      timeframe: timeframe
        ? String(timeframe)
        : null,

      bid: Number(bid) || 0,

      ask: Number(ask) || 0,

      updatedAt:
        new Date().toISOString()
    };

    res.json({
      ok: true,
      received: true,
      mode: mt5Bridge.mode,
      server: mt5Bridge.server
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
| MT5 STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/mt5/status", (req, res) => {
  const last = mt5Bridge.lastHeartbeat
    ? new Date(
        mt5Bridge.lastHeartbeat
      ).getTime()
    : 0;

  const age =
    last > 0
      ? Date.now() - last
      : null;

  const connected =
    age !== null &&
    age < 30000;

  mt5Bridge.connected = connected;

  res.json({
    ok: true,

    connected,

    mode: mt5Bridge.mode,

    account: mt5Bridge.account,

    broker: mt5Bridge.broker,

    server: mt5Bridge.server,

    currency: mt5Bridge.currency,

    balance: mt5Bridge.balance,

    equity: mt5Bridge.equity,

    margin: mt5Bridge.margin,

    freeMargin: mt5Bridge.freeMargin,

    symbol: mt5Bridge.symbol,

    timeframe: mt5Bridge.timeframe,

    bid: mt5Bridge.bid,

    ask: mt5Bridge.ask,

    lastHeartbeat:
      mt5Bridge.lastHeartbeat,

    heartbeatAgeMs: age
  });
});

/*
|--------------------------------------------------------------------------
| MT5 COMMAND
|--------------------------------------------------------------------------
*/

app.get("/api/mt5/command", (req, res) => {
  const last = mt5Bridge.lastHeartbeat
    ? new Date(
        mt5Bridge.lastHeartbeat
      ).getTime()
    : 0;

  const connected =
    last > 0 &&
    Date.now() - last < 30000;

  if (!connected) {
    return res.json({
      ok: true,

      command: {
        action: "NONE"
      },

      reason: "MT5 bridge offline"
    });
  }

  /*
  LIVE execution remains disabled.
  */

  if (
    String(mt5Bridge.mode).toUpperCase() !==
    "DEMO"
  ) {
    return res.json({
      ok: true,

      command: {
        action: "NONE"
      },

      reason:
        "Only DEMO execution is enabled"
    });
  }

  res.json({
    ok: true,
    command: mt5Command
  });
});

/*
|--------------------------------------------------------------------------
| MT5 COMMAND ACK
|--------------------------------------------------------------------------
*/

app.post(
  "/api/mt5/command/ack",
  (req, res) => {
    try {
      const {
        id,
        status,
        ticket,
        symbol,
        volume,
        price,
        profit,
        message
      } = req.body;

      if (!id || !status) {
        return res.status(400).json({
          ok: false,
          error:
            "Incomplete acknowledgement"
        });
      }

      mt5Execution = {
        id: String(id),

        status: String(status),

        action:
          mt5Command.action,

        ticket:
          ticket !== undefined &&
          ticket !== null
            ? String(ticket)
            : null,

        symbol:
          symbol !== undefined &&
          symbol !== null
            ? String(symbol)
            : null,

        volume:
          Number(volume) || 0,

        price:
          Number(price) || 0,

        profit:
          Number(profit) || 0,

        message:
          message !== undefined &&
          message !== null
            ? String(message)
            : null,

        executedAt:
          new Date().toISOString()
      };

      if (
        mt5Command.id ===
        String(id)
      ) {
        resetMT5Command(
          'ACK_${String(status).toUpperCase()}'
        );
      }

      res.json({
        ok: true,
        received: true,
        execution: mt5Execution
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
| LAST EXECUTION
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/execution",
  (req, res) => {
    res.json({
      ok: true,
      execution: mt5Execution
    });
  }
);

/*
|--------------------------------------------------------------------------
| MT5 ANALYSIS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/analysis",
  (req, res) => {
    const symbol =
      String(
        req.query.symbol ||
        mt5Bridge.symbol ||
        ""
      );

    const timeframe =
      String(
        req.query.timeframe ||
        mt5Bridge.timeframe ||
        "1m"
      );

    const key =
      getCandleKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) || [];

    res.json({
      ok: true,

      symbol,

      timeframe,

      candlesAvailable:
        candles.length,

      latestCandle:
        candles.length > 0
          ? candles[candles.length - 1]
          : null,

      analysis:
        analyzeMT5Market(
          candles
        )
    });
  }
);

/*
|--------------------------------------------------------------------------
| CANDLE HISTORY
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/candles",
  (req, res) => {
    const symbol =
      String(
        req.query.symbol ||
        mt5Bridge.symbol ||
        ""
      );

    const timeframe =
      String(
        req.query.timeframe ||
        mt5Bridge.timeframe ||
        "1m"
      );

    const key =
      getCandleKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) || [];

    res.json({
      ok: true,
      symbol,
      timeframe,
      count: candles.length,
      candles
    });
  }
);

/*
|--------------------------------------------------------------------------
| BOT CONFIGURATION
|--------------------------------------------------------------------------
*/

app.get(
  "/api/config",
  (req, res) => {
    res.json({
      ok: true,

      service:
        "AI MONSTER U",

      executionMode:
        "DEMO",

      liveExecution:
        false,

      supportedTimeframes: [
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
        "4h"
      ],

      maxCandles:
        MAX_CANDLES,

      commandVolume:
        0.01,

      rewardRisk:
        1.5
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
| GENERAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });
  }
);

/*
|--------------------------------------------------------------------------
| SERVER START
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "AI MONSTER U BACKEND"
    );

    console.log(
      "MT5 CANDLE ENGINE"
    );

    console.log(
      "DEMO EXECUTION ENABLED"
    );

    console.log(
      "LIVE EXECUTION DISABLED"
    );

    console.log(
      'PORT: ${PORT}'
    );

    console.log(
      TIME: ${new Date().toISOString()}
    );

    console.log(
      "========================================"
    );
  }
);
