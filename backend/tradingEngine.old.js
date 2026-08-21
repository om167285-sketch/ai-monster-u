// AI MONSTER U
// Candle-Cycle Scalping Trading Engine
//
// Strategy:
// EMA 9 / EMA 21 / EMA 50
// RSI 14
// ATR 14
// Candle confirmation
//
// Every completed candle is analyzed.
// The selected timeframe controls the trading cycle.
//
// This engine manages strategy state.
// MT5 remains the execution layer for LIVE trading.

class TradingEngine {
  constructor() {
    this.running = false;

    this.symbol = "BTCUSDT";
    this.timeframe = "1m";

    this.balance = 50.00;
    this.startingBalance = 50.00;

    this.position = null;
    this.trades = [];

    this.lastCandleTime = null;
    this.lastProcessedCandle = null;

    this.settings = {
      // Position risk
      riskPercent: 0.5,

      // Strategy
      emaFast: 9,
      emaSlow: 21,
      emaTrend: 50,

      rsiPeriod: 14,
      atrPeriod: 14,

      // RSI confirmation
      rsiBuy: 55,
      rsiSell: 45,

      // Reward/risk
      rewardRisk: 1.5,

      // ATR multiplier for stop
      atrStopMultiplier: 1.0,

      // Minimum signal score
      minimumSignalScore: 4,

      // Candle confirmation
      minimumBodyPercent: 0.20
    };
  }

  // --------------------------------------------------
  // SYMBOL
  // --------------------------------------------------

  setSymbol(symbol) {
    if (!symbol) {
      throw new Error("Symbol is required");
    }

    this.symbol =
      String(symbol).toUpperCase();

    return this.symbol;
  }

  // --------------------------------------------------
  // TIMEFRAME
  // --------------------------------------------------

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
        "Unsupported timeframe: " +
        timeframe
      );
    }

    this.timeframe = timeframe;

    return this.timeframe;
  }

  // --------------------------------------------------
  // TIMEFRAME MILLISECONDS
  // --------------------------------------------------

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

  // --------------------------------------------------
  // CANDLE BOUNDARY
  // --------------------------------------------------

  getCandleBoundary(
    timestamp = Date.now()
  ) {
    const duration =
      this.getTimeframeMilliseconds();

    return (
      Math.floor(
        timestamp / duration
      ) * duration
    );
  }

  // --------------------------------------------------
  // NEW CANDLE
  // --------------------------------------------------

  isNewCandle(
    timestamp = Date.now()
  ) {
    const boundary =
      this.getCandleBoundary(
        timestamp
      );

    if (
      this.lastCandleTime === null
    ) {
      this.lastCandleTime =
        boundary;

      return true;
    }

    if (
      boundary >
      this.lastCandleTime
    ) {
      this.lastCandleTime =
        boundary;

      return true;
    }

    return false;
  }

  // --------------------------------------------------
  // TIME UNTIL CANDLE CLOSE
  // --------------------------------------------------

  getMillisecondsUntilClose(
    timestamp = Date.now()
  ) {
    const duration =
      this.getTimeframeMilliseconds();

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

  // --------------------------------------------------
  // START
  // --------------------------------------------------

  start() {
    this.running = true;

    return {
      ok: true,
      running: true,
      symbol: this.symbol,
      timeframe: this.timeframe,
      message:
        "AI MONSTER U candle-cycle scalping engine started"
    };
  }

  // --------------------------------------------------
  // STOP
// --------------------------------------------------

  stop() {
    this.running = false;

    return {
      ok: true,
      running: false,
      message:
        "AI MONSTER U trading engine stopped"
    };
  }

  // --------------------------------------------------
  // RISK AMOUNT
  // --------------------------------------------------

  calculateRiskAmount() {
    return (
      this.balance *
      (
        this.settings.riskPercent /
        100
      )
    );
  }

  // --------------------------------------------------
  // BASIC TRADE CHECK
  // --------------------------------------------------
  //
  // No daily-loss lock.
  // No drawdown lock.
  // No consecutive-loss lock.
  //
  // Every completed candle is allowed
  // to generate a new signal.
  //
  // The emergency stop remains available
  // through this.running.
  // --------------------------------------------------

  canTrade() {
    if (!this.running) {
      return {
        allowed: false,
        reason: "Bot is stopped"
      };
    }

    if (
      this.balance <= 0
    ) {
      return {
        allowed: false,
        reason: "Insufficient balance"
      };
    }

    return {
      allowed: true,
      reason:
        "Candle-cycle trade permitted"
    };
  }

  // --------------------------------------------------
  // EMA
  // --------------------------------------------------

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

    const multiplier =
      2 / (period + 1);

    let ema =
      values
        .slice(0, period)
        .reduce(
          (sum, value) =>
            sum + Number(value),
          0
        ) / period;

    for (
      let i = period;
      i < values.length;
      i++
    ) {
      const value =
        Number(values[i]);

      ema =
        (
          value - ema
        ) *
          multiplier +
        ema;
    }

    return ema;
  }

  // --------------------------------------------------
  // RSI
  // --------------------------------------------------

  calculateRSI(
    closes,
    period = 14
  ) {
    if (
      !Array.isArray(closes) ||
      closes.length <
        period + 1
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
        Number(closes[i]) -
        Number(closes[i - 1]);

      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(
          change
        );
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
        Number(closes[i]) -
        Number(closes[i - 1]);

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

    if (
      averageLoss === 0
    ) {
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

  // --------------------------------------------------
  // ATR
  // --------------------------------------------------

  calculateATR(
    candles,
    period = 14
  ) {
    if (
      !Array.isArray(candles) ||
      candles.length <
        period + 1
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

      trueRanges.push(
        trueRange
      );
    }

    if (
      trueRanges.length <
      period
    ) {
      return null;
    }

    const recent =
      trueRanges.slice(
        -period
      );

    return (
      recent.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / recent.length
    );
  }

  // --------------------------------------------------
  // CANDLE BODY
  // --------------------------------------------------

  analyzeCandle(candle) {
    if (!candle) {
      return {
        bullish: false,
        bearish: false,
        bodyPercent: 0,
        range: 0
      };
    }

    const open =
      Number(candle.open);

    const high =
      Number(candle.high);

    const low =
      Number(candle.low);

    const close =
      Number(candle.close);

    const range =
      Math.max(
        high - low,
        0
      );

    const body =
      Math.abs(
        close - open
      );

    const bodyPercent =
      range > 0
        ? body / range
        : 0;

    return {
      bullish:
        close > open,

      bearish:
        close < open,

      bodyPercent,

      range,

      body
    };
  }

  // --------------------------------------------------
  // MARKET ANALYSIS
  // --------------------------------------------------

  analyzeMarket(data) {
    if (!data) {
      return {
        signal: "WAIT",
        confidence: 0,
        reasons: [
          "No market data"
        ]
      };
    }

    const candles =
      Array.isArray(
        data.candles
      )
        ? data.candles
        : [];

    const current =
      data.candle ||
      candles[candles.length - 1];

    if (!current) {
      return {
        signal: "WAIT",
        confidence: 0,
        reasons: [
          "No completed candle"
        ]
      };
    }

    const closes =
      candles.map(
        candle =>
          Number(candle.close)
      );

    const ema9 =
      data.ema9 ??
      this.calculateEMA(
        closes,
        this.settings.emaFast
      );

    const ema21 =
      data.ema21 ??
      this.calculateEMA(
        closes,
        this.settings.emaSlow
      );

    const ema50 =
      data.ema50 ??
      this.calculateEMA(
        closes,
        this.settings.emaTrend
      );

    const rsi =
      data.rsi ??
      this.calculateRSI(
        closes,
        this.settings.rsiPeriod
      );

    const atr =
      data.atr ??
      this.calculateATR(
        candles,
        this.settings.atrPeriod
      );

    const candle =
      this.analyzeCandle(
        current
      );

    let buyScore = 0;
    let sellScore = 0;

    const buyReasons = [];
    const sellReasons = [];

    // ----------------------------------------------
    // EMA TREND
    // ----------------------------------------------

    if (
      ema9 !== null &&
      ema21 !== null &&
      ema50 !== null
    ) {
      if (
        ema9 > ema21 &&
        ema21 > ema50
      ) {
        buyScore += 2;

        buyReasons.push(
          "EMA 9 > EMA 21 > EMA 50"
        );
      }

      if (
        ema9 < ema21 &&
        ema21 < ema50
      ) {
        sellScore += 2;

        sellReasons.push(
          "EMA 9 < EMA 21 < EMA 50"
        );
      }
    }

    // ----------------------------------------------
    // RSI
    // ----------------------------------------------

    if (rsi !== null) {
      if (
        rsi >=
        this.settings.rsiBuy
      ) {
        buyScore += 1;

        buyReasons.push(
          "RSI bullish momentum"
        );
      }

      if (
        rsi <=
        this.settings.rsiSell
      ) {
        sellScore += 1;

        sellReasons.push(
          "RSI bearish momentum"
        );
      }
    }

    // ----------------------------------------------
    // CANDLE CONFIRMATION
    // ----------------------------------------------

    if (
      candle.bodyPercent >=
      this.settings.minimumBodyPercent
    ) {
      if (candle.bullish) {
        buyScore += 1;

        buyReasons.push(
          "Bullish candle confirmation"
        );
      }

      if (candle.bearish) {
        sellScore += 1;

        sellReasons.push(
          "Bearish candle confirmation"
        );
      }
    }

    // ----------------------------------------------
    // MOMENTUM / BREAKOUT
    // ----------------------------------------------

    if (
      candles.length >= 2
    ) {
      const previous =
        candles[
          candles.length - 2
        ];

      const currentClose =
        Number(
          current.close
        );

      const previousHigh =
        Number(
          previous.high
        );

      const previousLow =
        Number(
          previous.low
        );

      if (
        currentClose >
        previousHigh
      ) {
        buyScore += 1;

        buyReasons.push(
          "Previous-candle high breakout"
        );
      }

      if (
        currentClose <
        previousLow
      ) {
        sellScore += 1;

        sellReasons.push(
          "Previous-candle low breakdown"
        );
      }
    }

    // ----------------------------------------------
    // SIGNAL
    // ----------------------------------------------

    let signal = "WAIT";

    let confidence = 0;

    let reasons = [];

    if (
      buyScore >=
        this.settings.minimumSignalScore &&
      buyScore > sellScore
    ) {
      signal = "BUY";

      confidence =
        Math.min(
          95,
          50 + buyScore * 8
        );

      reasons =
        buyReasons;
    }

    if (
      sellScore >=
        this.settings.minimumSignalScore &&
      sellScore > buyScore
    ) {
      signal = "SELL";

      confidence =
        Math.min(
          95,
          50 + sellScore * 8
        );

      reasons =
        sellReasons;
    }

    return {
      signal,
      confidence,

      buyScore,
      sellScore,

      ema9:
        ema9 !== null
          ? Number(
              ema9.toFixed(8)
            )
          : null,

      ema21:
        ema21 !== null
          ? Number(
              ema21.toFixed(8)
            )
          : null,

      ema50:
        ema50 !== null
          ? Number(
              ema50.toFixed(8)
            )
          : null,

      rsi:
        rsi !== null
          ? Number(
              rsi.toFixed(2)
            )
          : null,

      atr:
        atr !== null
          ? Number(
              atr.toFixed(8)
            )
          : null,

      candle: {
        bullish:
          candle.bullish,

        bearish:
          candle.bearish,

        bodyPercent:
          Number(
            (
              candle.bodyPercent *
              100
            ).toFixed(2)
          )
      },

      reasons
    };
  }

  // --------------------------------------------------
  // PROCESS COMPLETED CANDLE
  // --------------------------------------------------

  processCompletedCandle(
    candle,
    candles
  ) {
    if (!candle) {
      return {
        ok: false,
        action: "WAIT",
        reason:
          "No candle received"
      };
    }

    const candleTime =
      candle.startTime ??
      candle.time ??
      Date.now();

    // Prevent duplicate processing
    if (
      this.lastProcessedCandle ===
      candleTime
    ) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "Candle already processed",
        candleTime
      };
    }

    this.lastProcessedCandle =
      candleTime;

    // ----------------------------------------------
    // ENGINE OFF
    // ----------------------------------------------

    if (!this.running) {
      return {
        ok: true,
        action: "WAIT",
        reason:
          "Engine stopped",
        candleTime
      };
    }

    // ----------------------------------------------
    // CLOSE PREVIOUS CYCLE
    // ----------------------------------------------

    let closedTrade = null;

    if (this.position) {
      const closeResult =
        this.closeAtCandleBoundary(
          Number(candle.close),
          "CANDLE_CLOSE"
        );

      if (
        closeResult.closed
      ) {
        closedTrade =
          closeResult.trade;
      }
    }

    // ----------------------------------------------
    // ANALYZE NEW CANDLE
    // ----------------------------------------------

    const analysis =
      this.analyzeMarket({
        candles,
        candle
      });

    // ----------------------------------------------
    // WAIT
    // ----------------------------------------------

    if (
      analysis.signal ===
      "WAIT"
    ) {
      return {
        ok: true,
        action: "WAIT",
        signal: "WAIT",
        analysis,
        closedTrade,
        candleTime
      };
    }

    // ----------------------------------------------
    // OPEN NEW DEMO/PAPER POSITION
    // ----------------------------------------------

    const result =
      this.openDemoPosition(
        analysis.signal,
        Number(candle.close),
        candleTime,
        analysis
      );

    return {
      ok: result.ok,

      action:
        result.ok
          ? "OPEN"
          : "WAIT",

      signal:
        analysis.signal,

      analysis,

      position:
        result.position ||
        null,

      error:
        result.error ||
        null,

      closedTrade,

      candleTime
    };
  }

  // --------------------------------------------------
  // OPEN DEMO POSITION
  // --------------------------------------------------

  openDemoPosition(
    signal,
    price,
    candleTime,
    analysis = null
  ) {
    if (
      this.position
    ) {
      return {
        ok: false,
        error:
          "A position is already open"
      };
    }

    const risk =
      this.canTrade();

    if (!risk.allowed) {
      return {
        ok: false,
        error:
          risk.reason
      };
    }

    if (
      signal !== "BUY" &&
      signal !== "SELL"
    ) {
      return {
        ok: false,
        error:
          "Invalid signal"
      };
    }

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return {
        ok: false,
        error:
          "Invalid entry price"
      };
    }

    const riskAmount =
      this.calculateRiskAmount();

    // ----------------------------------------------
    // ATR-BASED STOP
    // ----------------------------------------------

    let stopDistance =
      price * 0.001;

    if (
      analysis &&
      Number.isFinite(
        analysis.atr
      ) &&
      analysis.atr > 0
    ) {
      stopDistance =
        analysis.atr *
        this.settings
          .atrStopMultiplier;
    }

    stopDistance =
      Math.max(
        stopDistance,
        price * 0.0005
      );

    const takeProfitDistance =
      stopDistance *
      this.settings.rewardRisk;

    const stopLoss =
      signal === "BUY"
        ? price -
          stopDistance
        : price +
          stopDistance;

    const takeProfit =
      signal === "BUY"
        ? price +
          takeProfitDistance
        : price -
          takeProfitDistance;

    this.position = {
      id:
        "AMU-" +
        Date.now(),

      symbol:
        this.symbol,

      side:
        signal,

      entry:
        price,

      stopLoss,

      takeProfit,

      riskAmount,

      riskPercent:
        this.settings.riskPercent,

      candleTime,

      timeframe:
        this.timeframe,

      confidence:
        analysis?.confidence ??
        null,

      openedAt:
        new Date().toISOString()
    };

    return {
      ok: true,

      position:
        this.position
    };
  }

  // --------------------------------------------------
  // CLOSE AT CANDLE BOUNDARY
  // --------------------------------------------------

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

    const position =
      this.position;
    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return {
        ok: false,
        closed: false,
        reason:
          "Invalid closing price"
      };
    }

    let percentageMove;

    if (
      position.side === "BUY"
    ) {
      percentageMove =
        (
          price -
          position.entry
        ) /
        Math.max(
          position.entry,
          0.0000001
        );
    } else {
      percentageMove =
        (
          position.entry -
          price
        ) /
        Math.max(
          position.entry,
          0.0000001
        );
    }

    const profit =
      percentageMove *
      position.riskAmount *
      100;

    this.balance +=
      profit;

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

      entry:
        Number(
          position.entry.toFixed(8)
        ),

      exit:
        Number(
          price.toFixed(8)
        ),

      profit:
        Number(
          profit.toFixed(2)
        ),

      riskAmount:
        Number(
          position.riskAmount
            .toFixed(2)
        ),

      timeframe:
        position.timeframe,

      confidence:
        position.confidence,

      reason,

      openedAt:
        position.openedAt,

      closedAt:
        new Date()
          .toISOString()
    };

    this.trades.push(
      trade
    );

    this.position =
      null;

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

  // --------------------------------------------------
  // TODAY PROFIT
  // --------------------------------------------------

  getTodayProfit() {
    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    return this.trades
      .filter(
        trade =>
          trade.date ===
          today
      )
      .reduce(
        (
          total,
          trade
        ) =>
          total +
          trade.profit,
        0
      );
  }

  // --------------------------------------------------
  // DRAWDOWN INFORMATION
  // --------------------------------------------------

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

  // --------------------------------------------------
  // CONSECUTIVE LOSSES
  // --------------------------------------------------

  getConsecutiveLosses() {
    let losses = 0;

    for (
      let i =
        this.trades.length - 1;
      i >= 0;
      i--
    ) {
      if (
        this.trades[i]
          .profit < 0
      ) {
        losses++;
      } else {
        break;
      }
    }

    return losses;
  }

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  getStatus() {
    const now =
      Date.now();

    return {
      running:
        this.running,

      symbol:
        this.symbol,

      timeframe:
        this.timeframe,

      strategy:
        "EMA 9/21/50 + RSI 14 + ATR 14 + Candle Confirmation",

      balance:
        Number(
          this.balance.toFixed(2)
        ),

      startingBalance:
        Number(
          this.startingBalance
            .toFixed(2)
        ),

      equity:
        Number(
          this.balance.toFixed(2)
        ),

      riskPercent:
        this.settings
          .riskPercent,

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

      tradesToday:
        this.trades.filter(
          trade =>
            trade.date ===
            new Date()
              .toISOString()
              .slice(0, 10)
        ).length,

      totalTrades:
        this.trades.length,

      lastProcessedCandle:
        this.lastProcessedCandle,

      millisecondsUntilCandleClose:
        this.getMillisecondsUntilClose(
          now
        ),

      strategySettings: {
        emaFast:
          this.settings.emaFast,

        emaSlow:
          this.settings.emaSlow,

        emaTrend:
          this.settings.emaTrend,

        rsiPeriod:
          this.settings.rsiPeriod,

        atrPeriod:
          this.settings.atrPeriod,

        rsiBuy:
          this.settings.rsiBuy,

        rsiSell:
          this.settings.rsiSell,

        rewardRisk:
          this.settings.rewardRisk,

        atrStopMultiplier:
          this.settings
            .atrStopMultiplier
      }
    };
  }

  // --------------------------------------------------
  // TRADE HISTORY
  // --------------------------------------------------

  getTrades() {
    return [
      ...this.trades
    ].reverse();
  }
}

export default TradingEngine;
