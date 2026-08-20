// AI MONSTER U - Candle Cycle Trading Engine
// Demo/paper execution engine.
// Real-money execution will be connected through a verified broker/exchange API.

class TradingEngine {
  constructor() {
    this.running = false;
    this.timeframe = "1m";

    this.balance = 50.00;
    this.startingBalance = 50.00;

    this.position = null;
    this.trades = [];

    this.lastCandleTime = null;

    this.settings = {
      riskPercent: 0.5,
      maxDailyLossPercent: 3,
      maxDrawdownPercent: 10,
      maxConsecutiveLosses: 4,

      emaFast: 20,
      emaSlow: 50,
      emaTrend: 200,

      rsiPeriod: 14,
      atrPeriod: 14,

      rewardRisk: 1.5
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
      throw new Error("Unsupported timeframe");
    }

    this.timeframe = timeframe;
  }

  getTimeframeMilliseconds() {
    const values = {
      "1m": 60 * 1000,
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000
    };

    return values[this.timeframe];
  }

  getCandleBoundary(timestamp = Date.now()) {
    const duration = this.getTimeframeMilliseconds();

    return Math.floor(timestamp / duration) * duration;
  }

  isNewCandle(timestamp = Date.now()) {
    const boundary = this.getCandleBoundary(timestamp);

    if (this.lastCandleTime === null) {
      this.lastCandleTime = boundary;
      return true;
    }

    if (boundary > this.lastCandleTime) {
      this.lastCandleTime = boundary;
      return true;
    }

    return false;
  }

  getMillisecondsUntilClose(timestamp = Date.now()) {
    const duration = this.getTimeframeMilliseconds();
    const boundary = this.getCandleBoundary(timestamp);

    return Math.max(
      0,
      boundary + duration - timestamp
    );
  }

  start() {
    this.running = true;

    return {
      ok: true,
      running: true,
      timeframe: this.timeframe,
      message: "AI MONSTER U trading engine started"
    };
  }

  stop() {
    this.running = false;

    return {
      ok: true,
      running: false,
      message: "AI MONSTER U trading engine stopped"
    };
  }

  calculateRiskAmount() {
    return this.balance *
      (this.settings.riskPercent / 100);
  }

  canTrade() {
    if (!this.running) {
      return {
        allowed: false,
        reason: "Bot is stopped"
      };
    }

    if (this.balance <= 0) {
      return {
        allowed: false,
        reason: "Insufficient balance"
      };
    }

    const dailyLossLimit =
      this.startingBalance *
      (this.settings.maxDailyLossPercent / 100);

    const todayProfit = this.getTodayProfit();

    if (todayProfit <= -dailyLossLimit) {
      return {
        allowed: false,
        reason: "Daily loss limit reached"
      };
    }

    if (
      this.getDrawdownPercent() >=
      this.settings.maxDrawdownPercent
    ) {
      return {
        allowed: false,
        reason: "Maximum drawdown reached"
      };
    }

    if (
      this.getConsecutiveLosses() >=
      this.settings.maxConsecutiveLosses
    ) {
      return {
        allowed: false,
        reason: "Consecutive-loss protection active"
      };
    }

    return {
      allowed: true,
      reason: "Risk check passed"
    };
  }

  getTodayProfit() {
    const today = new Date().toISOString().slice(0, 10);

    return this.trades
      .filter(trade => trade.date === today)
      .reduce(
        (total, trade) => total + trade.profit,
        0
      );
  }

  getDrawdownPercent() {
    if (this.startingBalance <= 0) {
      return 0;
    }

    return Math.max(
      0,
      ((this.startingBalance - this.balance) /
        this.startingBalance) *
        100
    );
  }

  getConsecutiveLosses() {
    let losses = 0;

    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (this.trades[i].profit < 0) {
        losses++;
      } else {
        break;
      }
    }

    return losses;
  }
  analyzeMarket(data) {
    if (!data) {
      return {
        signal: "WAIT",
        confidence: 0,
        reasons: ["No market data"]
      };
    }

    const {
      price,
      ema20,
      ema50,
      ema200,
      rsi,
      macd,
      previousHigh,
      previousLow,
      atr
    } = data;

    let buyScore = 0;
    let sellScore = 0;

    const reasons = [];

    if (
      ema20 !== undefined &&
      ema50 !== undefined &&
      ema200 !== undefined
    ) {
      if (
        ema20 > ema50 &&
        ema50 > ema200
      ) {
        buyScore += 2;
        reasons.push("Bullish EMA alignment");
      }

      if (
        ema20 < ema50 &&
        ema50 < ema200
      ) {
        sellScore += 2;
        reasons.push("Bearish EMA alignment");
      }
    }

    if (rsi !== undefined) {
      if (rsi >= 55 && rsi <= 70) {
        buyScore += 1;
        reasons.push("Bullish RSI momentum");
      }

      if (rsi <= 45 && rsi >= 30) {
        sellScore += 1;
        reasons.push("Bearish RSI momentum");
      }
    }

    if (macd !== undefined) {
      if (macd > 0) {
        buyScore += 1;
        reasons.push("Positive MACD");
      }

      if (macd < 0) {
        sellScore += 1;
        reasons.push("Negative MACD");
      }
    }

    if (
      price !== undefined &&
      previousHigh !== undefined &&
      price > previousHigh
    ) {
      buyScore += 2;
      reasons.push("Previous-high breakout");
    }

    if (
      price !== undefined &&
      previousLow !== undefined &&
      price < previousLow
    ) {
      sellScore += 2;
      reasons.push("Previous-low breakdown");
    }

    let signal = "WAIT";
    let confidence = 0;

    if (buyScore >= 4 && buyScore > sellScore) {
      signal = "BUY";
      confidence = Math.min(
        95,
        50 + buyScore * 8
      );
    }

    if (sellScore >= 4 && sellScore > buyScore) {
      signal = "SELL";
      confidence = Math.min(
        95,
        50 + sellScore * 8
      );
    }

    return {
      signal,
      confidence,
      buyScore,
      sellScore,
      atr: atr || null,
      reasons
    };
  }

  openDemoPosition(signal, price, candleTime) {
    if (this.position) {
      return {
        ok: false,
        error: "A position is already open"
      };
    }

    const risk = this.canTrade();

    if (!risk.allowed) {
      return {
        ok: false,
        error: risk.reason
      };
    }

    if (
      signal !== "BUY" &&
      signal !== "SELL"
    ) {
      return {
        ok: false,
        error: "Invalid signal"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    const stopDistance =
      Math.max(price * 0.001, 0.01);

    const takeProfitDistance =
      stopDistance *
      this.settings.rewardRisk;

    const stopLoss =
      signal === "BUY"
        ? price - stopDistance
        : price + stopDistance;

    const takeProfit =
      signal === "BUY"
        ? price + takeProfitDistance
        : price - takeProfitDistance;

    this.position = {
      id: AMU-${Date.now()},
      side: signal,
      entry: price,
      stopLoss,
      takeProfit,
      riskAmount,
      candleTime,
      timeframe: this.timeframe,
      openedAt: new Date().toISOString()
    };

    return {
      ok: true,
      position: this.position
    };
  }

  closeAtCandleBoundary(price, reason = "CANDLE_CLOSE") {
    if (!this.position) {
      return {
        ok: true,
        closed: false,
        reason: "No open position"
      };
    }

    const position = this.position;

    let profit;

    if (position.side === "BUY") {
      profit =
        (price - position.entry) /
        Math.max(
          position.entry,
          0.0000001
        ) *
        position.riskAmount *
        100;
    } else {
      profit =
        (position.entry - price) /
        Math.max(
          position.entry,
          0.0000001
        ) *
        position.riskAmount *
        100;
    }

    this.balance += profit;

    const trade = {
      id: position.id,
      date: new Date().toISOString().slice(0, 10),
      side: position.side,
      entry: position.entry,
      exit: price,
      profit: Number(profit.toFixed(2)),
      reason,
      timeframe: position.timeframe,
      openedAt: position.openedAt,
      closedAt: new Date().toISOString()
    };

    this.trades.push(trade);

    this.position = null;

    return {
      ok: true,
      closed: true,
      trade,
      balance: Number(
        this.balance.toFixed(2)
      )
    };
  }

  getStatus() {
    const now = Date.now();

    return {
      running: this.running,
      timeframe: this.timeframe,
      balance: Number(
        this.balance.toFixed(2)
      ),
      equity: Number(
        (
          this.balance +
          (this.position
            ? 0
            : 0)
        ).toFixed(2)
      ),
      dailyProfit: Number(
        this.getTodayProfit().toFixed(2)
      ),
      drawdownPercent: Number(
        this.getDrawdownPercent().toFixed(2)
      ),
      consecutiveLosses:
        this.getConsecutiveLosses(),
      openPosition: this.position,
      tradesToday: this.trades.filter(
        trade =>
          trade.date ===
          new Date()
            .toISOString()
            .slice(0, 10)
      ).length,
      millisecondsUntilCandleClose:
        this.getMillisecondsUntilClose(now)
    };
  }

  getTrades() {
    return [...this.trades].reverse();
  }
}

module.exports = TradingEngine;
