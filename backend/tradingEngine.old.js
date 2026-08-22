// ============================================================
// AI MONSTER U
// PROFESSIONAL CANDLE-CYCLE TRADING ENGINE
//
// STRATEGY:
// EMA 20 / EMA 50 / EMA 200
// RSI 14
// MACD 12 / 26
// ATR 14
//
// BEHAVIOR:
// 1. Receive completed candle
// 2. Close previous position at candle boundary
// 3. Analyze completed candle data
// 4. Generate BUY / SELL / WAIT
// 5. Demo mode can maintain a simulated position
// 6. Live mode generates a command for the MT5 bridge
// 7. Continue according to selected timeframe
//
// SUPPORTED TIMEFRAMES:
// 1m / 5m / 15m / 30m / 1h / 4h
//
// IMPORTANT:
// This engine does NOT directly connect to a broker.
// Actual MT5 execution must be performed by the MT5 bridge/EA.
// ============================================================

class TradingEngine {
  constructor() {
    // ==========================================================
    // ENGINE STATE
    // ==========================================================

    this.running = false;
    this.mode = "demo";

    this.timeframe = "1m";
    this.symbol = "BTCUSDm";

    this.balance = 50;
    this.startingBalance = 50;

    // Risk management
    this.riskPercent = 1;
    this.maxDailyLossPercent = 3;

    // Position/trade state
    this.position = null;
    this.trades = [];

    this.dailyProfit = 0;
    this.dailyLoss = 0;

    // Candle state
    this.lastCandleTime = null;

    // Analysis state
    this.lastAnalysis = null;
    this.lastSignal = "WAIT";

    // Statistics
    this.totalCandlesProcessed = 0;
    this.totalSignals = 0;
    this.totalTrades = 0;

    // Strategy configuration
    this.settings = {
      emaFast: 20,
      emaMedium: 50,
      emaSlow: 200,

      rsiPeriod: 14,
      rsiBuyLevel: 55,
      rsiSellLevel: 45,

      macdFast: 12,
      macdSlow: 26,

      atrPeriod: 14,

      closeAtCandleBoundary: true,

      minimumConfidence: 60
    };
  }

  // ==========================================================
  // STATUS
  // ==========================================================

  getStatus() {
    return {
      running: this.running,

      mode: this.mode,

      symbol: this.symbol,

      timeframe: this.timeframe,

      balance: Number(this.balance.toFixed(2)),

      startingBalance: Number(
        this.startingBalance.toFixed(2)
      ),

      riskPercent: this.riskPercent,

      maxDailyLossPercent:
        this.maxDailyLossPercent,

      dailyProfit: Number(
        this.dailyProfit.toFixed(2)
      ),

      dailyLoss: Number(
        this.dailyLoss.toFixed(2)
      ),

      openPosition: this.position,

      tradesCount: this.trades.length,

      totalTrades: this.totalTrades,

      totalSignals: this.totalSignals,

      totalCandlesProcessed:
        this.totalCandlesProcessed,

      lastCandleTime:
        this.lastCandleTime,

      lastSignal:
        this.lastSignal,

      lastAnalysis:
        this.lastAnalysis,

      millisecondsUntilCandleClose:
        this.getMillisecondsUntilClose()
    };
  }

  // ==========================================================
  // START
  // ==========================================================

  start() {
    this.running = true;

    return {
      ok: true,

      running: true,

      mode: this.mode,

      symbol: this.symbol,

      timeframe: this.timeframe,

      message:
        "AI MONSTER U trading engine started"
    };
  }

  // ==========================================================
  // STOP
  // ==========================================================

  stop() {
    this.running = false;

    return {
      ok: true,

      running: false,

      message:
        "AI MONSTER U trading engine stopped"
    };
  }

  // ==========================================================
  // SET MODE
  // ==========================================================

  setMode(mode) {
    const value = String(
      mode || "demo"
    )
      .trim()
      .toLowerCase();

    if (
      value !== "demo" &&
      value !== "live"
    ) {
      throw new Error(
        "Unsupported mode: " + mode
        );
    }

    this.mode = value;

    return {
      ok: true,

      mode: this.mode
    };
  }

  // ==========================================================
  // SET TIMEFRAME
  // ==========================================================

  setTimeframe(timeframe) {
    const allowed = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h"
    ];

    const value = String(
      timeframe || ""
    )
      .trim()
      .toLowerCase();

    if (!allowed.includes(value)) {
      throw new Error(
        "Unsupported timeframe: " +
          timeframe
      );
    }

    this.timeframe = value;

    return {
      ok: true,

      timeframe:
        this.timeframe
    };
  }

  // ==========================================================
  // SET SYMBOL
  // ==========================================================

  setSymbol(symbol) {
    const value = String(
      symbol || ""
    )
      .trim()
      .toUpperCase();

    if (!value) {
      throw new Error(
        "Symbol is required"
      );
    }

    this.symbol = value;

    return {
      ok: true,

      symbol:
        this.symbol
    };
  }

  // ==========================================================
  // TIMEFRAME MILLISECONDS
  // ==========================================================

  timeframeMilliseconds(
    timeframe = this.timeframe
  ) {
    const values = {
      "1m": 60 * 1000,
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000
    };

    return (
      values[timeframe] ||
      60 * 1000
    );
  }

  // ==========================================================
  // CANDLE BOUNDARY
  // ==========================================================

  getCandleBoundary(
    timestamp = Date.now()
  ) {
    const duration =
      this.timeframeMilliseconds();

    return (
      Math.floor(
        timestamp / duration
      ) * duration
    );
  }

  // ==========================================================
  // TIME UNTIL CANDLE CLOSE
  // ==========================================================

  getMillisecondsUntilClose(
    timestamp = Date.now()
  ) {
    const duration =
      this.timeframeMilliseconds();

    const boundary =
      this.getCandleBoundary(
        timestamp
      );

    return Math.max(
      0,
      boundary +
        duration -
        timestamp
    );
  }

  // ==========================================================
  // EMA
  // ==========================================================

  calculateEMA(
    values,
    period
  ) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return null;
    }

    const numbers =
      values.map(Number);

    if (
      numbers.some(
        (value) =>
          !Number.isFinite(value)
      )
    ) {
      return null;
    }

    const multiplier =
      2 / (period + 1);

    let ema = 0;

    // Initial SMA
    for (
      let i = 0;
      i < period;
      i++
    ) {
      ema += numbers[i];
    }

    ema /= period;

    // EMA calculation
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

  // ==========================================================
  // RSI
  // ==========================================================

  calculateRSI(
    values,
    period = 14
  ) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    const numbers =
      values.map(Number);

    if (
      numbers.some(
        (value) =>
          !Number.isFinite(value)
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
        change > 0
          ? change
          : 0;

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

  // ==========================================================
  // ATR
  // ==========================================================

  calculateATR(
    candles,
    period = 14
  ) {
    if (
      !Array.isArray(candles) ||
      candles.length <= period
    ) {
      return null;
    }

    const ranges = [];

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
            high -
              previousClose
          ),
          Math.abs(
            low -
              previousClose
          )
        );

      ranges.push(
        trueRange
      );
    }

    const recent =
      ranges.slice(-period);

    if (
      recent.length < period
    ) {
      return null;
    }

    return (
      recent.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / period
    );
  }

  // ==========================================================
  // MACD
  // ==========================================================

  calculateMACD(values) {
    const minimum =
      this.settings.macdSlow + 9;

    if (
      !Array.isArray(values) ||
      values.length < minimum
    ) {
      return null;
    }

    const fast =
      this.calculateEMA(
        values,
        this.settings.macdFast
      );

    const slow =
      this.calculateEMA(
        values,
        this.settings.macdSlow
      );

    if (
      fast === null ||
      slow === null
    ) {
      return null;
    }

    const macd =
      fast - slow;

    return {
      macd,

      bullish:
        macd > 0,

      bearish:
        macd < 0
    };
  }

  // ==========================================================
  // MARKET ANALYSIS
  // ==========================================================

  analyzeMarket(
    data = {}
  ) {
    const candles =
      Array.isArray(
        data.candles
      )
        ? data.candles
        : [];

    // EMA 200 requires at least
    // 200 candles.
    if (
      candles.length < 200
    ) {
      return {
        signal: "WAIT",

        confidence: 0,

        reason:
          "Not enough candle data",

        candlesRequired: 200,

        candlesReceived:
          candles.length
      };
    }

    const closes =
      candles.map(
        (candle) =>
          Number(candle.close)
      );

    if (
      closes.some(
        (value) =>
          !Number.isFinite(value)
      )
    ) {
      return {
        signal: "WAIT",

        confidence: 0,

        reason:
          "Invalid candle close data"
      };
    }

    const ema20 =
      this.calculateEMA(
        closes,
        this.settings.emaFast
      );

    const ema50 =
      this.calculateEMA(
        closes,
        this.settings.emaMedium
      );

    const ema200 =
      this.calculateEMA(
        closes,
        this.settings.
        emaSlow
      );

    const rsi =
      this.calculateRSI(
        closes,
        this.settings.rsiPeriod
      );

    const macd =
      this.calculateMACD(
        closes
      );

    const atr =
      this.calculateATR(
        candles,
        this.settings.atrPeriod
      );

    const currentPrice =
      closes[
        closes.length - 1
      ];

    if (
      !Number.isFinite(currentPrice) ||
      ema20 === null ||
      ema50 === null ||
      ema200 === null ||
      rsi === null ||
      macd === null
    ) {
      return {
        signal: "WAIT",

        confidence: 0,

        reason:
          "Indicators are not ready",

        price:
          currentPrice,

        indicators: {
          ema20,
          ema50,
          ema200,

          rsi,

          macd:
            macd
              ? macd.macd
              : null,

          atr
        }
      };
    }

    // ========================================================
    // TREND
    // ========================================================

    const bullishTrend =
      ema20 > ema50 &&
      ema50 > ema200 &&
      currentPrice > ema20;

    const bearishTrend =
      ema20 < ema50 &&
      ema50 < ema200 &&
      currentPrice < ema20;

    // ========================================================
    // MOMENTUM
    // ========================================================

    const bullishMomentum =
      rsi >=
        this.settings.rsiBuyLevel &&
      macd.bullish;

    const bearishMomentum =
      rsi <=
        this.settings.rsiSellLevel &&
      macd.bearish;

    let signal = "WAIT";

    let reason =
      "No complete setup";

    let confidence = 0;

    // ========================================================
    // BUY
    // ========================================================

    if (
      bullishTrend &&
      bullishMomentum
    ) {
      signal = "BUY";

      reason =
        "Bullish trend and momentum confirmed";

      confidence =
        Math.min(
          95,
          60 +
            (
              rsi -
              this.settings.rsiBuyLevel
            ) +
            (
              ema20 > ema50
                ? 10
                : 0
            ) +
            (
              ema50 > ema200
                ? 10
                : 0
            ) +
            (
              macd.bullish
                ? 10
                : 0
            )
        );
    }

    // ========================================================
    // SELL
    // ========================================================

    if (
      bearishTrend &&
      bearishMomentum
    ) {
      signal = "SELL";

      reason =
        "Bearish trend and momentum confirmed";

      confidence =
        Math.min(
          95,
          60 +
            (
              this.settings.rsiSellLevel -
              rsi
            ) +
            (
              ema20 < ema50
                ? 10
                : 0
            ) +
            (
              ema50 < ema200
                ? 10
                : 0
            ) +
            (
              macd.bearish
                ? 10
                : 0
            )
        );
    }

    return {
      signal,

      reason,

      confidence:
        Number(
          confidence.toFixed(2)
        ),

      price:
        currentPrice,

      indicators: {
        ema20,

        ema50,

        ema200,

        rsi,

        macd:
          macd.macd,

        atr
      },

      conditions: {
        bullishTrend,

        bearishTrend,

        bullishMomentum,

        bearishMomentum
      }
    };
  }

  // ==========================================================
  // RISK
  // ==========================================================

  calculateRiskAmount() {
    return (
      this.balance *
      (
        this.riskPercent /
        100
      )
    );
  }

  // ==========================================================
  // DAILY LOSS PERMISSION
  // ==========================================================

  canOpenPosition() {
    if (!this.running) {
      return {
        ok: false,

        reason:
          "Trading engine is stopped"
      };
    }

    if (this.balance <= 0) {
      return {
        ok: false,

        reason:
          "Account balance is zero"
      };
    }

    const maxDailyLoss =
      this.startingBalance *
      (
        this.maxDailyLossPercent /
        100
      );

    if (
      this.dailyLoss >=
      maxDailyLoss
    ) {
      return {
        ok: false,

        reason:
          "Daily loss limit reached"
      };
    }

    return {
      ok: true
    };
  }

  // ==========================================================
  // OPEN DEMO POSITION
  // ==========================================================

  openDemoPosition(
    signal,
    price,
    candleTime
  ) {
    const permission =
      this.canOpenPosition();

    if (!permission.ok) {
      return permission;
    }

    if (
      signal !== "BUY" &&
      signal !== "SELL"
    ) {
      return {
        ok: false,

        reason:
          "Invalid trading signal"
      };
    }

    const entry =
      Number(price);

    if (
      !Number.isFinite(entry) ||
      entry <= 0
    ) {
      return {
        ok: false,

        reason:
          "Invalid entry price"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    this.position = {
      id:
        "AMU-" +
        Date.now(),

      symbol:
        this.symbol,

      side:
        signal,

      entry,

      riskAmount:
        Number(
          riskAmount.toFixed(4)
        ),

      candleTime,

      timeframe:
        this.timeframe,

      openedAt:
        new Date().toISOString()
    };

    this.totalTrades++;

    return {
      ok: true,

      message:
        "Demo position opened",

      position:
        this.position
    };
  }

  // ==========================================================
  // CLOSE DEMO POSITION
  // ==========================================================

  closeAtCandleBoundary(
    price,
    reason = "CANDLE_CLOSE"
  ) {
    if (
      this.position === null
    ) {
      return {
        ok: false,

        reason:
          "No open position"
      };
    }

    const exit =
      Number(price);

    if (
      !Number.isFinite(exit) ||
      exit <= 0
    ) {
      return {
        ok: false,

        reason:
          "Invalid exit price"
      };
    }

    const position =
      this.position;

    let priceChange = 0;

    if (
      position.side === "BUY"
    ) {
      priceChange =
        exit -
        position.entry;
    } else {
      priceChange =
        position.entry -
        exit;
    }

    const percentMove =
      priceChange /
      position.entry;

    // ========================================================
    // DEMO P/L MODEL
    //
    // This is ONLY a simulation.
    // It is not broker P/L calculation.
    // ========================================================

    const pnl =
      position.riskAmount *
      (
        percentMove /
        0.01
      );

    this.balance += pnl;

    if (pnl >= 0) {
      this.dailyProfit += pnl;
    } else {
      this.dailyLoss +=
        Math.abs(pnl);
    }

    const trade = {
      id:
        position.id,

      symbol:
        position.symbol,

      side:
        position.side,

      timeframe:
        position.timeframe,

      entry:
        position.entry,

      exit,

      pnl:
        Number(
          pnl.toFixed(4)
        ),

      reason,

      openedAt:
        position.openedAt,

      closedAt:
        new Date().toISOString()
    };

    this.trades.push(
      trade
    );

    this.position = null;

    return {
      ok: true,

      message:
        "Demo position closed",

      trade,

      balance:
        Number(
          this.balance.toFixed(2)
        )
    };
  }

  // ==========================================================
  // GET TRADES
  // ==========================================================

  getTrades() {
    return [
      ...this.trades
    ];
  }
  // ==========================================================
  // RESET DAILY STATS
  // ==========================================================

  resetDailyStats() {
    this.dailyProfit = 0;

    this.dailyLoss = 0;

    return {
      ok: true,

      dailyProfit: 0,

      dailyLoss: 0
    };
  }

  // ==========================================================
  // PROCESS COMPLETED CANDLE
  // ==========================================================

  processCompletedCandle(
    candle,
    candles = []
  ) {
    if (!candle) {
      return {
        ok: false,

        reason:
          "No candle supplied"
      };
    }

    const candleTime =
      candle.startTime;

    const close =
      Number(candle.close);

    if (
      candleTime === undefined ||
      candleTime === null
    ) {
      return {
        ok: false,

        reason:
          "Candle has no startTime"
      };
    }

    if (
      !Number.isFinite(close) ||
      close <= 0
    ) {
      return {
        ok: false,

        reason:
          "Invalid candle close price"
      };
    }

    // ========================================================
    // PREVENT DUPLICATE CANDLE PROCESSING
    // ========================================================

    if (
      this.lastCandleTime ===
      candleTime
    ) {
      return {
        ok: true,

        action:
          "IGNORED",

        reason:
          "Candle already processed"
      };
    }

    this.lastCandleTime =
      candleTime;

    this.totalCandlesProcessed++;

    // ========================================================
    // CLOSE PREVIOUS DEMO POSITION
    // ========================================================

    let closedTrade = null;

    if (
      this.position !== null &&
      this.settings.closeAtCandleBoundary
    ) {
      const closed =
        this.closeAtCandleBoundary(
          close,
          "CANDLE_CLOSE"
        );

      if (closed.ok) {
        closedTrade =
          closed.trade;
      }
    }

    // ========================================================
    // ENGINE STOPPED
    // ========================================================

    if (!this.running) {
      return {
        ok: true,

        action:
          "WAIT",

        reason:
          "Engine stopped",

        closedTrade
      };
    }

    // ========================================================
    // ANALYZE
    // ========================================================

    const analysis =
      this.analyzeMarket({
        candles:
          Array.isArray(candles)
            ? candles
            : []
      });

    this.lastAnalysis =
      analysis;

    this.lastSignal =
      analysis.signal;

    // ========================================================
    // WAIT
    // ========================================================

    if (
      analysis.signal !== "BUY" &&
      analysis.signal !== "SELL"
    ) {
      return {
        ok: true,

        action:
          "WAIT",

        analysis,

        closedTrade,

        reason:
          analysis.reason ||
          "No trading signal"
      };
    }

    // ========================================================
    // CONFIDENCE FILTER
    // ========================================================

    if (
      analysis.confidence <
      this.settings.minimumConfidence
    ) {
      return {
        ok: true,

        action:
          "WAIT",

        analysis,

        closedTrade,

        reason:
          "Signal confidence below threshold"
      };
    }

    // ========================================================
    // DEMO MODE
    // ========================================================

    if (
      this.mode === "demo"
    ) {
      const opened =
        this.openDemoPosition(
          analysis.signal,
          close,
          candleTime
        );

      if (!opened.ok) {
        return {
          ok: true,

          action:
            "WAIT",

          analysis,

          closedTrade,

          reason:
            opened.
            reason ||
            "Position could not be opened"
        };
      }

      this.totalSignals++;

      return {
        ok: true,

        action:
          "OPEN",

        mode:
          "demo",

        signal:
          analysis.signal,

        analysis,

        position:
          opened.position,

        closedTrade,

        reason:
          "AI MONSTER U demo signal generated"
      };
    }

    // ========================================================
    // LIVE MODE
    //
    // IMPORTANT:
    // The engine does NOT directly place a broker order.
    // The server/MT5 bridge must use this signal to create
    // an MT5 execution command.
    // ========================================================

    this.totalSignals++;

    return {
      ok: true,

      action:
        "SIGNAL",

      mode:
        "live",

      signal:
        analysis.signal,

      analysis,

      closedTrade,

      executionRequired: true,

      reason:
        "AI MONSTER U live signal generated for MT5 bridge"
    };
  }

  // ==========================================================
  // UPDATE BALANCE FROM MT5
  // ==========================================================

  updateAccountBalance(
    balance
  ) {
    const value =
      Number(balance);

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      return {
        ok: false,

        reason:
          "Invalid account balance"
      };
    }

    this.balance = value;

    return {
      ok: true,

      balance:
        Number(
          this.balance.toFixed(2)
        )
    };
  }

  // ==========================================================
  // UPDATE RISK SETTINGS
  // ==========================================================

  setRiskSettings({
    riskPercent,
    maxDailyLossPercent
  } = {}) {
    if (
      riskPercent !== undefined
    ) {
      const value =
        Number(riskPercent);

      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100
      ) {
        throw new Error(
          "Invalid riskPercent"
        );
      }

      this.riskPercent = value;
    }

    if (
      maxDailyLossPercent !== undefined
    ) {
      const value =
        Number(
          maxDailyLossPercent
        );

      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100
      ) {
        throw new Error(
          "Invalid maxDailyLossPercent"
        );
      }

      this.maxDailyLossPercent =
        value;
    }

    return {
      ok: true,

      riskPercent:
        this.riskPercent,

      maxDailyLossPercent:
        this.maxDailyLossPercent
    };
  }

  // ==========================================================
  // RESET ENGINE
  // ==========================================================

  reset() {
    this.running = false;

    this.position = null;

    this.trades = [];

    this.dailyProfit = 0;

    this.dailyLoss = 0;

    this.lastCandleTime = null;

    this.lastAnalysis = null;

    this.lastSignal = "WAIT";

    this.totalCandlesProcessed = 0;

    this.totalSignals = 0;

    this.totalTrades = 0;

    this.balance =
      this.startingBalance;

    return {
      ok: true,

      message:
        "AI MONSTER U engine reset"
    };
  }
}

export default TradingEngine;
