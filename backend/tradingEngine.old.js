// AI MONSTER U
// Professional MT5 Candle-Cycle Strategy Engine
//
// Strategy:
// EMA 9 / EMA 21 / EMA 50
// RSI 14
// ATR 14
// Momentum
// Candle confirmation
//
// Execution:
// The MT5 bridge is responsible for real broker execution.
// This engine produces the trading decision and risk levels.

class TradingEngine {
  constructor() {
    // ================================================
    // ENGINE STATE
    // ================================================

    this.running = false;

    this.symbol = "BTCUSDm";
    this.timeframe = "1m";

    this.lastProcessedCandle = null;
    this.lastCandleTime = null;
    this.lastSignal = "WAIT";
    this.lastAnalysis = null;

    this.position = null;
    this.trades = [];

    this.totalTrades = 0;
    this.totalSignals = 0;
    this.totalCandlesProcessed = 0;

    this.balance = 0;
    this.startingBalance = 0;

    // ================================================
    // STRATEGY SETTINGS
    // ================================================

    this.settings = {
      // Risk
      riskPercent: 0.5,

      // EMA
      emaFast: 9,
      emaMedium: 21,
      emaSlow: 50,

      // RSI
      rsiPeriod: 14,
      rsiBuyLevel: 55,
      rsiSellLevel: 45,

      // ATR
      atrPeriod: 14,

      // Trade
      rewardRisk: 1.5,
      stopAtrMultiplier: 1.0,

      // Signal quality
      minimumConfidence: 60,

      // MT5 volume
      defaultVolume: 0.01,

      // Candle-cycle
      closeAtCandleBoundary: true,

      // ==============================================
      // USER SL SETTINGS
      // ==============================================

      activateStopLoss: true,

      // Decimal multiplier.
      // Example:
      // 0.001 = 0.1%
      // 0.002 = 0.2%
      stopLossDecimal: 0.001,

      // ==============================================
      // TRAILING STOP SETTINGS
      // ==============================================

      activateTrailingStopLoss: true,

      // Distance from current price.
      trailingStopDecimal: 0.0005,

      // Only activate trailing after price
      // moves in the profitable direction.
      trailingActivationDecimal: 0.0005
    };
  }

  // ==================================================
  // SETTINGS
  // ==================================================

  setSettings(newSettings = {}) {
    this.settings = {
      ...this.settings,
      ...newSettings
    };

    return {
      ok: true,
      settings: this.settings
    };
  }

  setSymbol(symbol) {
    if (!symbol) {
      throw new Error("Symbol is required");
    }

    this.symbol = String(symbol).trim().toUpperCase();

    return {
      ok: true,
      symbol: this.symbol
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
        Unsupported timeframe: ${timeframe}
      );
    }

    this.timeframe = timeframe;

    return {
      ok: true,
      timeframe: this.timeframe
    };
  }

  // ==================================================
  // TIMEFRAME
  // ==================================================

  getTimeframeMilliseconds() {
    const values = {
      "1m": 60 * 1000,
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000
    };

    return values[this.timeframe] || 60 * 1000;
  }

  getCandleBoundary(timestamp = Date.now()) {
    const duration = this.getTimeframeMilliseconds();

    return (
      Math.floor(timestamp / duration) *
      duration
    );
  }

  getMillisecondsUntilClose(
    timestamp = Date.now()
  ) {
    const duration =
      this.getTimeframeMilliseconds();

    const boundary =
      this.getCandleBoundary(timestamp);

    return Math.max(
      0,
      boundary + duration - timestamp
    );
  }

  isNewCandle(timestamp = Date.now()) {
    const boundary =
      this.getCandleBoundary(timestamp);

    if (this.lastCandleTime === null) {
      this.
        lastCandleTime = boundary;
      return true;
    }

    if (boundary > this.lastCandleTime) {
      this.lastCandleTime = boundary;
      return true;
    }

    return false;
  }

  // ==================================================
  // ENGINE CONTROL
  // ==================================================

  start() {
    this.running = true;

    return {
      ok: true,
      running: true,
      symbol: this.symbol,
      timeframe: this.timeframe,
      message:
        "AI MONSTER U trading engine started"
    };
  }

  stop() {
    this.running = false;

    return {
      ok: true,
      running: false,
      message:
        "AI MONSTER U trading engine stopped"
    };
  }

  // ==================================================
  // EMA
  // ==================================================

  calculateEMA(candles, period) {
    if (
      !Array.isArray(candles) ||
      candles.length < period
    ) {
      return null;
    }

    const closes = candles
      .map(candle => Number(candle.close))
      .filter(Number.isFinite);

    if (closes.length < period) {
      return null;
    }

    let ema = 0;

    for (let i = 0; i < period; i++) {
      ema += closes[i];
    }

    ema /= period;

    const multiplier =
      2 / (period + 1);

    for (
      let i = period;
      i < closes.length;
      i++
    ) {
      ema =
        (closes[i] - ema) *
          multiplier +
        ema;
    }

    return ema;
  }

  // ==================================================
  // RSI
  // ==================================================

  calculateRSI(
    candles,
    period = 14
  ) {
    if (
      !Array.isArray(candles) ||
      candles.length < period + 1
    ) {
      return null;
    }

    const closes = candles.map(
      candle => Number(candle.close)
    );

    if (
      closes.some(
        value => !Number.isFinite(value)
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
        closes[i] - closes[i - 1];

      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let averageGain =
      gains / period;

    let averageLoss =
      losses / period;

    for (
      let i = period + 1;
      i < closes.length;
      i++
    ) {
      const change =
        closes[i] - closes[i - 1];

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
      averageGain / averageLoss;

    return 100 - 100 / (1 + rs);
  }

  // ==================================================
  // ATR
  // ==================================================

  calculateATR(
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

      const tr = Math.max(
        high - low,
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
      );

      trueRanges.push(tr);
    }

    if (trueRanges.length < period) {
      return null;
    }

    let atr = 0;

    for (let i = 0; i < period; i++) {
      atr += trueRanges[i];
    }

    atr /= period;

    for (
      let i = period;
      i < trueRanges.length;
      i++
    ) {
      atr =
        (
          atr * (period - 1) +
          trueRanges[i]
        ) / period;
    }

    return atr;
  }

  // ==================================================
  // MOMENTUM
  // ==================================================

  calculateMomentum(
    candles,
    lookback = 5
  ) {
    if (
      !Array.isArray(candles) ||
      candles.length <= lookback
    ) {
      return 0;
    }

    const current =
      Number(
        candles[candles.length - 1].close
      );

    const previous =
      Number(
        candles[
          candles.length - 1 - lookback
        ].close
      );

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous) ||
      previous === 0
    ) {
      return 0;
    }

    return (
      ((current - previous) / previous) *
      100
    );
  }

  // ==================================================
  // CANDLE DIRECTION
  // ==================================================

  getCandleDirection(candle) {
    const open = Number(candle.open);
    const close = Number(candle.close);

    if (close > open) {
      return "BULLISH";
    }

    if (close < open) {
      return "BEARISH";
    }

    return "NEUTRAL";
  }

  // ==================================================
  // MARKET ANALYSIS
  // ==================================================

  analyzeMarket(data) {
    if (!data) {
      return {
        signal: "WAIT",
        confidence: 0,
        buyScore: 0,
        sellScore: 0,
        reasons: ["No market data"]
      };
    }

    const candles =
      Array.isArray(data.candles)
        ? data.candles
        : [];

    const current =
      data.candle ||
      candles[candles.length - 1];

    if (!current) {
      return {
        signal: "WAIT",
        confidence: 0,
        buyScore: 0,
        sellScore: 0,
        reasons: ["No completed candle"]
      };
    }

    // Need enough candles for EMA 50.
    if (candles.length < 55) {
      return {
        signal: "WAIT",
        confidence: 0,
        buyScore: 0,
        sellScore: 0,
        reasons: [
          Waiting for candles: ${candles.length}/55
        ]
      };
    }

    const price =
      Number(
        data.price ?? current.close
      );

    const ema9 =
      data.ema9 ??
      this.calculateEMA(
        candles,
        this.settings.emaFast
      );

    const ema21 =
      data.ema21 ??
      this.calculateEMA(
        candles,
        this.settings.emaMedium
      );

    const ema50 =
      data.ema50 ??
      this.calculateEMA(
        candles,
        this.settings.emaSlow
      );

    const rsi =
      data.rsi ??
      this.calculateRSI(
        candles,
        this.settings.rsiPeriod
      );

    const atr =
      data.atr ??
      this.calculateATR(
        candles,
        this.settings.atrPeriod
      );

    const momentum =
      data.momentum ??
      this.calculateMomentum(
        candles,
        5
      );

    const candleDirection =
      this.getCandleDirection(current);

    let buyScore = 0;
    let sellScore = 0;

    const buyReasons = [];
    const sellReasons = [];

    // ================================================
    // EMA 9 / 21
    // ================================================

    if (
      ema9 !== null &&
      ema21 !== null
    ) {
      if (ema9 > ema21) {
        buyScore += 2;
        buyReasons.push(
          "EMA 9 above EMA 21"
        );
      } else if (ema9 < ema21) {
        sellScore += 2;
        sellReasons.push(
          "EMA 9 below EMA 21"
        );
      }
    }

    // ================================================
    // EMA 21 / 50
    // ================================================

    if (
      ema21 !== null &&
      ema50 !== null
    ) {
      if (ema21 > ema50) {
        buyScore += 2;
        buyReasons.push(
          "EMA 21 above EMA 50"
        );
      } else if (ema21 < ema50) {
        sellScore += 2;
        sellReasons.push(
          "EMA 21 below EMA 50"
        );
      }
    }
  // ================================================
    // PRICE VS EMA 50
    // ================================================

    if (ema50 !== null) {
      if (price > ema50) {
        buyScore += 1;
        buyReasons.push(
          "Price above EMA 50"
        );
      } else if (price < ema50) {
        sellScore += 1;
        sellReasons.push(
          "Price below EMA 50"
        );
      }
    }

    // ================================================
    // RSI
    // ================================================

    if (rsi !== null) {
      if (
        rsi >= this.settings.rsiBuyLevel &&
        rsi < 75
      ) {
        buyScore += 2;
        buyReasons.push(
          "RSI bullish momentum"
        );
      } else if (
        rsi <= this.settings.rsiSellLevel &&
        rsi > 25
      ) {
        sellScore += 2;
        sellReasons.push(
          "RSI bearish momentum"
        );
      }
    }

    // ================================================
    // MOMENTUM
    // ================================================

    if (momentum > 0) {
      buyScore += 1;
      buyReasons.push(
        "Positive momentum"
      );
    } else if (momentum < 0) {
      sellScore += 1;
      sellReasons.push(
        "Negative momentum"
      );
    }

    // ================================================
    // CANDLE CONFIRMATION
    // ================================================

    if (
      candleDirection === "BULLISH"
    ) {
      buyScore += 1;
      buyReasons.push(
        "Bullish candle confirmation"
      );
    } else if (
      candleDirection === "BEARISH"
    ) {
      sellScore += 1;
      sellReasons.push(
        "Bearish candle confirmation"
      );
    }

    // ================================================
    // SIGNAL
    // ================================================

    let signal = "WAIT";
    let confidence = 0;
    let reasons = [];

    if (
      buyScore >= 5 &&
      buyScore > sellScore
    ) {
      signal = "BUY";

      confidence = Math.min(
        95,
        50 + buyScore * 7
      );

      reasons = buyReasons;
    } else if (
      sellScore >= 5 &&
      sellScore > buyScore
    ) {
      signal = "SELL";

      confidence = Math.min(
        95,
        50 + sellScore * 7
      );

      reasons = sellReasons;
    } else {
      reasons = [
        "Signals are not sufficiently aligned"
      ];
    }

    return {
      signal,
      confidence,
      buyScore,
      sellScore,
      price,
      ema9,
      ema21,
      ema50,
      rsi,
      atr,
      momentum,
      candleDirection,
      reasons
    };
  }

  // ==================================================
  // RISK
  // ==================================================

  calculateRiskAmount() {
    if (
      !Number.isFinite(this.balance) ||
      this.balance <= 0
    ) {
      return 0;
    }

    return (
      this.balance *
      (
        this.settings.riskPercent /
        100
      )
    );
  }

  // ==================================================
  // SL / TP
  // ==================================================

  calculateStops(
    signal,
    entryPrice,
    atr
  ) {
    const price =
      Number(entryPrice);

    const atrValue =
      Number(atr);

    const decimalDistance =
      price *
      Number(
        this.settings.stopLossDecimal
      );

    const atrDistance =
      Number.isFinite(atrValue) &&
      atrValue > 0
        ? atrValue *
          Number(
            this.settings.stopAtrMultiplier
          )
        : 0;

    const stopDistance =
      Math.max(
        decimalDistance,
        atrDistance
      );

    let stopLoss = null;

    let takeProfit = null;

    if (
      this.settings.activateStopLoss
    ) {
      stopLoss =
        signal === "BUY"
          ? price - stopDistance
          : price + stopDistance;

      takeProfit =
        signal === "BUY"
          ? price +
            stopDistance *
              this.settings.rewardRisk
          : price -
            stopDistance *
              this.settings.
        rewardRisk;
    }

    return {
      stopLoss:
        stopLoss === null
          ? null
          : Number(
              stopLoss.toFixed(8)
            ),

      takeProfit:
        takeProfit === null
          ? null
          : Number(
              takeProfit.toFixed(8)
            ),

      stopDistance:
        Number(
          stopDistance.toFixed(8)
        )
    };
  }

  // ==================================================
  // TRAILING STOP
  // ==================================================

  updateTrailingStop(currentPrice) {
    if (
      !this.position ||
      !this.settings
        .activateTrailingStopLoss
    ) {
      return null;
    }

    const price =
      Number(currentPrice);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return null;
    }

    const entry =
      Number(this.position.entry);

    const trailingDistance =
      price *
      Number(
        this.settings
          .trailingStopDecimal
      );

    const activationDistance =
      entry *
      Number(
        this.settings
          .trailingActivationDecimal
      );

    if (
      this.position.side === "BUY"
    ) {
      const profitMove =
        price - entry;

      if (
        profitMove <
        activationDistance
      ) {
        return null;
      }

      const newStop =
        price - trailingDistance;

      if (
        !this.position.stopLoss ||
        newStop >
          this.position.stopLoss
      ) {
        this.position.stopLoss =
          Number(
            newStop.toFixed(8)
          );

        return this.position.stopLoss;
      }
    }

    if (
      this.position.side === "SELL"
    ) {
      const profitMove =
        entry - price;

      if (
        profitMove <
        activationDistance
      ) {
        return null;
      }

      const newStop =
        price + trailingDistance;

      if (
        !this.position.stopLoss ||
        newStop <
          this.position.stopLoss
      ) {
        this.position.stopLoss =
          Number(
            newStop.toFixed(8)
          );

        return this.position.stopLoss;
      }
    }

    return null;
  }

  // ==================================================
  // TRADE PERMISSION
  // ==================================================

  canTrade() {
    if (!this.running) {
      return {
        allowed: false,
        reason: "Bot is stopped"
      };
    }

    if (
      this.position
    ) {
      return {
        allowed: false,
        reason:
          "Position already open"
      };
    }

    return {
      allowed: true,
      reason: "Trading permitted"
    };
  }

  // ==================================================
  // OPEN POSITION
  // ==================================================

  openDemoPosition(
    signal,
    price,
    candleTime,
    analysis = null
  ) {
    const permission =
      this.canTrade();

    if (
      !permission.allowed
    ) {
      return {
        ok: false,
        error:
          permission.reason
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

    const numericPrice =
      Number(price);

    if (
      !Number.isFinite(
        numericPrice
      ) ||
      numericPrice <= 0
    ) {
      return {
        ok: false,
        error: "Invalid price"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    const stops =
      this.calculateStops(
        signal,
        numericPrice,
        analysis?.atr
      );

    this.position = {
      id:
        AMU-${Date.now()},

      symbol:
        this.symbol,

      side:
        signal,

      entry:
        numericPrice,

      stopLoss:
        stops.stopLoss,

      takeProfit:
        stops.takeProfit,

      stopDistance:
        stops.stopDistance,

      riskAmount:
        Number(
          riskAmount.toFixed(2)
        ),

      volume:
        Number(
          this.settings.defaultVolume
        ),

      candleTime,

      timeframe:
    this.timeframe,

      confidence:
        analysis?.confidence || 0,

      openedAt:
        new Date().toISOString()
    };

    this.totalTrades++;

    return {
      ok: true,
      position:
        this.position
    };
  }

  // ==================================================
  // CLOSE POSITION
  // ==================================================

  closeAtCandleBoundary(
    price,
    reason = "CANDLE_CLOSE"
  ) {
    if (!this.position) {
      return {
        ok: true,
        closed: false,
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
        closed: false,
        reason:
          "Invalid exit price"
      };
    }

    const position =
      this.position;

    let percentageMove;

    if (
      position.side === "BUY"
    ) {
      percentageMove =
        (
          exit -
          position.entry
        ) /
        position.entry;
    } else {
      percentageMove =
        (
          position.entry -
          exit
        ) /
        position.entry;
    }

    const profit =
      position.riskAmount > 0
        ? percentageMove *
          position.riskAmount *
          100
        : 0;

    this.balance += profit;

    const trade = {
      id:
        position.id,

      symbol:
        position.symbol,

      date:
        new Date()
          .toISOString()
          .slice(0, 10),

      side:
        position.side,

      volume:
        position.volume,

      entry:
        position.entry,

      exit,

      stopLoss:
        position.stopLoss,

      takeProfit:
        position.takeProfit,

      profit:
        Number(
          profit.toFixed(2)
        ),

      reason,

      timeframe:
        position.timeframe,

      confidence:
        position.confidence,

      openedAt:
        position.openedAt,

      closedAt:
        new Date().toISOString()
    };

    this.trades.push(trade);

    this.position = null;

    return {
      ok: true,
      closed: true,
      trade,
      balance:
        Number(
          this.balance.toFixed(2)
        )
    };
  }

  // ==================================================
  // COMPLETED CANDLE
  // ==================================================

  processCompletedCandle(
    candle,
    candles
  ) {
    if (!candle) {
      return {
        ok: false,
        action: "WAIT",
        reason:
          "Invalid candle"
      };
    }

    this.totalCandlesProcessed++;
    this.lastProcessedCandle = candle;

    const closePrice =
      Number(candle.close);

    // Update trailing stop first.
    this.updateTrailingStop(
      closePrice
    );

    // Candle-cycle close.
    let closedTrade = null;

    if (
      this.position &&
      this.settings
        .closeAtCandleBoundary
    ) {
      const closeResult =
        this.closeAtCandleBoundary(
          closePrice,
          "CANDLE_CLOSE"
        );

      if (
        closeResult.closed
      ) {
        closedTrade =
          closeResult.trade;
      }
    }

    if (!this.running) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "Engine stopped",
        closedTrade
      };
    }

    const analysis =
      this.analyzeMarket({
        candle,
        candles,
        price: closePrice
      });

    this.lastAnalysis =
      analysis;

    this.lastSignal =
      analysis.signal;

    if (
      analysis.signal === "WAIT"
    ) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "No sufficiently strong signal",
        analysis,
        closedTrade
      };
    }

    if (
      analysis.confidence <
      this.settings.minimumConfidence
    ) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "Confidence below threshold",
        confidence:
          analysis.confidence,
        analysis,
        closedTrade
      };
    }

    const openResult =
      this.openDemoPosition(
        analysis.
        signal,
        closePrice,
        candle.startTime,
        analysis
      );

    if (!openResult.ok) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          openResult.error,
        analysis,
        closedTrade
      };
    }

    this.totalSignals++;

    return {
      ok: true,
      action:
        analysis.signal,
      reason:
        "AI MONSTER U signal generated",
      analysis,
      position:
        openResult.position,
      closedTrade
    };
  }

  // ==================================================
  // BALANCE
  // ==================================================

  setBalance(balance) {
    const value =
      Number(balance);

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      return {
        ok: false,
        error:
          "Invalid balance"
      };
    }

    this.balance = value;

    if (
      this.startingBalance === 0
    ) {
      this.startingBalance =
        value;
    }

    return {
      ok: true,
      balance:
        this.balance
    };
  }

  // ==================================================
  // TODAY PROFIT
  // ==================================================

  getTodayProfit() {
    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    return this.trades
      .filter(
        trade =>
          trade.date === today
      )
      .reduce(
        (
          total,
          trade
        ) =>
          total +
          Number(trade.profit || 0),
        0
      );
  }

  // ==================================================
  // DRAWDOWN
  // ==================================================

  getDrawdownPercent() {
    if (
      this.startingBalance <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      (
        (
          this.startingBalance -
          this.balance
        ) /
        this.startingBalance
      ) * 100
    );
  }

  // ==================================================
  // CONSECUTIVE LOSSES
  // ==================================================

  getConsecutiveLosses() {
    let losses = 0;

    for (
      let i = this.trades.length - 1;
      i >= 0;
      i--
    ) {
      if (
        Number(
          this.trades[i].profit
        ) < 0
      ) {
        losses++;
      } else {
        break;
      }
    }

    return losses;
  }

  // ==================================================
  // STATUS
  // ==================================================

  getStatus() {
    return {
      running:
        this.running,

      symbol:
        this.symbol,

      timeframe:
        this.timeframe,

      balance:
        Number(
          this.balance.toFixed(2)
        ),

      startingBalance:
        Number(
          this.startingBalance.toFixed(2)
        ),

      dailyProfit:
        Number(
          this.getTodayProfit()
            .toFixed(2)
        ),

      drawdownPercent:
        Number(
          this.getDrawdownPercent()
            .toFixed(2)
        ),

      consecutiveLosses:
        this.getConsecutiveLosses(),

      openPosition:
        this.position,

      lastSignal:
        this.lastSignal,

      lastAnalysis:
        this.lastAnalysis,

      tradesToday:
        this.trades.filter(
          trade =>
            trade.date ===
            new Date()
              .toISOString()
              .slice(0, 10)
        ).length,

      totalTrades:
        this.totalTrades,

      totalCandlesProcessed:
        this.totalCandlesProcessed,

      totalSignals:
        this.totalSignals,

      settings:
        this.settings,

      millisecondsUntilCandleClose:
        this.getMillisecondsUntilClose()
    };
  }

  // ==================================================
  // HISTORY
  // ==================================================

  getTrades() {
    return [
      ...this.trades
    ].reverse();
  }
}

export default TradingEngine;
