import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import TradingEngine from "./tradingEngine.js";

const app = express();

const PORT = Number(process.env.PORT || 10000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   APP
========================================================= */

app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* =========================================================
   FRONTEND
========================================================= */
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

/* =========================================================
   TRADING ENGINE
========================================================= */

let engine = null;

try {
  engine = new TradingEngine();
  console.log("TradingEngine initialized successfully.");
} catch (error) {
  console.warn(
    "TradingEngine initialization warning:",
    error?.message || error
  );
}

/* =========================================================
   GLOBAL CONFIG
========================================================= */

const BOT_CONFIG = {
  symbol: "BTCUSDm",
  timeframe: "1m",

  minimumLot: 0.01,

  // Strategy risk/reward
  rewardRisk: 1.5,

  maxCandles: 300
};

const SUPPORTED_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h"
];

/* =========================================================
   MT5 BRIDGE STATE
========================================================= */

let mt5Bridge = {
  connected: false,

  lastHeartbeat: null,

  mode: "DEMO",

  account: null,
  broker: null,
  server: null,
  currency: null,

  balance: 0,
  equity: 0,
  margin: 0,
  freeMargin: 0,

  symbol: BOT_CONFIG.symbol,
  timeframe: BOT_CONFIG.timeframe,

  bid: 0,
  ask: 0,

  updatedAt: null
};

/* =========================================================
   BOT STATE
========================================================= */

let botState = {
  running: false,

  requestedMode: "DEMO",

  symbol: BOT_CONFIG.symbol,
  timeframe: BOT_CONFIG.timeframe,

  startedAt: null,
  stoppedAt: null,

  lastCandle: null,

  lastSignal: "WAIT",
  lastConfidence: 0,

  lastAnalysis: null
};

/* =========================================================
   MT5 COMMAND STATE
========================================================= */

let mt5Command = {
  id: null,

  action: "NONE",

  mode: "DEMO",

  symbol: BOT_CONFIG.symbol,
  timeframe: BOT_CONFIG.timeframe,

  volume: BOT_CONFIG.minimumLot,

  sl: 0,
  tp: 0,

  reason: null,

  payload: null,

  createdAt: null
};

/* =========================================================
   MT5 EXECUTION STATE
========================================================= */

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

/* =========================================================
   CANDLE STORAGE
========================================================= */

const candleHistory = new Map();
const lastProcessedCandle = new Map();

const MAX_CANDLES = BOT_CONFIG.maxCandles;

/* =========================================================
   HELPERS
========================================================= */

function getMarketKey(symbol, timeframe) {
  return `${symbol}:${timeframe}`;
}

function normalizeMode(mode) {
  const value = String(mode || "DEMO")
    .trim()
    .toUpperCase();

  return value === "LIVE" ? "LIVE" : "DEMO";
}

function normalizeTimeframe(timeframe) {
  const value = String(
    timeframe || BOT_CONFIG.timeframe
  ).trim();

  if (SUPPORTED_TIMEFRAMES.includes(value)) {
    return value;
  }

  return BOT_CONFIG.timeframe;
}

function normalizeSymbol(symbol) {
  const value = String(
    symbol || BOT_CONFIG.symbol
  )
   .trim()
    .toUpperCase();

  return value || BOT_CONFIG.symbol;
}

function createCommandId(prefix = "AMU") {
  return `${prefix}-${Date.now()}-${Math.floor(
    Math.random() * 1000000
  )}`;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/* =========================================================
   HEARTBEAT CHECK
========================================================= */

function isHeartbeatAlive() {
  if (!mt5Bridge.lastHeartbeat) {
    return false;
  }

  const heartbeatTime =
    new Date(mt5Bridge.lastHeartbeat).getTime();

  if (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  const age = Date.now() - heartbeatTime;

  // MT5 must report at least once within 15 seconds.
  return age >= 0 && age <= 15000;
}

/* =========================================================
   RESET COMMAND
========================================================= */

function resetMT5Command(reason = null) {
  mt5Command = {
    id: null,

    action: "NONE",

    mode: botState.requestedMode,

    symbol: botState.symbol,
    timeframe: botState.timeframe,

    volume: BOT_CONFIG.minimumLot,

    sl: 0,
    tp: 0,

    reason,

    payload: null,

    createdAt: null
  };
}

/* =========================================================
   EMA
========================================================= */

function calculateEMA(values, period) {
  if (
    !Array.isArray(values) ||
    values.length < period
  ) {
    return null;
  }

  const numbers = values.map(Number);

  if (
    numbers.some(
      (value) => !Number.isFinite(value)
    )
  ) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  let ema =
    numbers
      .slice(0, period)
      .reduce(
        (sum, value) => sum + value,
        0
      ) / period;

  for (
    let i = period;
    i < numbers.length;
    i++
  ) {
    ema =
      (numbers[i] - ema) * multiplier +
      ema;
  }

  return ema;
}

/* =========================================================
   RSI
========================================================= */

function calculateRSI(values, period = 14) {
  if (
    !Array.isArray(values) ||
    values.length < period + 1
  ) {
    return null;
  }

  const numbers = values.map(Number);

  if (
    numbers.some(
      (value) => !Number.isFinite(value)
    )
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {
    const change =
      numbers[i] -
      numbers[i - 1];

    if (change > 0) {
      gains += change;
    } else if (change < 0) {
      losses += Math.abs(change);
    }
  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  for (
    let i = period + 1;
    i < numbers.length;
    i++
  ) {
    const change =
      numbers[i] -
      numbers[i - 1];

    const gain =
      change > 0 ? change : 0;

    const loss =
      change < 0
        ? Math.abs(change)
        : 0;

    averageGain =
      (
        averageGain * (period - 1) +
        gain
      ) / period;

    averageLoss =
      (
        averageLoss * (period - 1) +
        loss
      ) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

/* =========================================================
   ATR
========================================================= */

function calculateATR(
  candles,
  period = 14
) {
  if (
    !Array.isArray(candles) ||
    candles.length < period + 1
  ) {
    return null;
  }

  const trueRanges = [];

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {
    const current = candles[i];
    const previous = candles[i - 1];

    const high = Number(current.high);
    const low = Number(current.low);
    const previousClose =
      Number(previous.close);

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
    returnnull;
  }

  const recent =
    trueRanges.slice(-period);

  return(
    recent.reduce(
      (sum, value) => sum + value,
      0
    ) / recent.length
  );
}

/* =========================================================
   MACD
========================================================= */

function calculateMACD(values) {
  if (
    !Array.isArray(values) ||
    values.length < 35
  ) {
    returnnull;
  }

  const fast = calculateEMA(values, 12);
  const slow = calculateEMA(values, 26);

  if (
    fast === null ||
    slow === null
  ) {
    returnnull;
  }

  const macd = fast - slow;

  return{
    macd,
    bullish: macd > 0,
    bearish: macd < 0
  };
}

/* =========================================================
   AI MONSTER U STRATEGY
========================================================= */

/*
   Strategy:

   EMA 20 / EMA 50 trend
   RSI 14 momentum
   MACD confirmation
   ATR volatility
   Previous candle breakout
   Completed candle confirmation

   BUY:
   - EMA20 > EMA50
   - Price above EMA20
   - RSI >= 55
   - MACD bullish
   - Optional breakout/candle confirmation

   SELL:
   - EMA20 < EMA50
   - Price below EMA20
   - RSI <= 45
   - MACD bearish
   - Optional breakdown/candle confirmation
*/

function analyzeMT5Market(candles) {
  if (
    !Array.isArray(candles) ||
    candles.length < 55
  ) {
    return{
      signal: "WAIT",
      confidence: 0,

      buyScore: 0,
      sellScore: 0,

      reason:
        "Waiting for at least 55 completed candles",

      ema20: null,
      ema50: null,
      ema200: null,

      rsi: null,
      macd: null,
      atr: null,

      price: null,

      reasons: []
    };
  }

  const closes =
    candles.map(
      (candle) => Number(candle.close)
    );

  const ema20 =
    calculateEMA(closes, 20);

  const ema50 =
    calculateEMA(closes, 50);

  const ema200 =
    calculateEMA(closes, 200);

  const rsi =
    calculateRSI(closes, 14);

  const macd =
    calculateMACD(closes);

  const atr =
    calculateATR(candles, 14);

  const last =
    candles[candles.length - 1];

  const previous =
    candles[candles.length - 2];

  const currentPrice =
    Number(last.close);

  if (
    !Number.isFinite(currentPrice) ||
    ema20 === null ||
    ema50 === null ||
    rsi === null ||
    macd === null
  ) {
    return{
      signal: "WAIT",
      confidence: 0,

      buyScore: 0,
      sellScore: 0,

      reason:
        "Indicators are not ready",

      ema20,
      ema50,
      ema200,

      rsi,
      macd:
        macd ? macd.macd : null,

      atr,

      price: currentPrice,

      reasons: []
    };
  }

  let buyScore = 0;
  let sellScore = 0;

  const reasons = [];

  /* ---------------- TREND ---------------- */

  if (
    ema20 > ema50 &&
    currentPrice > ema20
  ) {
    buyScore += 2;

    reasons.push(
      "Bullish EMA20/EMA50 trend"
    );
  }

  if (
    ema20 < ema50 &&
    currentPrice < ema20
  ) {
    sellScore += 2;

    reasons.push(
      "Bearish EMA20/EMA50 trend"
    );
  }

  /* ---------------- RSI ---------------- */

  if (rsi >= 55) {
    buyScore += 1;

    reasons.push(
      "RSI bullish momentum"
    );
  }

  if (rsi <= 45) {
    sellScore += 1;

    reasons.push(
      "RSI bearish momentum"
    );
  }

  /* ---------------- MACD ---------------- */

  if (macd.bullish) {
    buyScore += 1;

    reasons.push(
      "MACD bullish"
    );
  }

  if (macd.bearish) {
    sellScore += 1;

    reasons.push(
      "MACD bearish"
    );
  }

  /* ---------------- CANDLE ---------------- */

  if (
    Number(last.close) >
    Number(last.open)
  ) {
    buyScore += 1;

    reasons.push(
      "Bullish completed candle"
    );
  }

  if (
    Number(last.close) <
    Number(last.open)
  ) {
    sellScore += 1;

    reasons.push(
      "Bearish completed candle"
    );
  }

  /* ---------------- BREAKOUT ---------------- */
if (
    Number(last.close) >
    Number(previous.high)
  ) {
    buyScore += 2;

    reasons.push(
      "Previous high breakout"
    );
  }

  if (
    Number(last.close) <
    Number(previous.low)
  ) {
    sellScore += 2;

    reasons.push(
      "Previous low breakdown"
    );
  }

  /* ---------------- SIGNAL ---------------- */

  let signal = "WAIT";

  if (
    buyScore >= 4 &&
    buyScore > sellScore
  ) {
    signal = "BUY";
  }

  if (
    sellScore >= 4 &&
    sellScore > buyScore
  ) {
    signal = "SELL";
  }

  /* ---------------- CONFIDENCE ---------------- */

  const strongestScore =
    Math.max(
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

  return{
    signal,

    confidence:
      Number(confidence.toFixed(2)),

    buyScore,
    sellScore,

    reason:
      signal === "BUY"
        ? "Bullish trend and momentum confirmed"
        : signal === "SELL"
        ? "Bearish trend and momentum confirmed"
        : "No complete trading setup",

    price: currentPrice,

    ema20,
    ema50,
    ema200,

    rsi,

    macd: macd.macd,

    atr,

    reasons
  };
}

/* =========================================================
   CREATE MT5 TRADE COMMAND
========================================================= */

function createMT5TradeCommand(
  signal,
  candle,
  analysis
) {
  if (
    signal !== "BUY" &&
    signal !== "SELL"
  ) {
    returnnull;
  }

  if (
    mt5Command.action !== "NONE"
  ) {
    returnnull;
  }

  if (!isHeartbeatAlive()) {
    console.log(
      "Trade skipped: MT5 heartbeat offline."
    );

    returnnull;
  }

  const price =
    Number(candle.close);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    returnnull;
  }

  /*
     ATR-based SL.

     The TP uses the configured
     reward/risk ratio.
  */

  const atr =
    Number(analysis.atr) || 0;

  const minimumDistance =
    Math.max(
      price * 0.001,
      0.00001
    );

  const stopDistance =
    Math.max(
      atr,
      minimumDistance
    );

  const rewardRisk =
    BOT_CONFIG.rewardRisk;

  const sl =
    signal === "BUY"
      ? price - stopDistance
      : price + stopDistance;

  const tp =
    signal === "BUY"
      ? price +
        stopDistance * rewardRisk
      : price -
        stopDistance * rewardRisk;

  const mode =
    normalizeMode(
      botState.requestedMode
    );

  /*
     LIVE safety.

     LIVE cannot execute if MT5 reports DEMO.
  */

  if (
    mode === "LIVE" &&
    normalizeMode(
      mt5Bridge.mode
    ) !== "LIVE"
  ) {
    console.log(
      "LIVE trade blocked: MT5 is not reporting LIVE."
    );

    returnnull;
  }

  mt5Command = {
    id:
      createCommandId(),

    action:
      signal,

    mode,

    symbol:
      normalizeSymbol(
        candle.symbol ||
        BOT_CONFIG.symbol
      ),

    timeframe:
      normalizeTimeframe(
        candle.timeframe ||
        BOT_CONFIG.timeframe
      ),

    volume:
      BOT_CONFIG.minimumLot,

    sl:
      Number(sl.toFixed(8)),

    tp:
      Number(tp.toFixed(8)),

    reason:
      "MT5_CANDLE_AI_SIGNAL",

    payload: {
      signal,

      confidence:
        analysis.confidence,

      buyScore:
        analysis.buyScore,

      sellScore:
        analysis.sellScore,

      ema20:
        analysis.ema20,

      ema50:
        analysis.ema50,

      rsi:
        analysis.rsi,

      macd:
        analysis.macd,

      atr:
        analysis.atr,

      candleTime:
        candle.startTime
    },

    createdAt:
      new Date().toISOString()
  };

  console.log(
    "========================================"
  );

  console.log(
    "AI MONSTER U TRADE COMMAND"
  );

  console.log(
    `MODE: ${mode}`
  );

  console.log(
    `SYMBOL: ${mt5Command.symbol}`
  );

  console.log(
    `TIMEFRAME: ${mt5Command.timeframe}`
  );

  console.log(
    `ACTION: ${mt5Command.action}`
  );

  console.log(
    `LOT: ${mt5Command.volume}`
  );

  console.log(
    `SL: ${mt5Command.sl}`
  );
   console.log(
    `TP: ${mt5Command.tp}`
  );

  console.log(
    `CONFIDENCE: ${analysis.confidence}`
  );

  console.log(
    `COMMAND ID: ${mt5Command.id}`
  );

  console.log(
    "========================================"
  );

  returnmt5Command;
}

/* =========================================================
   START BOT
========================================================= */

app.post(
  "/api/trading/start",
  (req, res) => {
    try {
      const requestedMode =
        normalizeMode(
          req.body?.mode ||
          req.body?.executionMode ||
          "DEMO"
        );

      const requestedSymbol =
        normalizeSymbol(
          req.body?.symbol ||
          BOT_CONFIG.symbol
        );

      const requestedTimeframe =
        normalizeTimeframe(
          req.body?.timeframe ||
          BOT_CONFIG.timeframe
        );

      /*
         LIVE requires a live MT5 connection.
      */

      if (
        requestedMode === "LIVE"
      ) {
        if (!isHeartbeatAlive()) {
          returnres.status(400).json({
            ok: false,
            running: false,

            error:
              "MT5 is not connected. Connect the MT5 account first."
          });
        }

        if (
          normalizeMode(
            mt5Bridge.mode
          ) !== "LIVE"
        ) {
          returnres.status(400).json({
            ok: false,
            running: false,

            error:
              "LIVE selected, but MT5 is reporting DEMO."
          });
        }
      }

      botState = {
        ...botState,

        running: true,

        requestedMode: requestedMode,

        symbol: requestedSymbol,

        timeframe: requestedTimeframe,

        startedAt:
          new Date().toISOString(),

        stoppedAt: null
      };

      mt5Command = {
        id:
          createCommandId("START"),

        action:
          "START_BOT",

        mode:
          requestedMode,

        symbol:
          requestedSymbol,

        timeframe:
          requestedTimeframe,

        volume:
          BOT_CONFIG.minimumLot,

        sl: 0,
        tp: 0,

        reason:
          "USER_START_BOT",

        payload: {
          symbol:
            requestedSymbol,

          timeframe:
            requestedTimeframe,

          mode:
            requestedMode
        },

        createdAt:
          new Date().toISOString()
      };

      if (
        engine &&
        typeof engine.start === "function"
      ) {
        try {
          engine.start();
        } catch (error) {
          console.warn(
            "TradingEngine start warning:",
            error?.message || error
          );
        }
      }

      console.log(
        "========================================"
      );

      console.log(
        "AI MONSTER U START_BOT"
      );

      console.log(
        `MODE: ${requestedMode}`
      );

      console.log(
        `SYMBOL: ${requestedSymbol}`
      );

      console.log(
        `TIMEFRAME: ${requestedTimeframe}`
      );

      console.log(
        "BOT RUNNING: TRUE"
      );

      console.log(
        `COMMAND: ${mt5Command.id}`
      );

      console.log(
        "========================================"
      );

      returnres.json({
        ok: true,

        running: true,

        mode:
          requestedMode,

        symbol:
          requestedSymbol,

        timeframe:
          requestedTimeframe,

        command:
          mt5Command,

        message:
          `AI MONSTER U ${requestedMode} trading started.`
      });
    } catch (error) {
      console.error(
        "START_BOT error:",
        error
      );

     return res.status(500).json({
        ok: false,

        error:
          error?.message ||
          "Failed to start trading"
      });
    }
  }
);

/* =========================================================
   STOP BOT
========================================================= */

app.post(
  "/api/trading/stop",
  (req, res) => {
    try {
      botState.running = false;

      botState.stoppedAt =
        new Date().toISOString();

      if (
         engine &&
        typeof engine.stop === "function"
      ) {
        try {
          engine.stop();
        } catch (error) {
          console.warn(
            "TradingEngine stop warning:",
            error?.message || error
          );
        }
      }

      mt5Command = {
        id:
          createCommandId("STOP"),

        action:
          "STOP_BOT",

        mode:
          normalizeMode(
            botState.requestedMode
          ),

        symbol:
          botState.symbol,

        timeframe:
          botState.timeframe,

        volume:
          BOT_CONFIG.minimumLot,

        sl: 0,
        tp: 0,

        reason:
          "USER_STOP_BOT",

        payload: null,

        createdAt:
          new Date().toISOString()
      };

      console.log(
        "AI MONSTER U STOP_BOT"
      );

      return res.json({
        ok: true,

        running: false,

        command:
          mt5Command,

        message:
          "AI MONSTER U trading stopped."
      });
    } catch (error) {
      console.error(
        "STOP_BOT error:",
        error
      );

      return res.status(500).json({
        ok: false,

        error:
          error?.message ||
          "Failed to stop trading"
      });
    }
  }
);

/* =========================================================
   MT5 CANDLE
========================================================= */

app.post(
  "/api/mt5/candle",
  (req, res) => {
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
      } = req.body || {};

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
          error:
            "Incomplete MT5 candle"
        });
      }

      if (complete !== true) {
        return res.json({
          ok: true,
          processed: false,
          reason:
            "Candle is not complete"
        });
      }

      const candle = {
        symbol:
          normalizeSymbol(symbol),

        timeframe:
          normalizeTimeframe(timeframe),

        open:
          Number(open),

        high:
          Number(high),

        low:
          Number(low),

        close:
          Number(close),

        volume:
          Number(volume) || 0,

        startTime:
          Number(startTime) ||
          Date.now(),

        endTime:
          Number(endTime) ||
          Date.now(),

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
          error:
            "Invalid candle price data"
        });
      }

      const key =
        getMarketKey(
          candle.symbol,
          candle.timeframe
        );

      if (!candleHistory.has(key)) {
        candleHistory.set(key, []);
      }

      const candles =
        candleHistory.get(key);

      const duplicate =
        candles.some(
          (item) =>
            item.startTime ===
            candle.startTime
        );

      if (!duplicate) {
        candles.push(candle);
      }

      while (
        candles.length >
        MAX_CANDLES
      ) {
        candles.shift();
      }

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

          candlesAvailable:
            candles.length
        });
      }

      lastProcessedCandle.set(
        key,
        candle.startTime
      );

      const analysis =
        analyzeMT5Market(
          candles
        );

      botState.lastCandle =
        candle;

      botState.lastSignal =
         analysis.signal;

      botState.lastConfidence =
        analysis.confidence;

      botState.lastAnalysis =
        analysis;

      let command = null;

      if (botState.running) {
        const correctSymbol =
          candle.symbol ===
          botState.symbol;

        const correctTimeframe =
          candle.timeframe ===
          botState.timeframe;

        if (
          correctSymbol &&
          correctTimeframe
        ) {
          if (
            mt5Command.action ===
            "NONE"
          ) {
            command =
              createMT5TradeCommand(
                analysis.signal,
                candle,
                analysis
              );
          }
        }
      }

      console.log(
        "----------------------------------------"
      );

      console.log(
        "NEW COMPLETED MT5 CANDLE"
      );

      console.log(
        `SYMBOL: ${candle.symbol}`
      );

      console.log(
        `TIMEFRAME: ${candle.timeframe}`
      );

      console.log(
        `CANDLE: ${new Date(
          candle.startTime
        ).toISOString()}`
      );

      console.log(
        `BOT RUNNING: ${botState.running}`
      );

      console.log(
        `MODE: ${botState.requestedMode}`
      );

      console.log(
        `SIGNAL: ${analysis.signal}`
      );

      console.log(
        `CONFIDENCE: ${analysis.confidence}`
      );

      console.log(
        "----------------------------------------"
      );

      return res.json({
        ok: true,

        processed: true,

        candle,

        candlesAvailable:
          candles.length,

        botRunning:
          botState.running,

        mode:
          botState.requestedMode,

        analysis,

        command
      });
    } catch (error) {
      console.error(
        "MT5 candle error:",
        error
      );

      return res.status(500).json({
        ok: false,

        error:
          error?.message ||
          "Candle processing failed"
      });
    }
  }
);

/* =========================================================
   MT5 HEARTBEAT
========================================================= */

app.post(
  "/api/mt5/heartbeat",
  (req, res) => {
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
      } = req.body || {};

      if (
        account === undefined ||
        broker === undefined ||
        server === undefined
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "Invalid MT5 heartbeat"
        });
      }

      const reportedMode =
        normalizeMode(mode);

      mt5Bridge = {
        connected: true,

        lastHeartbeat:
          new Date().toISOString(),

        mode:
          reportedMode,

        account:
          String(account),

        broker:
          String(broker),

        server:
          String(server),

        currency:
          currency !== undefined
            ? String(currency)
            : null,

        balance:
          safeNumber(balance),

        equity:
          safeNumber(equity),

        margin:
          safeNumber(margin),

        freeMargin:
          safeNumber(freeMargin),

        symbol:
          symbol
            ? normalizeSymbol(symbol)
            : BOT_CONFIG.symbol,

        timeframe:
          timeframe
            ? normalizeTimeframe(timeframe)
            : BOT_CONFIG.timeframe,

        bid:
          safeNumber(bid),

        ask:
          safeNumber(ask),

        updatedAt:
          new Date().toISOString()
      };

      console.log(
        `AI MONSTER U HEARTBEAT OK | Account: ${mt5Bridge.account} | Broker: ${mt5Bridge.broker}`
      );

      return res.json({
        ok: true,

        received: true,

        connected: true,

        mode:
          mt5Bridge.mode,

        account:
          mt5Bridge.account,

        broker:
          mt5Bridge.broker,

        server:
           mt5Bridge.server,

        botRunning:
          botState.running,

        requestedMode:
          botState.requestedMode
      });
    } catch (error) {
      console.error(
        "Heartbeat error:",
        error
      );

      return res.status(400).json({
        ok: false,

        error:
          error?.message ||
          "Heartbeat failed"
      });
    }
  }
);

/* =========================================================
   MT5 STATUS
========================================================= */

app.get(
  "/api/mt5/status",
  (req, res) => {
    const connected =
      isHeartbeatAlive();

    mt5Bridge.connected =
      connected;

    return res.json({
      ok: true,

      connected,

      mode:
        mt5Bridge.mode,

      requestedMode:
        botState.requestedMode,

      account:
        mt5Bridge.account,

      broker:
        mt5Bridge.broker,

      server:
        mt5Bridge.server,

      currency:
        mt5Bridge.currency,

      balance:
        mt5Bridge.balance,

      equity:
        mt5Bridge.equity,

      margin:
        mt5Bridge.margin,

      freeMargin:
        mt5Bridge.freeMargin,

      symbol:
        mt5Bridge.symbol,

      timeframe:
        mt5Bridge.timeframe,

      bid:
        mt5Bridge.bid,

      ask:
        mt5Bridge.ask,

      lastHeartbeat:
        mt5Bridge.lastHeartbeat,

      heartbeatAgeMs:
        mt5Bridge.lastHeartbeat
          ? Date.now() -
            new Date(
              mt5Bridge.lastHeartbeat
            ).getTime()
          : null
    });
  }
);

/* =========================================================
   MT5 COMMAND
========================================================= */

app.get(
  "/api/mt5/command",
  (req, res) => {
    const connected =
      isHeartbeatAlive();

    if (!connected) {
      return res.json({
        ok: true,

        botRunning:
          Boolean(
            botState.running
          ),

        mt5Connected: false,

        mt5Account:
          mt5Bridge.account,

        mt5Mode:
          mt5Bridge.mode,

        symbol:
          botState.symbol,

        timeframe:
          botState.timeframe,

        pendingCommand:
          mt5Command.action !==
          "NONE",

        command:
          mt5Command,

        lastExecution:
          mt5Execution,

        reason:
          "MT5 bridge offline",

        time:
          new Date().toISOString()
      });
    }

    if (
      mt5Command.action ===
      "NONE"
    ) {
      return res.json({
        ok: true,

        command:
          mt5Command,

        botRunning:
          botState.running,

        requestedMode:
          botState.requestedMode,

        reason:
          "NO_PENDING_COMMAND"
      });
    }

    /*
       LIVE command safety.
    */

    if (
      mt5Command.mode ===
        "LIVE" &&
      normalizeMode(
        mt5Bridge.mode
      ) !== "LIVE"
    ) {
      return res.json({
        ok: true,

        command: {
          action: "NONE"
        },

        reason:
          "LIVE command blocked because MT5 account is not LIVE"
      });
    }

    return res.json({
      ok: true,

      command:
        mt5Command,

      botRunning:
        botState.running,

      requestedMode:
        botState.requestedMode
    });
  }
);

/* =========================================================
   MT5 COMMAND ACK
========================================================= */

app.post(
  "/api/mt5/command/ack",
  (req, res) => {
    try {
      const {
        id,
        status,
        action,
        ticket,
        symbol,
        volume,
        price,
        profit,
        message
      } = req.body || {};

      if (
        !id ||
        !status
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "Incomplete acknowledgement"
        });
      }

      mt5Execution = {
        id:
          String(id),

        status:
          String(status),

        action:
          action ||
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
          safeNumber(volume),

        price:
          safeNumber(price),

        profit:
          safeNumber(profit),

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
          `ACK_${String(
            status
          ).toUpperCase()}`
        );
      }

      console.log(
        "MT5 COMMAND ACK:",
        JSON.stringify(
          mt5Execution
        )
      );

      return res.json({
        ok: true,

        received: true,

        execution:
          mt5Execution
      });
    } catch (error) {
      console.error(
        "ACK error:",
        error
      );

      return res.status(400).json({
        ok: false,

        error:
          error?.message ||
          "Acknowledgement failed"
      });
    }
  }
);

/* =========================================================
   TRADING STATUS
========================================================= */

app.get(
  "/api/trading/status",
  (req, res) => {
    let engineStatus = {};

    try {
      if (
        engine &&
        typeof engine.getStatus ===
          "function"
      ) {
        engineStatus =
          engine.getStatus();
      }
    } catch (error) {
      engineStatus = {
        error:
          error?.message ||
          "Engine status unavailable"
      };
    }

    return res.json({
      ok: true,

      running:
        botState.running,

      mode:
        botState.requestedMode,

      requestedMode:
        botState.requestedMode,

      symbol:
        botState.symbol,

      timeframe:
        botState.timeframe,

      startedAt:
        botState.startedAt,

      stoppedAt:
        botState.stoppedAt,

      lastCandle:
        botState.lastCandle,

      lastSignal:
        botState.lastSignal,

      lastConfidence:
        botState.lastConfidence,

      pendingCommand:
        mt5Command,

      lastExecution:
        mt5Execution,

      mt5: {
        ...mt5Bridge,

        connected:
          isHeartbeatAlive()
      },

      engine:
        engineStatus
    });
  }
);

/* =========================================================
   LAST EXECUTION
========================================================= */

app.get(
  "/api/mt5/execution",
  (req, res) => {
    return res.json({
      ok: true,

      execution:
        mt5Execution
    });
  }
);

/* =========================================================
   MT5 ANALYSIS
========================================================= */

app.get(
  "/api/mt5/analysis",
  (req, res) => {
    const symbol =
      normalizeSymbol(
        req.query.symbol ||
        mt5Bridge.symbol ||
        BOT_CONFIG.symbol
      );

    const timeframe =
      normalizeTimeframe(
        req.query.timeframe ||
        mt5Bridge.timeframe ||
        BOT_CONFIG.timeframe
      );

    const key =
      getMarketKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    return res.json({
      ok: true,

      symbol,

      timeframe,

      candlesAvailable:
        candles.length,

      latestCandle:
        candles.length > 0
          ? candles[
              candles.length - 1
            ]
          : null,

      analysis:
        analyzeMT5Market(
          candles
        )
    });
  }
);

/* =========================================================
   CANDLE HISTORY
========================================================= */

app.get(
  "/api/mt5/candles",
  (req, res) => {
    const symbol =
      normalizeSymbol(
        req.query.symbol ||
        mt5Bridge.symbol ||
        BOT_CONFIG.symbol
      );

    const timeframe =
       normalizeTimeframe(
        req.query.timeframe ||
        mt5Bridge.timeframe ||
        BOT_CONFIG.timeframe
      );

    const key =
      getMarketKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    return res.json({
      ok: true,

      symbol,

      timeframe,

      count:
        candles.length,

      candles
    });
  }
);

/* =========================================================
   CONFIG
========================================================= */

app.get(
  "/api/config",
  (req, res) => {
    return res.json({
      ok: true,

      service:
        "AI MONSTER U",

      executionMode:
        botState.requestedMode,

      demoExecution:
        true,

      liveExecution:
        true,

      symbol:
        BOT_CONFIG.symbol,

      timeframe:
        BOT_CONFIG.timeframe,

      minimumLot:
        BOT_CONFIG.minimumLot,

      rewardRisk:
        BOT_CONFIG.rewardRisk,

      strategy: {
        emaFast: 20,
        emaSlow: 50,
        emaTrend: 200,

        rsiPeriod: 14,
        rsiBuy: 55,
        rsiSell: 45,

        macdFast: 12,
        macdSlow: 26,

        atrPeriod: 14,

        breakoutConfirmation: true
      },

      supportedModes: [
        "DEMO",
        "LIVE"
      ],

      supportedTimeframes:
        SUPPORTED_TIMEFRAMES,

      supportedSymbols: [
        "BTCUSDm"
      ],

      maxCandles:
        MAX_CANDLES
    });
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    return res.json({
      ok: true,

      service:
        "AI MONSTER U",

      mode:
        botState.requestedMode,

      botRunning:
        botState.running,

      mt5Connected:
        isHeartbeatAlive(),

      mt5Account:
        mt5Bridge.account,

      mt5Mode:
        mt5Bridge.mode,

      symbol:
        botState.symbol,

      timeframe:
        botState.timeframe,

      pendingCommand:
        mt5Command.action !==
        "NONE",

      command:
        mt5Command,

      lastExecution:
        mt5Execution,

      time:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   API INFO
========================================================= */

app.get(
  "/api",
  (req, res) => {
    return res.json({
      ok: true,

      service:
        "AI MONSTER U Trading Backend",

      version:
        "2.0.0",

      demo:
        true,

      live:
        true,

      mt5Connected:
        isHeartbeatAlive(),

      renderBackend:
        "https://ai-monster-u-1.onrender.com",

      endpoints: {
        health:
          "/api/health",

        config:
          "/api/config",

        mt5Status:
          "/api/mt5/status",

        mt5Heartbeat:
          "/api/mt5/heartbeat",

        mt5Candle:
          "/api/mt5/candle",

        mt5Command:
          "/api/mt5/command",

        mt5CommandAck:
          "/api/mt5/command/ack",

        mt5Execution:
          "/api/mt5/execution",

        tradingStart:
          "/api/trading/start",

        tradingStop:
          "/api/trading/stop",

        tradingStatus:
          "/api/trading/status",

        analysis:
          "/api/mt5/analysis",

        candles:
          "/api/mt5/candles"
      }
    });
  }
);

/* =========================================================
   API 404
========================================================= */

app.use(
  "/api",
  (req, res) => {
    return res.status(404).json({
      ok: false,

      error:
        "API endpoint not found",

      path:
        req.originalUrl
    });
  }
);

/* =========================================================
   GENERAL ERROR
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).
       json({
      ok: false,

      error:
        error?.message ||
        "Internal server error"
    });
  }
);

/* =========================================================
   SERVER START
========================================================= */

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
      "MT5 CANDLE ENGINE READY"
    );

    console.log(
      "DEMO EXECUTION ENABLED"
    );

    console.log(
      "LIVE EXECUTION SAFETY ENABLED"
    );

  console.log(
  "RENDER BACKEND: https://ai-monster-u-1.onrender.com"
);

    console.log(
      `SYMBOL: ${BOT_CONFIG.symbol}`
    );

    console.log(
      `TIMEFRAME: ${BOT_CONFIG.timeframe}`
    );

    console.log(
      `MINIMUM LOT: ${BOT_CONFIG.minimumLot}`
    );

    console.log(
      `REWARD/RISK: 1:${BOT_CONFIG.rewardRisk}`
    );

    console.log(
      `PORT: ${PORT}`
    );

    console.log(
      `TIME: ${new Date().toISOString()}`
    );

    console.log(
      "========================================"
    );
  }
);
