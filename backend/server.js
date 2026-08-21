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

const engine = new TradingEngine();

/* =========================================================
   GLOBAL BOT CONFIGURATION
========================================================= */

const BOT_CONFIG = {
  symbol: "BTCUSDm",
  timeframe: "1m",
  minimumLot: 0.01,
  rewardRisk: 1.5,
  maxCandles: 300
};

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
   COMMAND STATE
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
   EXECUTION STATE
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
  return ${symbol}:${timeframe};
}

function getCandleKey(symbol, timeframe) {
  return getMarketKey(symbol, timeframe);
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

function normalizeMode(mode) {
  const value = String(mode || "DEMO").toUpperCase();

  return value === "LIVE" ? "LIVE" : "DEMO";
}

function isHeartbeatAlive() {
  if (!mt5Bridge.lastHeartbeat) {
    return false;
  }

  const heartbeatTime =
    new Date(mt5Bridge.lastHeartbeat).getTime();
  if (!Number.isFinite(heartbeatTime)) {
    return false;
  }

  return Date.now() - heartbeatTime < 30000;
}

function resetMT5Command(reason = null) {
  mt5Command = {
    id: null,

    action: "NONE",

    mode: botState.requestedMode,

    symbol: BOT_CONFIG.symbol,

    timeframe: BOT_CONFIG.timeframe,

    volume: BOT_CONFIG.minimumLot,

    sl: 0,

    tp: 0,

    reason,

    payload: null,

    createdAt: null
  };
}

function createCommandId(prefix = "AMU") {
  return `${prefix}-${Date.now()}-${Math.floor(
    Math.random() * 100000
  )}`;
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
      (numbers[i] - ema) *
        multiplier +
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
        averageGain *
          (period - 1) +
        gain
      ) / period;

    averageLoss =
      (
        averageLoss *
          (period - 1) +
        loss
      ) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs =
    averageGain /
    averageLoss;

  return (
    100 -
    100 / (1 + rs)
  );
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
    const current =
      candles[i];

    const previous =
      candles[i - 1];

    const high =
      Number(current.high);

    const low =
      Number(current.low);

    const previousClose =
      Number(previous.close);

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(previousClose)
    ) {
      continue;
    }

    const trueRange =
      Math.max(
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

  if (
    trueRanges.length < period
  ) {
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
  if (
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

  if (
    ema20 !== null &&
    ema50 !== null
  ) {
    if (ema20 > ema50) {
      buyScore += 2;

      reasons.push(
        "EMA20 above EMA50"
      );
    }

    if (ema20 < ema50) {
      sellScore += 2;

      reasons.push(
        "EMA20 below EMA50"
      );
    }
  }

  if (rsi !== null) {
    if (
      rsi >= 52 &&
      rsi <= 70
    ) {
      buyScore += 1;

      reasons.push(
        "Bullish RSI momentum"
      );
    }

    if (
      rsi <= 48 &&
      rsi >= 30
    ) {
      sellScore += 1;

      reasons.push(
        "Bearish RSI momentum"
      );
    }
  }

  if (
    last.close >
    last.open
  ) {
    buyScore += 1;

    reasons.push(
      "Bullish completed candle"
    );
  }

  if (
    last.close <
    last.open
  ) {
    sellScore += 1;

    reasons.push(
      "Bearish completed candle"
    );
  }

  if (
    last.close >
    previous.high
  ) {
    buyScore += 2;

    reasons.push(
      "Previous candle high breakout"
    );
  }

  if (
    last.close <
    previous.low
  ) {
    sellScore += 2;

    reasons.push(
      "Previous candle low breakdown"
    );
  }

  let signal = "WAIT";

  if (
    buyScore >= 3 &&
    buyScore > sellScore
  ) {
    signal = "BUY";
  }

  if (
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
          50 +
            strongestScore * 7
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

    price:
      Number(last.close),

    reasons
  };
}

/* =========================================================
   CREATE TRADE COMMAND
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
    return null;
  }

  if (
    mt5Command.action !== "NONE"
  ) {
    return null;
  }

  const price =
    Number(candle.close);

  if (
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
        stopDistance *
          rewardRisk
      : price -
        stopDistance *
          rewardRisk;

  const mode =
    normalizeMode(
      botState.requestedMode
    );

  mt5Command = {
    id:
      createCommandId(),

    action:
      signal,

    mode,

    symbol:
      String(
        candle.symbol ||
          BOT_CONFIG.symbol
      ),

    timeframe:
      String(
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
        analysis.atr
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
    MODE: ${mode}
  );

  console.log(
    SYMBOL: ${mt5Command.symbol}
  );

  console.log(
    TIMEFRAME: ${mt5Command.timeframe}
  );

  console.log(
    ACTION: ${mt5Command.action}
  );

  console.log(
    LOT: ${mt5Command.volume}
  );

  console.log(
    SL: ${mt5Command.sl}
  );

  console.log(
    TP: ${mt5Command.tp}
  );

  console.log(
    CONFIDENCE: ${analysis.confidence}
  );

  console.log(
    COMMAND ID: ${mt5Command.id}
  );

  console.log(
    "========================================"
  );

  return mt5Command;
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
        String(
          req.body?.symbol ||
            BOT_CONFIG.symbol
        );

      const requestedTimeframe =
        String(
          req.body?.timeframe ||
            BOT_CONFIG.timeframe
        );

      /*
      Safety check:
      LIVE can only be requested when
      the MT5 bridge reports a REAL account.
      */

      if (
        requestedMode === "LIVE"
      ) {
        const accountMode =
          String(
            mt5Bridge.mode ||
              ""
          ).toUpperCase();

        if (
          !isHeartbeatAlive()
        ) {
          return res.status(400).json({
            ok: false,

            error:
              "MT5 is not connected. Connect the real MT5 account first."
          });
        }

        if (
          accountMode !==
          "LIVE"
        ) {
          return res.status(400).json({
            ok: false,

            error:
              "LIVE mode selected, but MT5 is not reporting a LIVE account."
          });
        }
      }

      botState = {
        ...botState,

        running: true,

        requestedMode,

        symbol:
          requestedSymbol,

        timeframe:
          requestedTimeframe,

        startedAt:
          new Date().toISOString(),

        stoppedAt: null
      };

      /*
      Send START command to EA.
      */

      mt5Command = {
        id:
          createCommandId(
            "START"
          ),

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
            requestedTimeframe
        },

        createdAt:
          new Date().toISOString()
      };

      try {
        engine.start();
      } catch (engineError) {
        console.warn(
          "Trading engine start warning:",
          engineError.message
        );
      }

      console.log(
        "========================================"
      );

      console.log(
        "AI MONSTER U START_BOT"
      );

      console.log(
        MODE: ${requestedMode}
      );

      console.log(
        SYMBOL: ${requestedSymbol}
      );

      console.log(
        TIMEFRAME: ${requestedTimeframe}
      );

      console.log(
        "BOT RUNNING: TRUE"
      );

      console.log(
        COMMAND: ${mt5Command.id}
      );

      console.log(
        "========================================"
      );

      res.json({
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
          AI MONSTER U ${requestedMode} trading started. Waiting for MT5 confirmation.
      });
    } catch (error) {
      console.error(
        "START_BOT error:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error.message
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
        engine.stop();
      } catch (engineError) {
        console.warn(
          "Trading engine stop warning:",
          engineError.message
        );
      }

      mt5Command = {
        id:
          createCommandId(
            "STOP"
          ),

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

      res.json({
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

      res.status(500).json({
        ok: false,

        error:
          error.message
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

          error:
            "Incomplete MT5 candle"
        });
      }

      if (
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
        symbol:
          String(symbol),

        timeframe:
          String(timeframe),

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
        getCandleKey(
          candle.symbol,
          candle.timeframe
        );

      if (
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
        lastProcessedCandle.get(
          key
        );

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

      /*
      Only generate trades when
      the bot is actually running.
      */

      if (
        botState.running
      ) {
        /*
        Make sure the candle belongs
        to the configured symbol/timeframe.
        */

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
          /*
          Do not create another trade
          while one command is pending.
          */

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
        SYMBOL: ${candle.symbol}
      );

      console.log(
        TIMEFRAME: ${candle.timeframe}
      );

      console.log(
        `CANDLE: ${new Date(
          candle.startTime
        ).toISOString()}`
      );

      console.log(
        BOT RUNNING: ${botState.running}
      );

      console.log(
        MODE: ${botState.requestedMode}
      );

      console.log(
        SIGNAL: ${analysis.signal}
      );

      console.log(
        CONFIDENCE: ${analysis.confidence}
      );

      console.log(
        "----------------------------------------"
      );

      res.json({
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

      res.status(500).json({
        ok: false,

        error:
          error.message
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
      } = req.body;

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
        normalizeMode(
          mode
        );

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
          Number(balance) || 0,

        equity:
          Number(equity) || 0,

        margin:
          Number(margin) || 0,

        freeMargin:
          Number(freeMargin) || 0,

        symbol:
          symbol
            ? String(symbol)
            : BOT_CONFIG.symbol,

        timeframe:
          timeframe
            ? String(timeframe)
            : BOT_CONFIG.timeframe,

        bid:
          Number(bid) || 0,

        ask:
          Number(ask) || 0,

        updatedAt:
          new Date().toISOString()
      };

      res.json({
        ok: true,

        received: true,

        mode:
          mt5Bridge.mode,

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

      res.status(400).json({
        ok: false,

        error:
          error.message
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

    res.json({
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

        command: {
          action:
            "NONE"
        },

        reason:
          "MT5 bridge offline"
      });
    }

    /*
    If the bot is stopped, make sure
    EA receives STOP_BOT.
    */

    if (
      !botState.running &&
      mt5Command.action !==
        "STOP_BOT"
    ) {
      return res.json({
        ok: true,

        command: {
          action:
            "NONE"
        },

        reason:
          "BOT_STOPPED"
      });
    }

    /*
    LIVE safety:
    The EA may only execute LIVE when
    the backend heartbeat reports LIVE.
    */

    if (
      mt5Command.action !==
        "NONE" &&
      mt5Command.mode ===
        "LIVE" &&
      mt5Bridge.mode !==
        "LIVE"
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

    res.json({
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
      } = req.body;

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

      /*
      Command was received by EA.
      Clear it so the next candle can
      generate a new command.
      */

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

      res.json({
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

      res.status(400).json({
        ok: false,

        error:
          error.message
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
      engineStatus =
        engine.getStatus();
    } catch (error) {
      engineStatus = {
        error:
          error.message
      };
    }

    res.json({
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

      mt5:
        mt5Bridge,

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
    res.json({
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
      String(
        req.query.symbol ||
          mt5Bridge.symbol ||
          BOT_CONFIG.symbol
      );

    const timeframe =
      String(
        req.query.timeframe ||
          mt5Bridge.timeframe ||
          BOT_CONFIG.timeframe
      );

    const key =
      getCandleKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    res.json({
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
      String(
        req.query.symbol ||
          mt5Bridge.symbol ||
          BOT_CONFIG.symbol
      );

    const timeframe =
      String(
        req.query.timeframe ||
          mt5Bridge.timeframe ||
          BOT_CONFIG.timeframe
      );

    const key =
      getCandleKey(
        symbol,
        timeframe
      );

    const candles =
      candleHistory.get(key) ||
      [];

    res.json({
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
    res.json({
      ok: true,

      service:
        "AI MONSTER U",

      executionMode:
        botState.requestedMode,

      liveExecution:
        true,

      demoExecution:
        true,

      symbol:
        BOT_CONFIG.symbol,

      timeframe:
        BOT_CONFIG.timeframe,

      minimumLot:
        BOT_CONFIG.minimumLot,

      commandVolume:
        BOT_CONFIG.minimumLot,

      rewardRisk:
        BOT_CONFIG.rewardRisk,

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
    res.json({
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

      time:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   API 404
========================================================= */

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

/* =========================================================
   GENERAL ERROR
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      ok: false,

      error:
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
      SYMBOL: ${BOT_CONFIG.symbol}
    );

    console.log(
      TIMEFRAME: ${BOT_CONFIG.timeframe}
    );

    console.log(
      MINIMUM LOT: ${BOT_CONFIG.minimumLot}
    );

    console.log(
      PORT: ${PORT}
    );

    console.log(
      TIME: ${new Date().toISOString()}
    );

    console.log(
      "========================================"
    );
  }
);
