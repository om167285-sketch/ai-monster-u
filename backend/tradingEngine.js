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

  getStatus() {
    return {
      running: this.running,
      mode: this.mode,
      symbol: this.symbol,
      timeframe: this.timeframe,
      balance: Number(this.balance.toFixed(2)),
      startingBalance: this.startingBalance,
      riskPercent: this.riskPercent,
      dailyProfit: Number(this.dailyProfit.toFixed(2)),
      dailyLoss: Number(this.dailyLoss.toFixed(2)),
      openPosition: this.position
    };
  }

  start() {
    this.running = true;

    return {
      ok: true,
      running: true,
      mode: this.mode,
      timeframe: this.timeframe,
      message: "AI MONSTER U demo engine started"
    };
  }

  stop() {
    this.running = false;

    return {
      ok: true,
      running: false,
      message: "AI MONSTER U demo engine stopped"
    };
  }

  setTimeframe(timeframe) {
    const allowed = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h"
    ];

    if (!allowed.includes(timeframe)) {
      throw new Error(
        "Unsupported timeframe: " + timeframe
      );
    }

    this.timeframe = timeframe;

    return this.timeframe;
  }

  setSymbol(symbol) {
    this.symbol = String(symbol || "BTCUSDT").toUpperCase();

    return this.symbol;
  }

  calculateEMA(values, period) {
    if (!Array.isArray(values) || values.length < period) {
      return null;
    }

    const multiplier = 2 / (period + 1);

    let ema = 0;

    for (let i = 0; i < period; i++) {
      ema += Number(values[i]);
    }

    ema = ema / period;

    for (let i = period; i < values.length; i++) {
      ema =
        (Number(values[i]) - ema) *
          multiplier +
        ema;
    }

    return ema;
  }

  calculateRSI(values, period = 14) {
    if (!Array.isArray(values) || values.length <= period) {
      return null;
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change =
        Number(values[i]) -
        Number(values[i - 1]);

      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    if (losses === 0) {
      return 100;
    }

    const rs = gains / losses;

    return 100 - 100 / (1 + rs);
  }

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

  calculateMACD(values) {
    if (!Array.isArray(values) || values.length < 35) {
      return null;
    }

    const fast = this.calculateEMA(values, 12);
    const slow = this.calculateEMA(values, 26);

    if (fast === null || slow === null) {
      return null;
    }

    return {
      macd: fast - slow,
      bullish: fast > slow,
      bearish: fast < slow
    };
  }

  analyzeMarket(data) {
    const candles = Array.isArray(data.candles)
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

    const closes = candles.map(
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
      ema20 === null ||
      ema50 === null ||
      rsi === null ||
      macd === null
    ) {
      return {
        signal: "WAIT",
        reason: "Indicators are not ready"
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

    return {
      signal,
      reason,
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

  calculateRiskAmount() {
    return (
      this.balance *
      (this.riskPercent / 100)
    );
  }

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

    return {
      ok: true
    };
  }

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

    const entry = Number(price);

    if (!Number.isFinite(entry) || entry <= 0) {
      return {
        ok: false,
        reason: "Invalid entry price"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    this.position = {
      id:
        "AMU-" +
        Date.now(),

      symbol: this.symbol,

      side: signal,

      entry: entry,

      riskAmount: riskAmount,

      candleTime: candleTime,

      timeframe: this.timeframe,

      openedAt:
        new Date().toISOString()
    };

    return {
      ok: true,
      message: "Demo position opened",
      position: this.position
    };
  }

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

    if (!Number.isFinite(exit) || exit <= 0) {
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
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      timeframe: position.timeframe,
      entry: position.entry,
      exit: exit,
      pnl: Number(pnl.toFixed(4)),
      reason: reason,
      openedAt: position.openedAt,
      closedAt:
        new Date().toISOString()
    };

    this.trades.push(trade);

    this.position = null;

    return {
      ok: true,
      message: "Demo position closed",
      trade: trade,
      balance:
        Number(this.balance.toFixed(2))
    };
  }

  getTrades() {
    return this.trades;
  }

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
      this.lastCandleTime ===
      candleTime
    ) {
      return {
        ok: true,
        action: "IGNORED",
        reason: "Candle already processed"
      };
    }

    this.lastCandleTime =
      candleTime;

    /*
     * First close any position from
     * the previous candle.
     */
    if (this.position !== null) {
      this.closeAtCandleBoundary(
        close,
        "CANDLE_CLOSE"
      );
    }

    if (!this.running) {
      return {
        ok: true,
        action: "WAIT",
        reason: "Engine stopped"
      };
    }

    const analysis =
      this.analyzeMarket({
        candles: candles
      });

    if (
      analysis.signal !== "BUY" &&
      analysis.signal !== "SELL"
    ) {
      return {
        ok: true,
        action: "WAIT",
        analysis: analysis
      };
    }

    const opened =
      this.openDemoPosition(
        analysis.signal,
        close,
        candleTime
      );

    return {
      ok: true,
      action: opened.ok
        ? "OPEN"
        : "WAIT",
      analysis: analysis,
      position: opened.position || null,
      reason: opened.reason || null
    };
  }
}

export default TradingEngine;
