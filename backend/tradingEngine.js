class TradingEngine {
  constructor() {
    this.running = false;
    this.mode = "demo";

    this.timeframe = "1m";
    this.symbol = "BTCUSDT";

    this.balance = 50;
    this.startingBalance = 50;

    this.riskPercent = 1;
    this.maxDailyLossPercent = 3;
    this.maxOpenPositions = 1;

    this.position = null;
    this.trades = [];

    this.dailyProfit = 0;
    this.dailyLoss = 0;

    this.lastCandleTime = null;
  }

  // ---------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------

  getStatus() {
    return {
      running: this.running,
      mode: this.mode,
      symbol: this.symbol,
      timeframe: this.timeframe,

      balance: Number(this.balance.toFixed(2)),
      startingBalance: Number(this.startingBalance.toFixed(2)),

      riskPercent: this.riskPercent,
      maxDailyLossPercent: this.maxDailyLossPercent,
      maxOpenPositions: this.maxOpenPositions,

      dailyProfit: Number(this.dailyProfit.toFixed(2)),
      dailyLoss: Number(this.dailyLoss.toFixed(2)),

      openPosition: this.position,

      tradesCount: this.trades.length,
      lastCandleTime: this.lastCandleTime
    };
  }

  // ---------------------------------------------------------
  // START
  // ---------------------------------------------------------

  start() {
    this.running = true;

    return {
      ok: true,
      running: true,
      mode: this.mode,
      symbol: this.symbol,
      timeframe: this.timeframe,
      message: "AI MONSTER U demo engine started"
    };
  }

  // ---------------------------------------------------------
  // STOP
  // ---------------------------------------------------------

  stop() {
    this.running = false;

    return {
      ok: true,
      running: false,
      message: "AI MONSTER U demo engine stopped"
    };
  }

  // ---------------------------------------------------------
  // SET TIMEFRAME
  // ---------------------------------------------------------

  setTimeframe(timeframe) {
    const allowed = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h"
    ];

    const value = String(timeframe || "").toLowerCase();

    if (!allowed.includes(value)) {
      throw new Error(
        "Unsupported timeframe: " + timeframe
      );
    }

    this.timeframe = value;

    return this.timeframe;
  }

  // ---------------------------------------------------------
  // SET SYMBOL
  // ---------------------------------------------------------

  setSymbol(symbol) {
    this.symbol = String(symbol || "BTCUSDT").toUpperCase();

    return this.symbol;
  }

  // ---------------------------------------------------------
  // TIMEFRAME TO MILLISECONDS
  // ---------------------------------------------------------

  timeframeMilliseconds(timeframe = this.timeframe) {
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

  // ---------------------------------------------------------
  // EMA
  // ---------------------------------------------------------

  calculateEMA(values, period) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return null;
    }

    const numbers = values.map(Number);

    if (
      numbers.some(
        value => !Number.isFinite(value)
      )
    ) {
      return null;
    }

    const multiplier = 2 / (period + 1);

    let ema = 0;

    for (let i = 0; i < period; i++) {
      ema += numbers[i];
    }

    ema /= period;

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

  // ---------------------------------------------------------
  // RSI
  // ---------------------------------------------------------

  calculateRSI(values, period = 14) {
    if (
      !Array.isArray(values) ||
      values.length <= period
    ) {
      return null;
    }

    const numbers = values.map(Number);

    if (
      numbers.some(
        value => !Number.isFinite(value)
      )
    ) {
      return null;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change =
        numbers[i] - numbers[i - 1];

      if (change > 0) {
        gains += change;
      } else if (change < 0) {
        losses += Math.abs(change);
      }
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (
      let i = period + 1;
      i < numbers.length;
      i++
    ) {
      const change =
        numbers[i] - numbers[i - 1];

      const gain =
        change > 0 ? change : 0;

      const loss =
        change < 0 ? Math.abs(change) : 0;

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

    const rs =
      averageGain / averageLoss;

    return 100 - 100 / (1 + rs);
  }

  // ---------------------------------------------------------
  // ATR
  // ---------------------------------------------------------

  calculateATR(candles, period = 14) {
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

      ranges.push(trueRange);
    }

    const recent =
      ranges.slice(-period);

    if (recent.length < period) {
      return null;
    }

    return (
      recent.reduce(
        (sum, value) => sum + value,
        0
      ) / period
    );
  }

  // ---------------------------------------------------------
  // MACD
  // ---------------------------------------------------------

  calculateMACD(values) {
    if (
      !Array.isArray(values) ||
      values.length < 35
    ) {
      return null;
    }

    const fast =
      this.calculateEMA(values, 12);

    const slow =
      this.calculateEMA(values, 26);

    if (
      fast === null ||
      slow === null
    ) {
      return null;
    }

    const macd = fast - slow;

    return {
      macd,
      bullish: macd > 0,
      bearish: macd < 0
    };
  }

  // ---------------------------------------------------------
  // MARKET ANALYSIS
  // ---------------------------------------------------------

  analyzeMarket(data = {}) {
    const candles =
      Array.isArray(data.candles)
        ? data.candles
        : [];

    if (candles.length < 50) {
      return {
        signal: "WAIT",
        reason: "Not enough candle data",
        candlesRequired: 50,
        candlesReceived: candles.length
      };
    }

    const closes =
      candles.map(
        candle => Number(candle.close)
      );

    const ema20 =
      this.calculateEMA(closes, 20);

    const ema50 =
      this.calculateEMA(closes, 50);

    const ema200 =
      this.calculateEMA(closes, 200);

    const rsi =
      this.calculateRSI(closes, 14);

    const macd =
      this.calculateMACD(closes);

    const atr =
      this.calculateATR(candles, 14);

    const currentPrice =
      closes[closes.length - 1];

    if (
      !Number.isFinite(currentPrice) ||
      ema20 === null ||
      ema50 === null ||
      rsi === null ||
      macd === null
    ) {
      return {
        signal: "WAIT",
        reason: "Indicators are not ready",
        price: currentPrice,
        indicators: {
          ema20,
          ema50,
          ema200,
          rsi,
          macd: macd ? macd.macd : null,
          atr
        }
      };
    }

    let signal = "WAIT";
    let reason = "No complete setup";

    const bullishTrend =
      ema20 > ema50 &&
      currentPrice > ema20;

    const bearishTrend =
      ema20 < ema50 &&
      currentPrice < ema20;

    const bullishMomentum =
      rsi >= 55 &&
      macd.bullish;

    const bearishMomentum =
      rsi <= 45 &&
      macd.bearish;

    if (
      bullishTrend &&
      bullishMomentum
    ) {
      signal = "BUY";

      reason =
        "Bullish trend and momentum confirmed";
    }

    if (
      bearishTrend &&
      bearishMomentum
    ) {
      signal = "SELL";

      reason =
        "Bearish trend and momentum confirmed";
    }

    let confidence = 0;

    if (signal === "BUY") {
      confidence = Math.min(
        95,
        60 +
          (rsi - 55) +
          (ema20 > ema50 ? 10 : 0) +
          (macd.bullish ? 10 : 0)
      );
    }

    if (signal === "SELL") {
      confidence = Math.min(
        95,
        60 +
          (45 - rsi) +
          (ema20 < ema50 ? 10 : 0) +
          (macd.bearish ? 10 : 0)
      );
    }

    return {
      signal,
      reason,
      confidence: Number(confidence.toFixed(2)),
      price: currentPrice,

      indicators: {
        ema20,
        ema50,
        ema200,
        rsi,
        macd: macd.macd,
        atr
      }
    };
  }

  // ---------------------------------------------------------
  // RISK
  // ---------------------------------------------------------

  calculateRiskAmount() {
    return (
      this.balance *
      (this.riskPercent / 100)
    );
  }

  // ---------------------------------------------------------
  // POSITION PERMISSION
  // ---------------------------------------------------------

  canOpenPosition() {
    if (!this.running) {
      return {
        ok: false,
        reason: "Trading engine is stopped"
      };
    }

    if (this.position !== null) {
      return {
        ok: false,
        reason: "A position is already open"
      };
    }

    if (
      this.trades.length >= 0 &&
      this.maxOpenPositions <= 0
    ) {
      return {
        ok: false,
        reason: "Maximum open positions disabled"
      };
    }

    const maxDailyLoss =
      this.startingBalance *
      (this.maxDailyLossPercent / 100);

    if (
      this.dailyLoss >= maxDailyLoss
    ) {
      return {
        ok: false,
        reason: "Daily loss limit reached"
      };
    }

    if (this.balance <= 0) {
      return {
        ok: false,
        reason: "Account balance is zero"
      };
    }

    return {
      ok: true
    };
  }

  // ---------------------------------------------------------
  // OPEN DEMO POSITION
  // ---------------------------------------------------------

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
        reason: "Invalid trading signal"
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
        reason: "Invalid entry price"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    this.position = {
      id:
        "AMU-" + Date.now(),

      symbol:
        this.symbol,

      side:
        signal,

      entry:
        entry,

      riskAmount:
        Number(riskAmount.toFixed(4)),

      candleTime:
        candleTime,

      timeframe:
        this.timeframe,

      openedAt:
        new Date().toISOString()
    };

    return {
      ok: true,
      message:
        "Demo position opened",
      position:
        this.position
    };
  }

  // ---------------------------------------------------------
  // CLOSE POSITION
  // ---------------------------------------------------------

  closeAtCandleBoundary(
    price,
    reason = "CANDLE_CLOSE"
  ) {
    if (this.position === null) {
      return {
        ok: false,
        reason: "No open position"
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
        reason: "Invalid exit price"
      };
    }

    const position =
      this.position;

    let priceChange = 0;

    if (position.side === "BUY") {
      priceChange =
        exit - position.entry;
    } else {
      priceChange =
        position.entry - exit;
    }

    const percentMove =
      priceChange /
      position.entry;

    /*
     * Demo P/L model:
     *
     * 1% favorable price movement
     * approximately equals the configured
     * risk amount.
     */

    const pnl =
      position.riskAmount *
      (percentMove / 0.01);

    this.balance += pnl;

    if (pnl >= 0) {
      this.dailyProfit += pnl;
    } else {
      this.dailyLoss += Math.abs(pnl);
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

      exit:
        exit,

      pnl:
        Number(pnl.toFixed(4)),

      reason:
        reason,

      openedAt:
        position.openedAt,

      closedAt:
        new Date().toISOString()
    };

    this.trades.push(trade);

    this.position = null;

    return {
      ok: true,
      message:
        "Demo position closed",

      trade:
        trade,

      balance:
        Number(this.balance.toFixed(2))
    };
  }

  // ---------------------------------------------------------
  // GET TRADES
  // ---------------------------------------------------------

  getTrades() {
    return this.trades;
  }

  // ---------------------------------------------------------
  // RESET DAILY STATS
  // ---------------------------------------------------------

  resetDailyStats() {
    this.dailyProfit = 0;
    this.dailyLoss = 0;

    return {
      ok: true,
      dailyProfit: 0,
      dailyLoss: 0
    };
  }

  // ---------------------------------------------------------
  // PROCESS COMPLETED CANDLE
  // ---------------------------------------------------------

  processCompletedCandle(
    candle,
    candles = []
  ) {
    if (!candle) {
      return {
        ok: false,
        reason: "No candle supplied"
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
        reason: "Candle has no startTime"
      };
    }

    if (
      !Number.isFinite(close) ||
      close <= 0
    ) {
      return {
        ok: false,
        reason: "Invalid candle close price"
      };
    }

    /*
     * Prevent processing the exact same
     * completed candle twice.
     */

    if (
      this.lastCandleTime ===
      candleTime
    ) {
      return {
        ok: true,
        action: "IGNORED",
        reason:
          "Candle already processed"
      };
    }

    this.lastCandleTime =
      candleTime;

    /*
     * Close the previous position at the
     * completed candle boundary.
     */

    let closedTrade = null;

    if (this.position !== null) {
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

    /*
     * If engine is stopped, do not open
     * another position.
     */

    if (!this.running) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "Engine stopped",
        closedTrade
      };
    }

    /*
     * Analyze the completed candle data.
     */

    const analysis =
      this.analyzeMarket({
        candles:
          Array.isArray(candles)
            ? candles
            : []
      });

    /*
     * No valid signal.
     */

    if (
      analysis.signal !== "BUY" &&
      analysis.signal !== "SELL"
    ) {
      return {
        ok: true,
        action: "WAIT",
        analysis,
        closedTrade
      };
    }

    /*
     * Open the new demo position.
     */

    const opened =
      this.openDemoPosition(
        analysis.signal,
        close,
        candleTime
      );

    return {
      ok: true,

      action:
        opened.ok
          ? "OPEN"
          : "WAIT",

      analysis,

      position:
        opened.position || null,

      closedTrade,

      reason:
        opened.reason || null
    };
  }
}

export default TradingEngine;
