// AI MONSTER U
// Professional Candle-Cycle Trading Engine
// DEMO / PAPER TRADING ENGINE
//
// Strategy:
// EMA 9 / EMA 21 / EMA 50
// RSI 14
// ATR 14
// Momentum
// Candle confirmation
//
// Candle-cycle behavior:
// 1. Receive completed candle
// 2. Close previous candle position
// 3. Analyze the new market condition
// 4. Generate BUY / SELL / WAIT
// 5. If BUY/SELL -> create a new DEMO position
//
// LIVE broker execution is intentionally handled
// by the MT5 bridge and is not enabled by this engine.

class TradingEngine {

  constructor() {

    // ------------------------------------------------
    // ENGINE STATE
    // ------------------------------------------------

    this.running = false;
this.symbol = "BTCUSD";
this.timeframe = "1m";

this.settings = {
  riskPercent: 0.5,

  emaFast: 9,
  emaMedium: 21,
  emaSlow: 50,

  rsiPeriod: 14,
  rsiBuyLevel: 55,
  rsiSellLevel: 45,

  atrPeriod: 14,

  rewardRisk: 1.2,
  stopAtrMultiplier: 1.0,

  minimumConfidence: 60,

  defaultVolume: 0.01,

  closeAtCandleBoundary: true
};
  }


  // ==================================================
  // BASIC SETTINGS
  // ==================================================

  setSymbol(symbol) {

    if (!symbol) {
      throw new Error("Symbol is required");
    }

    this.symbol =
      String(symbol).toUpperCase();

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
        "Unsupported timeframe: " +
        timeframe
      );
    }

    this.timeframe = timeframe;

    return {
      ok: true,
      timeframe: this.timeframe
    };
  }


  getTimeframeMilliseconds() {

    const values = {

      "1m":
        60 * 1000,

      "5m":
        5 * 60 * 1000,

      "15m":
        15 * 60 * 1000,

      "30m":
        30 * 60 * 1000,

      "1h":
        60 * 60 * 1000,

      "4h":
        4 * 60 * 60 * 1000
    };

    return values[this.timeframe];
  }


  // ==================================================
  // CANDLE TIME
  // ==================================================

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


  // ==================================================
  // ENGINE CONTROL
  // ==================================================

  start() {
    this.running = true;

    return {

      ok: true,

      running: true,

      symbol:
        this.symbol,

      timeframe:
        this.timeframe,

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
  // INDICATORS
  // ==================================================

  calculateEMA(
    candles,
    period
  ) {

    if (
      !Array.isArray(candles) ||
      candles.length < period
    ) {
      return null;
    }

    const closes =
      candles
        .map(c =>
          Number(c.close)
        )
        .filter(
          Number.isFinite
        );

    if (
      closes.length < period
    ) {
      return null;
    }

    let ema = 0;

    // Initial SMA
    for (
      let i = 0;
      i < period;
      i++
    ) {

      ema +=
        closes[i];
    }

    ema /=
      period;

    const multiplier =
      2 /
      (period + 1);

    for (
      let i = period;
      i < closes.length;
      i++
    ) {

      ema =
        (
          closes[i] -
          ema
        ) *
          multiplier +
        ema;
    }

    return ema;
  }


  calculateRSI(
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

    const closes =
      candles.map(c =>
        Number(c.close)
      );

    let gains = 0;
    let losses = 0;

    for (
      let i = 1;
      i <= period;
      i++
    ) {

      const change =
        closes[i] -
        closes[i - 1];

      if (
        change > 0
      ) {

        gains +=
          change;

      } else {

        losses +=
          Math.abs(change);
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
        closes[i] -
        closes[i - 1];

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
        ) /
        period;

      averageLoss =
        (
          averageLoss *
            (period - 1) +
          loss
        ) /
        period;
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
      100 /
        (1 + rs)
    );
  }


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
        Number(
          current.high
        );

      const low =
        Number(
          current.low
        );

      const previousClose =
        Number(
          previous.close
        );

      const tr =
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
        tr
      );
    }

    if (
      trueRanges.length <
      period
    ) {
      return null;
    }

    let atr = 0;

    for (
      let i = 0;
      i < period;
      i++
    ) {

      atr +=
        trueRanges[i];
    }

    atr /=
      period;

    for (
      let i = period;
      i < trueRanges.length;
      i++
    ) {

      atr =
        (
          atr *
            (period - 1) +
          trueRanges[i]
        ) /
        period;
    }

    return atr;
  }


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
        candles[
          candles.length - 1
        ].close
      );

    const previous =
      Number(
        candles[
          candles.length -
          1 -
          lookback
        ].close
      );

    if (
      previous === 0
    ) {
      return 0;
    }

    return (
      (
        current -
        previous
      ) /
      previous
    ) *
    100;
  }


  // ==================================================
  // CANDLE DIRECTION
  // ==================================================

  getCandleDirection(
    candle
  ) {

    const open =
      Number(
        candle.open
      );

    const close =
      Number(
        candle.close
      );

    if (
      close > open
    ) {
      return "BULLISH";
    }

    if (
      close < open
    ) {
      return "BEARISH";
    }

    return "NEUTRAL";
  }


  // ==================================================
  // MARKET ANALYSIS
  // ==================================================

  analyzeMarket(
    data
  ) {

    if (!data) {

      return {

        signal:
          "WAIT",

        confidence:
          0,

        buyScore:
          0,

        sellScore:
          0,

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
      candles[
        candles.length - 1
      ];

    if (!current) {

      return {

        signal:
          "WAIT",

        confidence:
          0,

        buyScore:
          0,

        sellScore:
          0,

        reasons: [
          "No candle available"
        ]
      };
    }

    const price =
      Number(
        data.price ??
        current.close
      );

    const ema9 =
      data.ema9 ??
      this.calculateEMA(
        candles,
        9
      );

    const ema21 =
      data.ema21 ??
      this.calculateEMA(
        candles,
        21
      );

    const ema50 =
      data.ema50 ??
      this.calculateEMA(
        candles,
        50
      );

    const rsi =
      data.rsi ??
      this.calculateRSI(
        candles,
        14
      );

    const atr =
      data.atr ??
      this.calculateATR(
        candles,
        14
      );

    const momentum =
      data.momentum ??
      this.calculateMomentum(
        candles,
        5
      );

    const candleDirection =
      this.getCandleDirection(
        current
      );

    let buyScore = 0;
    let sellScore = 0;

    const buyReasons = [];
    const sellReasons = [];

    // ------------------------------------------------
    // EMA TREND
    // ------------------------------------------------

    if (
      ema9 !== null &&
      ema21 !== null
    ) {

      if (
        ema9 >
        ema21
      ) {

        buyScore += 2;

        buyReasons.push(
          "EMA 9 above EMA 21"
        );

      } else if (
        ema9 <
        ema21
      ) {

        sellScore += 2;

        sellReasons.push(
          "EMA 9 below EMA 21"
        );
      }
    }


    if (
      ema21 !== null &&
      ema50 !== null
    ) {

      if (
        ema21 >
        ema50
      ) {

        buyScore += 2;

        buyReasons.push(
          "EMA 21 above EMA 50"
        );

      } else if (
        ema21 <
        ema50
      ) {

        sellScore += 2;

        sellReasons.push(
          "EMA 21 below EMA 50"
        );
      }
    }


    // ------------------------------------------------
    // PRICE VS EMA 50
    // ------------------------------------------------

    if (
      ema50 !== null
    ) {

      if (
        price >
        ema50
      ) {

        buyScore += 1;

        buyReasons.push(
          "Price above EMA 50"
        );

      } else if (
        price <
        ema50
      ) {

        sellScore += 1;

        sellReasons.push(
          "Price below EMA 50"
        );
      }
      }


    // ------------------------------------------------
    // RSI
    // ------------------------------------------------

    if (
      rsi !== null
    ) {

      if (
        rsi >=
        this.settings.rsiBuyLevel &&
        rsi < 75
      ) {

        buyScore += 2;

        buyReasons.push(
          "RSI bullish momentum"
        );

      } else if (
        rsi <=
        this.settings.rsiSellLevel &&
        rsi > 25
      ) {

        sellScore += 2;

        sellReasons.push(
          "RSI bearish momentum"
        );
      }
    }


    // ------------------------------------------------
    // MOMENTUM
    // ------------------------------------------------

    if (
      momentum > 0
    ) {

      buyScore += 1;

      buyReasons.push(
        "Positive momentum"
      );

    } else if (
      momentum < 0
    ) {

      sellScore += 1;

      sellReasons.push(
        "Negative momentum"
      );
    }


    // ------------------------------------------------
    // CANDLE CONFIRMATION
    // ------------------------------------------------

    if (
      candleDirection ===
      "BULLISH"
    ) {

      buyScore += 1;

      buyReasons.push(
        "Bullish candle confirmation"
      );

    } else if (
      candleDirection ===
      "BEARISH"
    ) {

      sellScore += 1;

      sellReasons.push(
        "Bearish candle confirmation"
      );
    }


    // ------------------------------------------------
    // SIGNAL
    // ------------------------------------------------

    let signal =
      "WAIT";

    let confidence =
      0;

    let reasons = [];


    if (
      buyScore >= 5 &&
      buyScore >
        sellScore
    ) {

      signal =
        "BUY";

      confidence =
        Math.min(
          95,
          50 +
          buyScore * 7
        );

      reasons =
        buyReasons;

    } else if (
      sellScore >= 5 &&
      sellScore >
        buyScore
    ) {

      signal =
        "SELL";

      confidence =
        Math.min(
          95,
          50 +
          sellScore * 7
        );

      reasons =
        sellReasons;

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
  // COMPLETED CANDLE PROCESSOR
  // ==================================================

  processCompletedCandle(
    candle,
    candles
  ) {

    this.totalCandlesProcessed++;

    this.lastProcessedCandle =
      candle;

    if (
      !candle
    ) {

      return {

        ok: false,

        action:
          "WAIT",

        reason:
          "Invalid candle"
      };
    }


    const closePrice =
      Number(
        candle.close
      );


    // ------------------------------------------------
    // CLOSE PREVIOUS POSITION
    // ------------------------------------------------

    let closedTrade =
      null;

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


    // ------------------------------------------------
    // DON'T OPEN NEW TRADES IF STOPPED
    // ------------------------------------------------

    if (
      !this.running
    ) {

      return {

        ok: true,

        action:
          "WAIT",

        reason:
          "Engine stopped",

        closedTrade
      };
    }


    // ------------------------------------------------
    // ANALYZE
    // ------------------------------------------------

    const analysis =
      this.analyzeMarket({

        candle,

        candles,

        price:
          closePrice
      });


    this.
      lastAnalysis =
      analysis;

    this.lastSignal =
      analysis.signal;


    // ------------------------------------------------
    // WAIT
    // ------------------------------------------------

    if (
      analysis.signal ===
      "WAIT"
    ) {

      return {

        ok: true,

        action:
          "WAIT",

        reason:
          "No sufficiently strong signal",

        analysis,

        closedTrade
      };
    }


    // ------------------------------------------------
    // CONFIDENCE FILTER
    // ------------------------------------------------

    if (
      analysis.confidence <
      this.settings.minimumConfidence
    ) {

      return {

        ok: true,

        action:
          "WAIT",

        reason:
          "Signal confidence below threshold",

        confidence:
          analysis.confidence,

        analysis,

        closedTrade
      };
    }


    // ------------------------------------------------
    // OPEN DEMO POSITION
    // ------------------------------------------------

    const openResult =
      this.openDemoPosition(
        analysis.signal,
        closePrice,
        candle.startTime ||
        candle.endTime ||
        Date.now(),
        analysis
      );


    if (
      !openResult.ok
    ) {

      return {

        ok: true,

        action:
          "WAIT",

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
  // RISK AMOUNT
  // ==================================================

  calculateRiskAmount() {

    return (
      this.balance *
      (
        this.settings
          .riskPercent /
        100
      )
    );
  }


  // ==================================================
  // TRADE PERMISSION
  // ==================================================

  canTrade() {

    if (
      !this.running
    ) {

      return {

        allowed:
          false,

        reason:
          "Bot is stopped"
      };
    }


    if (
      this.balance <= 0
    ) {

      return {

        allowed:
          false,

        reason:
          "Insufficient balance"
      };
    }


    // No daily loss lock.
    // No maximum drawdown lock.
    // No consecutive-loss lock.
    //
    // The user requested candle-by-candle
    // trading behavior.

    return {

      allowed:
        true,

      reason:
        "Trading permitted"
    };
  }


  // ==================================================
  // OPEN DEMO POSITION
  // ==================================================

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

        error:
          "Invalid signal"
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

        error:
          "Invalid price"
      };
    }


    const riskAmount =
      this.calculateRiskAmount();


    // ------------------------------------------------
    // ATR STOP
    // ------------------------------------------------

    const atr =
      analysis &&
      Number(analysis.atr) > 0
        ? Number(
            analysis.atr
          )
        : numericPrice *
          0.001;


    const stopDistance =
      Math.max(
        atr *
          this.
        settings
            .stopAtrMultiplier,

        numericPrice *
          0.001
      );


    const takeProfitDistance =
      stopDistance *
      this.settings.rewardRisk;


    const stopLoss =
      signal === "BUY"

        ? numericPrice -
          stopDistance

        : numericPrice +
          stopDistance;


    const takeProfit =
      signal === "BUY"

        ? numericPrice +
          takeProfitDistance

        : numericPrice -
          takeProfitDistance;


    // ------------------------------------------------
    // POSITION
    // ------------------------------------------------

    this.position = {

      id:
        "AMU-" +
        Date.now(),

      symbol:
        this.symbol,

      side:
        signal,

      entry:
        numericPrice,

      stopLoss:
        Number(
          stopLoss.toFixed(8)
        ),

      takeProfit:
        Number(
          takeProfit.toFixed(8)
        ),

      riskAmount:
        Number(
          riskAmount.toFixed(2)
        ),

      volume:
        this.settings
          .defaultVolume,

      candleTime,

      timeframe:
        this.timeframe,

      confidence:
        analysis
          ? analysis.confidence
          : 0,

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

    if (
      !this.position
    ) {

      return {

        ok: true,

        closed: false,

        reason:
          "No open position"
      };
    }


    const position =
      this.position;


    const exit =
      Number(price);


    if (
      !Number.isFinite(
        exit
      ) ||
      exit <= 0
    ) {

      return {

        ok: false,

        closed: false,

        reason:
          "Invalid exit price"
      };
    }


    let percentageMove;


    if (
      position.side ===
      "BUY"
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


    /*
    Approximate P/L for the demo engine.

    The MT5 bridge will use actual broker
    execution/account values when connected.
    */

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
          trade.date ===
          today
      )
      .reduce(
        (
          total,
          trade
        ) =>
          total +
          Number(
            trade.profit
          ),

        0
      );
  }
  // ==================================================
  // DRAWDOWN INFORMATION
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
      ) *
      100
    );
  }


  // ==================================================
  // CONSECUTIVE LOSSES
  // ==================================================

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


  // ==================================================
  // STATUS
  // ==================================================

  getStatus() {

    const now =
      Date.now();


    let equity =
      this.balance;


    /*
    Approximate unrealized P/L.
    */

    if (
      this.position
    ) {

      const lastPrice =
        this.lastProcessedCandle
          ? Number(
              this.lastProcessedCandle
                .close
            )
          : this.position.entry;


      let unrealized = 0;


      if (
        this.position.side ===
        "BUY"
      ) {

        unrealized =
          (
            lastPrice -
            this.position.entry
          ) /
          this.position.entry;

      } else {

        unrealized =
          (
            this.position.entry -
            lastPrice
          ) /
          this.position.entry;
      }


      unrealized *=
        this.position.riskAmount *
        100;


      equity +=
        unrealized;
    }


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

      equity:
        Number(
          equity.toFixed(2)
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

      millisecondsUntilCandleClose:
        this.getMillisecondsUntilClose(
          now
        )
    };
  }


  // ==================================================
  // TRADE HISTORY
  // ==================================================

  getTrades() {

    return [
      ...this.trades
    ].reverse();
  }
}


export default TradingEngine;
