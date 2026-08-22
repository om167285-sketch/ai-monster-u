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
} catch (error) {
  console.warn(
    "TradingEngine could not be initialized:",
    error?.MESSAGE || error
  );
}

/* =========================================================
   GLOBAL CONFIG
========================================================= */
function normalizeMode(mode) {
  const value = String(mode ?? "").trim().toUpperCase();

  if (value === "LIVE") {
    return "LIVE";
  }

  if (value === "DEMO") {
    return "DEMO";
  }

  return "DEMO";
}

function isHeartbeatAlive() {
  const lastHeartbeat = mt5Bridge?.lastHeartbeat;

  if (!lastHeartbeat) {
    return false;
  }

  const heartbeatTime = new Date(lastHeartbeat).getTime();

  if (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  const age = Date.now() - heartbeatTime;

  return age >= 0 && age <= 15000;
}

const BOT_CONFIG = {
  SYMBOL    : "BTCUSDm",
  timeframe: "1m",
  minimumLot: 0.01,
  rewardRisk: 1.5,
  maxCandles: 300
};

const supported_TIMEFRAMES = [
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

  lastheartbeat: null,

  MODE: "DEMO",

  account: null,
  broker: null,
  server: null,
  currency: null,

  balance: 0,
  equity: 0,
  margin: 0,
  freeMargin: 0,

  SYMBOL    : BOT_CONFIG.SYMBOL    ,
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

  requestedMODE: "DEMO",

  SYMBOL    : BOT_CONFIG.SYMBOL    ,

  timeframe: BOT_CONFIG.timeframe,

  startedAt: null,

  stoppedAt: null,

  lastCandle: null,

  lastSignal: "WAIT",

  lastConfidence: 0,

  lastAnalysis: null
};

/* =========================================================
   command STATE
========================================================= */

let mt5command = {
  id: null,

  action: "NONE",

  MODE: "DEMO",

  SYMBOL    : BOT_CONFIG.SYMBOL    ,

  timeframe: BOT_CONFIG.timeframe,

  volume: BOT_CONFIG.minimumLot,

  sl: 0,

  tp: 0,

  reason: null,

  payload: null,

  createdAt: null
};

/* =========================================================
   EXECUTION STATE
========================================================= */

let mt5Execution = {
  id: null,

  status: "NONE",

  action: null,

  ticket: null,

  SYMBOL    : null,

  volume: 0,

  price: 0,

  profit: 0,

  MESSAGE: null,

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

function getMarketKey(SYMBOL    , timeframe) {
  return `${SYMBOL    }:${timeframe}`;
}

function normalizeMODE(MODE) {
  const value = String(MODE || "DEMO").trim().toUpperCase();

  if (value === "LIVE") {
    return "LIVE";
  }

  return "DEMO";
}

function normalizeTimeframe(timeframe) {
  const value = String(
    timeframe || BOT_CONFIG.timeframe
  ).trim();

  if (supported_TIMEFRAMES.includes(value)) {
    return value;
  }

  return BOT_CONFIG.timeframe;
}

function normalizeSYMBOL    (SYMBOL    ) {
  const value = String(
     SYMBOL    || BOT_CONFIG.SYMBOL   
  ).trim();

  return value || BOT_CONFIG.SYMBOL   ;
}

function createcommandId(prefix = "AMU") {
  return `${prefix}-${Date.now()}-${Math.floor(
    Math.random() * 1000000
  )}`;
}
function isHeartbeatAlive() {
  const heartbeat = mt5Bridge?.lastHeartbeat;

  IF (!heartbeat) {
    return false;
  }

  const heartbeatTime = new Date(heartbeat).getTime();

  IF (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  // MT5 EA must have sent a heartbeat within the last 30 seconds.
  const age = Date.now() - heartbeatTime;

  return age >= 0 && age <= 30000;
}
function isheartbeatAlive() {
  IF (!mt5Bridge.lastheartbeat) {
    return false;
  }

  const heartbeatTime = new Date(
    mt5Bridge.lastheartbeat
  ).getTime();

  IF (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  return Date.now() - heartbeatTime < 30000;
}

function resetMT5command(reason = null) {
  mt5command = {
    id: null,

    action: "NONE",

    MODE: botState.requestedMODE,

    SYMBOL   : botState.SYMBOL   ,

    timeframe: botState.timeframe,

    volume: BOT_CONFIG.minimumLot,

    sl: 0,

    tp: 0,

    reason,

    payload: null,

    createdAt: null
  };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/* =========================================================
   EMA
========================================================= */

function calculateEMA(values, period) {
  IF (
    !Array.isArray(values) ||
    values.length < period
  ) {
    return null;
  }

  const numbers = values.map(Number);

  IF (
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
  IF (
    !Array.isArray(values) ||
    values.length < period + 1
  ) {
    return null;
  }

  const numbers = values.map(Number);

  IF (
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

    IF (change > 0) {
      gains += change;
    } else IF (change < 0) {
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

  IF (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain /
    averageLoss;

  return 100 - 100 / (1 + rs);
}

/* =========================================================
   ATR
========================================================= */

function calculateATR(
  candles,
  period = 14
) {
  IF (
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

    IF (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(previousClose)
    ) {
      continue;
    }

    const trueRange = Math.max(
      high - low,

      Math.abs(
        high - previousClose
      ),

      Math.abs(
        low - previousClose
      )
    );

    trueRanges.push(trueRange);
  }

  IF (trueRanges.length < period) {
    return null;
  }

  const recent =
    trueRanges.slice(-period);

  return (
    recent.reduce(
      (sum, value) =>
         sum + value,
      0
    ) / recent.length
  );
}

/* =========================================================
   MARKET ANALYSIS
========================================================= */

function analyzeMT5Market(candles) {
  IF (
    !Array.isArray(candles) ||
    candles.length < 55
  ) {
    return {
      signal: "WAIT",

      confidence: 0,

      buyScore: 0,

      sellScore: 0,

      reason:
        "Waiting for at least 55 completed candles",

      ema20: null,

      ema50: null,

      rsi: null,

      atr: null,

      price: null,

      reasons: []
    };
  }

  const closes =
    candles.map(
      (candle) =>
        Number(candle.close)
    );

  const ema20 =
    calculateEMA(
      closes,
      20
    );

  const ema50 =
    calculateEMA(
      closes,
      50
    );

  const rsi =
    calculateRSI(
      closes,
      14
    );

  const atr =
    calculateATR(
      candles,
      14
    );

  const last =
    candles[candles.length - 1];

  const previous =
    candles[candles.length - 2];

  let buyScore = 0;

  let sellScore = 0;

  const reasons = [];

  IF (
    ema20 !== null &&
    ema50 !== null
  ) {
    IF (ema20 > ema50) {
      buyScore += 2;

      reasons.push(
        "EMA20 above EMA50"
      );
    }

    IF (ema20 < ema50) {
      sellScore += 2;

      reasons.push(
        "EMA20 below EMA50"
      );
    }
  }

  IF (rsi !== null) {
    IF (
      rsi >= 52 &&
      rsi <= 70
    ) {
      buyScore += 1;

      reasons.push(
        "Bullish RSI momentum"
      );
    }

    IF (
      rsi <= 48 &&
      rsi >= 30
    ) {
      sellScore += 1;

      reasons.push(
        "Bearish RSI momentum"
      );
    }
  }

  IF (
    Number(last.close) >
    Number(last.open)
  ) {
    buyScore += 1;

    reasons.push(
      "Bullish completed candle"
    );
  }

  IF (
    Number(last.close) <
    Number(last.open)
  ) {
    sellScore += 1;

    reasons.push(
      "Bearish completed candle"
    );
  }

  IF (
    Number(last.close) >
    Number(previous.high)
  ) {
    buyScore += 2;

    reasons.push(
      "Previous candle high breakout"
    );
  }

  IF (
    Number(last.close) <
    Number(previous.low)
  ) {
    sellScore += 2;

    reasons.push(
      "Previous candle low breakdown"
    );
  }

  let signal = "WAIT";

  IF (
    buyScore >= 3 &&
    buyScore > sellScore
  ) {
    signal = "BUY";
  }

  IF (
    sellScore >= 3 &&
    sellScore > buyScore
  ) {
    signal = "SELL";
  }

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

  return {
    signal,

    confidence,

    buyScore,

    sellScore,

    reason:
      signal === "WAIT"
        ? "No valid trade signal"
        : signal === "BUY"
        ? "Bullish setup detected"
        : "Bearish setup detected",

    ema20,

    ema50,

    rsi,

    atr,

    price:
      safeNumber(last.close, null),

    reasons
  };
}

/* =========================================================
   CREATE TRADE command
========================================================= */

function createMT5Tradecommand(
  signal,
  candle,
  analysis
) {
  IF (
    signal !== "BUY" &&
    signal !== "SELL"
  ) {
    return null;
  }

  IF (
    mt5command.action !== "NONE"
  ) {
    return null;
  }

  IF (!isheartbeatAlive()) {
    console.log(
      "Trade skipped: MT5 heartbeat offline."
    );

    return null;
  }

  const price =
    Number(candle.close);

  IF (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }

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

  const MODE =
    normalizeMODE(
      botState.requestedMODE
    );

  /*
  LIVE safety check.
  */

  IF (
    MODE === "LIVE" &&
    normalizeMODE(
      mt5Bridge.MODE
    ) !== "LIVE"
  ) {
    console.log(
      "LIVE trade blocked: MT5 heartbeat is not LIVE."
    );

    return null;
  }

  mt5command = {
    id:
      createcommandId(),

    action:
      signal,

    MODE,

    SYMBOL   :
      normalizeSYMBOL   (
        candle.SYMBOL    ||
          BOT_CONFIG.SYMBOL   
      ),

    timeframe:
      normalizeTimeframe(
        candle.timeframe ||
          BOT_CONFIG.timeframe
      ),

    volume:
      BOT_CONFIG.minimumLot,

    sl:
      Number(
        sl.toFixed(8)
      ),

    tp:
      Number(
        tp.toFixed(8)
      ),

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

      rsi:
        analysis.rsi,

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
    "AI MONSTER U TRADE command"
  );

  console.log(
    `MODE: ${MODE}`
  );

  console.log(
    `SYMBOL   : ${mt5command.SYMBOL   }`
  );

  console.log(
    `TIMEFRAME: ${mt5command.timeframe}`
  );

  console.log(
    `ACTION: ${mt5command.action}`
  );

  console.log(
    `LOT: ${mt5command.volume}`
  );

  console.log(
    `SL: ${mt5command.sl}`
  );

  console.log(
    `TP: ${mt5command.tp}`
  );

  console.log(
    `CONFIDENCE: ${analysis.confidence}`
  );

  console.log(
    `command ID: ${mt5command.id}`
  );

  console.log(
    "========================================"
  );

  return mt5command;
}

/* =========================================================
   START BOT
========================================================= */

app.post(
  "/api/trading/start",
  (req, res) => {
    try {
      const requestedMODE =
        normalizeMODE(
          req.body?.MODE ||
            req.body?.executionMODE ||
            "DEMO"
        );

      const requestedSYMBOL    =
        normalizeSYMBOL   (
          req.body?.SYMBOL    ||
            BOT_CONFIG.SYMBOL   
        );

      const requestedTimeframe =
        normalizeTimeframe(
          req.body?.timeframe ||
            BOT_CONFIG.timeframe
        );

      /*
      LIVE requires a live MT5 heartbeat.
      */

      IF (
        requestedMODE === "LIVE"
      ) {
        IF (!isHeartbeatAlive()) {
          return res.status(400).json({
            ok: false,

            running: false,

            error:
              "MT5 is not connected. Connect the MT5 account first."
          });
        }

        IF (
          normalizeMODE(
            mt5Bridge.MODE
          ) !== "LIVE"
        ) {
          return res.status(400).json({
            ok: false,

            running: false,

            error:
              "LIVE MODE selected, but MT5 is not reporting a LIVE account."
          });
        }
      }

    botState = {
  ...botState,

  running: true,

  requestedMODE,

  SYMBOL: requestedSYMBOL,

  timeframe: requestedTimeframe,

  startedAt: new Date().toISOString(),

  stoppedAt: null
};

mt5command = {
  id: createcommandId("START"),

  action: "START_BOT",

  MODE: requestedMODE,

  SYMBOL: requestedSYMBOL,

  timeframe: requestedTimeframe,

  volume: BOT_CONFIG.minimumLot,

  sl: 0,

  tp: 0,

  reason: "USER_START_BOT",

  payload: {
    SYMBOL: requestedSYMBOL,
    timeframe: requestedTimeframe,
    MODE: requestedMODE
  },

  createdAt: new Date().toISOString()
};

try {
  IF (
    engine &&
    typeof engine.start === "function"
  ) {
    engine.start();
  }
} catch (engineError) {
  console.warn(
    "Trading engine start warning:",
    engineError?.message || engineError
  );
}

console.log(
  "========================================"
);

console.log(
  "AI MONSTER U START_BOT"
);

console.log(
  "========================================"
);

console.log(
  "AI MONSTER U START_BOT"
);

console.log(
  MODE: ${requestedMODE}
);

console.log(
  SYMBOL: ${requestedSYMBOL}
);

console.log(
  TIMEFRAME: ${requestedTimeframe}
);

console.log(
  "BOT RUNNING: TRUE"
);

console.log(
  COMMAND: ${mt5command.id}
);

console.log(
  "========================================"
);
);

console.log(
  `SYMBOL: ${requestedSYMBOL}`
);

console.log(
  `TIMEFRAME: ${requestedTimeframe}`
);

console.log(
  "BOT RUNNING: TRUE"
);

console.log(
  `COMMAND: ${mt5command.id}`
);

console.log(
  "========================================"
);

      return res.json({
        ok: true,

        running: true,

        mode:
          requestedMode,

        SYMBOL   :
          requestedSYMBOL   ,

        timeframe:
          requestedTimeframe,

        command:
          mt5command,

        MESSAGE:
          `COMMAND: AI MONSTER U ${requestedMode} trading started.`
      });
    } catch (error) {
      console.error(
        "START_BOT error:",
        error
      );

      return res.status(500).json({
        ok: false,

        error:
          error?.MESSAGE ||
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

      try {
        IF (
          engine &&
          typeof engine.stop === "function"
        ) {
          engine.stop();
        }
      } catch (engineError) {
        console.warn(
          "Trading engine stop warning:",
          engineError?.MESSAGE ||
            engineError
        );
      }

      mt5command = {
        id:
          createcommandId(
            "STOP"
          ),

        action:
          "STOP_BOT",

        mode:
          normalizeMode(
            botState.requestedMode
          ),

        SYMBOL   :
          botState.SYMBOL   ,

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
          mt5command,

        MESSAGE:
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
          error?.MESSAGE ||
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
        SYMBOL   ,
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

      IF (
        !SYMBOL    ||
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

      IF (
        complete !== true
      ) {
        return res.json({
          ok: true,

          processed: false,

          reason:
            "Candle is not complete"
        });
      }

      const candle = {
        SYMBOL   :
          normalizeSYMBOL   (SYMBOL   ),

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

      IF (
        !Number.isFinite(
          candle.open
        ) ||
        !Number.isFinite(
          candle.high
        ) ||
        !Number.isFinite(
          candle.low
        ) ||
        !Number.isFinite(
          candle.close
        )
      ) {
        return res.status(400).json({
          ok: false,

          error:
            "Invalid candle price data"
        });
      }

      const key =
        getMarketKey(
          candle.SYMBOL   ,
          candle.timeframe
        );

      IF (
        !candleHistory.has(key)
      ) {
        candleHistory.set(
          key,
          []
        );
      }

      const candles =
        candleHistory.get(key);

      const duplicate =
        candles.some(
          (item) =>
            item.startTime ===
            candle.startTime
        );

      IF (!duplicate) {
        candles.push(candle);
      }

      while (
        candles.length >
        MAX_CANDLES
      ) {
        candles.shIFt();
      }

      const previousProcessed =
        lastProcessedCandle.get(
          key
        );

      IF (
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

      IF (
        botState.running
      ) {
        const correctSYMBOL    =
          candle.SYMBOL    ===
          botState.SYMBOL   ;

        const correctTimeframe =
          candle.timeframe ===
          botState.timeframe;

        IF (
          correctSYMBOL    &&
          correctTimeframe
        ) {
          IF (
            mt5command.action ===
            "NONE"
          ) {
            command =
              createMT5Tradecommand(
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
        `SYMBOL   : ${candle.SYMBOL   }`
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
          error?.MESSAGE ||
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
        SYMBOL   ,
        timeframe,
        bid,
        ask
      } = req.body || {};

      IF (
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

        SYMBOL   :
          SYMBOL   
            ? normalizeSYMBOL   (SYMBOL   )
            : BOT_CONFIG.SYMBOL   ,

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
          error?.MESSAGE ||
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

      SYMBOL   :
        mt5Bridge.SYMBOL   ,

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
   MT5 command
========================================================= */

app.get(
  "/api/mt5/command",
  (req, res) => {
    const connected =
      isHeartbeatAlive();

    IF (!connected) {
    return res.json({
  ok: true,

  botRunning: Boolean(botState.running),

  mt5Connected: isHeartbeatAlive(),

  mt5Account: mt5Bridge?.account || null,

  mt5Mode: mt5Bridge?.mode || null,

  SYMBOL: botState.SYMBOL,

  timeframe: botState.timeframe,

  pendingcommand:
    mt5command?.action !== "NONE",

  command: mt5command,

  lastExecution: mt5Execution,

  time: new Date().toISOString()
});

        command: {
          action:
            "NONE"
        },

        reason:
          "MT5 bridge offline"
      });
    }

    IF (
      mt5command.action ===
      "NONE"
    ) {
      return res.json({
        ok: true,

        command:
          mt5command,

        botRunning:
          botState.running,

        requestedMode:
          botState.requestedMode,

        reason:
           "NO_PENDING_command"
      });
    }

    /*
    LIVE commands cannot be sent to
    a DEMO MT5 account.
    */

    IF (
      mt5command.mode ===
        "LIVE" &&
      normalizeMode(
        mt5Bridge.mode
      ) !== "LIVE"
    ) {
      return res.json({
        ok: true,

        command: {
          action:
            "NONE"
        },

        reason:
          "LIVE command blocked because MT5 account is not LIVE"
      });
    }

    return res.json({
      ok: true,

      command:
        mt5command,

      botRunning:
        botState.running,

      requestedMode:
        botState.requestedMode
    });
  }
);

/* =========================================================
   MT5 command ACK
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
        SYMBOL   ,
        volume,
        price,
        profit,
        MESSAGE
      } = req.body || {};

      IF (
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
          mt5command.action,

        ticket:
          ticket !== undefined &&
          ticket !== null
            ? String(ticket)
            : null,

        SYMBOL   :
          SYMBOL    !== undefined &&
          SYMBOL    !== null
            ? String(SYMBOL   )
            : null,

        volume:
          safeNumber(volume),

        price:
          safeNumber(price),

        profit:
          safeNumber(profit),

        MESSAGE:
          MESSAGE !== undefined &&
          MESSAGE !== null
            ? String(MESSAGE)
            : null,

        executedAt:
          new Date().toISOString()
      };

      IF (
        mt5command.id ===
        String(id)
      ) {
        resetMT5command(
          `ACK_${String(
            status
          ).toUpperCase()}`
        );
      }

      console.log(
        "MT5 command ACK:",
        JSON.stringIFy(
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
          error?.MESSAGE ||
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
      IF (
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
          error?.MESSAGE ||
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

      SYMBOL   :
        botState.SYMBOL   ,

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

      pendingcommand:
        mt5command,

      lastExecution:
        mt5Execution,

      mt5:
        {
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
    const SYMBOL    =
      normalizeSYMBOL   (
        req.query.SYMBOL    ||
          mt5Bridge.SYMBOL    ||
          BOT_CONFIG.SYMBOL   
      );

    const timeframe =
      normalizeTimeframe(
        req.query.timeframe ||
          mt5Bridge.timeframe ||
          BOT_CONFIG.timeframe
      );

    const key =
      getMarketKey(
        SYMBOL   ,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    return res.json({
      ok: true,

      SYMBOL   ,

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
    const SYMBOL    =
      normalizeSYMBOL   (
        req.query.SYMBOL    ||
          mt5Bridge.SYMBOL    ||
          BOT_CONFIG.SYMBOL   
      );

    const timeframe =
      normalizeTimeframe(
        req.query.timeframe ||
          mt5Bridge.timeframe ||
          BOT_CONFIG.timeframe
      );

    const key =
      getMarketKey(
        SYMBOL   ,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    return res.json({
      ok: true,

      SYMBOL   ,

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
    returnres.json({
  ok: true,
  service: "AI MONSTER U",
  executionMode: botState.requestedMode,
  liveExecution: true,
  demoExecution: true,

  symbol: BOT_CONFIG.symbol,
  timeframe: BOT_CONFIG.timeframe,

  minimumLot: BOT_CONFIG.minimumLot,
  rewardRisk: BOT_CONFIG.rewardRisk,

  supportedModes: [
    "DEMO",
    "LIVE"
  ],

  supportedTimeframes: [
    "1m",
    "5m",
    "15m",
    "30m",
    "1h",
    "4h"
  ],

  supportedSymbols: [
    "BTCUSDm"
  ],

  maxCandles: MAX_CANDLES
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

      SYMBOL   :
        botState.SYMBOL   ,

      timeframe:
        botState.timeframe,

      pendingcommand:
        mt5command.action !==
        "NONE",

      command:
        mt5command,

      lastExecution:
        mt5Execution,

      time:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   ROOT API INFO
========================================================= */

app.get(
  "/api",
  (req, res) => {
    return res.json({
      ok: true,

      service:
        "AI MONSTER U Trading Backend",

      version:
        "1.0.0",

      demo:
        true,

      live:
        true,

      mt5Connected:
        isHeartbeatAlive(),

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

        mt5command:
          "/api/mt5/command",

        mt5commandAck:
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

    IF (
      res.headersSent
    ) {
      return next(error);
    }

    return res.status(500).json({
      ok: false,

      error:
        error?.MESSAGE ||
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
      "MT5 CANDLE ENGINE"
    );

    console.log(
      "DEMO EXECUTION ENABLED"
    );

    console.log(
      "LIVE EXECUTION ENABLED"
    );

    console.log(
      `SYMBOL   : ${BOT_CONFIG.SYMBOL   }`
    );

    console.log(
      `TIMEFRAME: ${BOT_CONFIG.timeframe}`
    );

    console.log(
      `MINIMUM LOT: ${BOT_CONFIG.minimumLot}`
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
