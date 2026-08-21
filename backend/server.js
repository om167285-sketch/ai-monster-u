import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import TradingEngine from "./tradingEngine.js";
import MarketData from "./marketData.js";

const app = express();

const PORT = Number(process.env.PORT) || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

/*
|--------------------------------------------------------------------------
| TRADING ENGINE
|--------------------------------------------------------------------------
*/

const engine = new TradingEngine();
const market = new MarketData();

/*
|--------------------------------------------------------------------------
| MT5 BRIDGE
|--------------------------------------------------------------------------
*/

let mt5Bridge = {
  connected: false,
  lastHeartbeat: null,

  mode: "UNKNOWN",
  account: null,
  broker: null,
  server: null,
  currency: null,

  balance: 0,
  equity: 0,
  margin: 0,
  freeMargin: 0,

  symbol: null,
  timeframe: null,
  bid: 0,
  ask: 0,

  updatedAt: null
};

/*
|--------------------------------------------------------------------------
| MT5 COMMAND QUEUE
|--------------------------------------------------------------------------
|
| The backend can create a command.
| The EA polls this endpoint.
|
| IMPORTANT:
| Live execution is NOT enabled here.
|
|--------------------------------------------------------------------------
*/

let mt5Command = {
  id: null,
  action: "NONE",
  mode: "DEMO",
  symbol: null,
  volume: 0,
  sl: 0,
  tp: 0,
  reason: null,
  createdAt: null
};

/*
|--------------------------------------------------------------------------
| MT5 LAST EXECUTION
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| COMPLETED CANDLE
|--------------------------------------------------------------------------
*/

market.setCandleCloseHandler((candle, candles) => {
  try {
    const result = engine.processCompletedCandle(
      candle,
      candles
    );

    console.log(
      "Candle processed:",
      JSON.stringify(result)
    );

    /*
    --------------------------------------------------
    DEMO MT5 COMMAND GENERATION
    --------------------------------------------------
    */

    if (
      result &&
      result.ok &&
      result.action &&
      (
        result.action === "BUY" ||
        result.action === "SELL"
      )
    ) {
      const price =
        Number(candle.close);

      const signal =
        result.action;

      const analysis =
        result.analysis || {};

      const atr =
        Number(analysis.atr || 0);

      /*
      ATR fallback for markets where ATR
      is unavailable.
      */

      const minimumDistance =
        price * 0.001;

      const stopDistance =
        Math.max(
          atr > 0
            ? atr
            : minimumDistance,
          minimumDistance
        );

      const rewardRisk = 1.5;

      const stopLoss =
        signal === "BUY"
          ? price - stopDistance
          : price + stopDistance;

      const takeProfit =
        signal === "BUY"
          ? price + stopDistance * rewardRisk
          : price - stopDistance * rewardRisk;

      /*
      ------------------------------------------------
      DO NOT CREATE ANOTHER COMMAND IF ONE EXISTS
      ------------------------------------------------
      */

      if (
        mt5Command.action === "NONE"
      ) {
        mt5Command = {
          id:
            "AMU-" +
            Date.now(),

          action:
            signal,

          mode:
            "DEMO",

          symbol:
            engine.symbol ||
            candle.symbol,

          volume:
            0.01,

          sl:
            Number(
              stopLoss.toFixed(8)
            ),

          tp:
            Number(
              takeProfit.toFixed(8)
            ),

          reason:
            "AI_MONSTER_U_SIGNAL",

          createdAt:
            new Date().toISOString()
        };

        console.log(
          "MT5 DEMO COMMAND CREATED:",
          JSON.stringify(mt5Command)
        );
      }
    }

  } catch (error) {
    console.error(
      "Trading engine error:",
      error.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| START MARKET
|--------------------------------------------------------------------------
*/

market.connect(
  "BTCUSDT",
  "1m"
);

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI MONSTER U",

    mode: "demo",

    tradingEngine: true,

    mt5Bridge:
      mt5Bridge.connected,

    marketData:
      market.getStatus(),

    time:
      new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| MARKET STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/market/status", (req, res) => {
  res.json({
    ok: true,
    ...market.getStatus()
  });
});

/*
|--------------------------------------------------------------------------
| MARKET CONNECT
|--------------------------------------------------------------------------
*/

app.post("/api/market/connect", (req, res) => {
  try {
    const symbol =
      req.body.symbol || "BTCUSDT";

    const timeframe =
      req.body.timeframe || "1m";

    market.connect(
      symbol,
      timeframe
    );

    engine.setSymbol(
      symbol
    );

    engine.setTimeframe(
      timeframe
    );

    res.json({
      ok: true,

      message:
        "Market data connection started",

      symbol:
        symbol.toUpperCase(),

      timeframe
    });

  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| TRADING STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/trading/status", (req, res) => {
  res.json({
    ok: true,
    ...engine.getStatus()
  });
});

/*
|--------------------------------------------------------------------------
| START DEMO BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/start", (req, res) => {
  try {
    const result =
      engine.start();

    res.json(result);

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| STOP BOT
|--------------------------------------------------------------------------
*/

app.post("/api/trading/stop", (req, res) => {
  try {
    const result =
      engine.stop();

    /*
    Cancel any waiting MT5 command.
    */

    mt5Command = {
      id: null,
      action: "NONE",
      mode: "DEMO",
      symbol: null,
      volume: 0,
      sl: 0,
      tp: 0,
      reason: "BOT_STOPPED",
      createdAt: null
    };

    res.json(result);

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
|--------------------------------------------------------------------------
| TIMEFRAME
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/timeframe",
  (req, res) => {
    try {
      const timeframe =
        req.body.timeframe;

      if (!timeframe) {
        return res.status(400).json({
          ok: false,
          error:
            "Timeframe is required"
        });
      }

      engine.setTimeframe(
        timeframe
      );

      market.connect(
        engine.symbol ||
        "BTCUSDT",
        timeframe
      );

      res.json({
        ok: true,

        timeframe:
          engine.timeframe,

        message:
          "Timeframe changed to " +
          timeframe
      });

    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ANALYZE
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/analyze",
  (req, res) => {
    try {
      const result =
        engine.analyzeMarket(
          req.body
        );

      res.json({
        ok: true,
        analysis: result
      });

    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TRADE HISTORY
|--------------------------------------------------------------------------
*/

app.get(
  "/api/trading/trades",
  (req, res) => {
    res.json({
      ok: true,
      trades:
        engine.getTrades()
    });
  }
);

/*
|--------------------------------------------------------------------------
| MT5 HEARTBEAT
|--------------------------------------------------------------------------
*/

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

      mt5Bridge = {
        connected: true,

        lastHeartbeat:
          new Date().toISOString(),

        mode:
          mode
            ? String(mode)
            : "UNKNOWN",

        account:
          String(account),

        broker:
          String(broker),

        server:
          String(server),

        currency:
          currency
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
            : null,

        timeframe:
          timeframe
            ? String(timeframe)
            : null,

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
          mt5Bridge.server
      });

    } catch (error) {
      console.error(
        "MT5 heartbeat error:",
        error.message
      );

      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MT5 STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/status",
  (req, res) => {

    const last =
      mt5Bridge.lastHeartbeat
        ? new Date(
            mt5Bridge.lastHeartbeat
          ).getTime()
        : 0;

    const heartbeatAgeMs =
      last
        ? Date.now() - last
        : null;
    const connected =
      heartbeatAgeMs !== null &&
      heartbeatAgeMs < 30000;

    mt5Bridge.connected =
      connected;

    res.json({
      ok: true,

      connected,

      mode:
        mt5Bridge.mode,

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

      heartbeatAgeMs,

      updatedAt:
        mt5Bridge.updatedAt
    });
  }
);

/*
|--------------------------------------------------------------------------
| MT5 CONNECTION
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/connection",
  (req, res) => {

    const last =
      mt5Bridge.lastHeartbeat
        ? new Date(
            mt5Bridge.lastHeartbeat
          ).getTime()
        : 0;

    const age =
      last
        ? Date.now() - last
        : null;

    const connected =
      age !== null &&
      age < 30000;

    res.json({
      ok: true,

      status:
        connected
          ? "CONNECTED"
          : "DISCONNECTED",

      connected,

      mode:
        mt5Bridge.mode,

      server:
        mt5Bridge.server,

      message:
        connected
          ? "MT5 bridge is connected"
          : "MT5 bridge is offline",

      lastHeartbeat:
        mt5Bridge.lastHeartbeat,

      heartbeatAgeMs:
        age
    });
  }
);

/*
|--------------------------------------------------------------------------
| MT5 GET COMMAND
|--------------------------------------------------------------------------
|
| EA calls this endpoint.
|
| Only DEMO commands are issued by this build.
|--------------------------------------------------------------------------
*/

app.get(
  "/api/mt5/command",
  (req, res) => {

    const last =
      mt5Bridge.lastHeartbeat
        ? new Date(
            mt5Bridge.lastHeartbeat
          ).getTime()
        : 0;

    const connected =
      last > 0 &&
      Date.now() - last < 30000;

    if (!connected) {
      return res.json({
        ok: true,

        command: {
          action: "NONE"
        },

        reason:
          "MT5 bridge offline"
      });
    }

    /*
    Never send a command to a real account
    from this Demo execution endpoint.
    */

    if (
      mt5Bridge.mode !== "DEMO"
    ) {
      return res.json({
        ok: true,

        command: {
          action: "NONE"
        },

        reason:
          "Live execution is disabled"
      });
    }

    res.json({
      ok: true,

      command:
        mt5Command
    });
  }
);

/*
|--------------------------------------------------------------------------
| MT5 COMMAND ACKNOWLEDGEMENT
|--------------------------------------------------------------------------
*/

app.post(
  "/api/mt5/command/ack",
  (req, res) => {

    const {
      id,
      status,
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
          "Command acknowledgement is incomplete"
      });
    }

    mt5Execution = {
      id:
        String(id),

      status:
        String(status),

      action:
        mt5Command.action,

      ticket:
        ticket
          ? String(ticket)
          : null,

      symbol:
        symbol
          ? String(symbol)
          : null,

      volume:
        Number(volume) || 0,

      price:
        Number(price) || 0,

      profit:
        Number(profit) || 0,

      message:
        message
          ? String(message)
          : null,

      executedAt:
        new Date().toISOString()
    };

    /*
    Clear the command after acknowledgement.
    */

    if (
      mt5Command.id ===
      String(id)
    ) {
      mt5Command = {
        id: null,
        action: "NONE",
        mode: "DEMO",
        symbol: null,
        volume: 0,
        sl: 0,
        tp: 0,
        reason: null,
        createdAt: null
      };
    }

    res.json({
      ok: true,
      received: true,
      execution:
        mt5Execution
    });
  }
);

/*
|--------------------------------------------------------------------------
| LAST MT5 EXECUTION
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| API 404
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================"
    );

    console.log(
      "AI MONSTER U"
    );

    console.log(
      "Website + Trading Engine"
    );

    console.log(
      "Market Data"
    );

    console.log(
      "MT5 Bridge"
    );

    console.log(
      "DEMO EXECUTION CHANNEL"
    );

    console.log(
      "LIVE EXECUTION: DISABLED"
    );

    console.log(
      "Server running on port " +
      PORT
    );

    console.log(
      "================================"
    );
  }
);
