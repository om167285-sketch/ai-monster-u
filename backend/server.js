import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import TradingEngine from "./tradingEngine.js";
import MarketData from "./marketData.js";
import BinanceService from "./binanceService.js";
import WalletService from "./walletService.js";

const app = express();

const PORT =
  process.env.PORT || 10000;

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

const supabaseUrl =
  process.env.SUPABASE_URL || "";

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabase = null;

if (
  supabaseUrl &&
  supabaseServiceRoleKey
) {
  supabase =
    createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );
} else {
  console.warn(
    "Supabase environment variables are missing."
  );
}

/*
|--------------------------------------------------------------------------
| SERVICES
|--------------------------------------------------------------------------
*/

const engine =
  new TradingEngine();

const market =
  new MarketData();

const binance =
  new BinanceService();

const wallet =
  new WalletService();

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(cors());

app.use(
  express.json({
    limit: "1mb"
  })
);

/*
|--------------------------------------------------------------------------
| FRONTEND
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.type("html");

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );
});

app.get(
  "/auth.html",
  (req, res) => {
    res.type("html");

    res.sendFile(
      path.join(
        __dirname,
        "auth.html"
      )
    );
  }
);

app.get(
  "/dashboard.html",
  (req, res) => {
    res.type("html");

    res.sendFile(
      path.join(
        __dirname,
        "dashboard.html"
      )
    );
  }
);

/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
*/

async function requireUser(
  req,
  res,
  next
) {
  try {
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error:
          "Supabase is not configured"
      });
    }

    const authorization =
      req.headers.authorization ||
      "";

    if (
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return res.status(401).json({
        ok: false,
        error:
          "Authentication required"
      });
    }

    const token =
      authorization.substring(7);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error:
          "Authentication token missing"
      });
    }

    const {
      data,
      error
    } =
      await supabase.auth.getUser(
        token
      );

    if (
      error ||
      !data ||
      !data.user
    ) {
      return res.status(401).json({
        ok: false,
        error:
          "Invalid or expired session"
      });
    }

    req.user =
      data.user;

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error:
        "Authentication failed"
    });
  }
}

/*
|--------------------------------------------------------------------------
| COMPLETED CANDLE → ENGINE
|--------------------------------------------------------------------------
*/

market.setCandleCloseHandler(
  (candle, candles) => {
    try {
      const result =
        engine.processCompletedCandle(
          candle,
          candles
        );

      console.log(
        "Candle processed:",
        JSON.stringify(result)
      );
    } catch (error) {
      console.error(
        "Trading engine error:",
        error.message
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| START MARKET DATA
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

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "AI MONSTER U",
      mode: "demo",
      tradingEngine: true,
      supabase:
        Boolean(supabase),
      marketData:
        market.getStatus(),
      time:
        new Date().toISOString()
    });
  }
);

/*
|--------------------------------------------------------------------------
| BINANCE STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/binance/status",
  async (req, res) => {
    try {
      const status =
        await binance.getStatus();

      res.json({
        ok: true,
        ...status
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        connected: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| BINANCE BALANCE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/binance/balance",
  async (req, res) => {
    try {
      const balance =
        await binance.getUsdtBalance();

      res.json({
        ok: true,
        ...balance
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| WALLET
|--------------------------------------------------------------------------
*/

app.get(
  "/api/wallet",
  requireUser,
  async (req, res) => {
    try {
      const data =
        await wallet.getWallet(
          req.user.id
        );

      res.json({
        ok: true,
        wallet: data
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| WALLET TRANSACTIONS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/wallet/transactions",
  requireUser,
  async (req, res) => {
    try {
      const data =
        await wallet.getTransactions(
          req.user.id
        );

      res.json({
        ok: true,
        transactions:
          data
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DEPOSIT REQUEST
|--------------------------------------------------------------------------
*/

app.post(
  "/api/wallet/deposit",
  requireUser,
  async (req, res) => {
    try {
      const result =
        await wallet.createDepositRequest({
          userId:
            req.user.id,
          amount:
            req.body.amount,
          network:
            req.body.network,
          txHash:
            req.body.txHash
        });

      res.json({
        ok: true,
        deposit:
          result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| WITHDRAWAL REQUEST
|--------------------------------------------------------------------------
*/

app.post(
  "/api/wallet/withdraw",
  requireUser,
  async (req, res) => {
    try {
      const result =
        await wallet.createWithdrawalRequest({
          userId:
            req.user.id,
          amount:
            req.body.amount,
          network:
            req.body.network,
          walletAddress:
            req.body.walletAddress
        });

      res.json({
        ok: true,
        withdrawal:
          result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MARKET STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/market/status",
  (req, res) => {
    res.json({
      ok: true,
      ...market.getStatus()
    });
  }
);

/*
|--------------------------------------------------------------------------
| MARKET CONNECT
|--------------------------------------------------------------------------
*/

app.post(
  "/api/market/connect",
  (req, res) => {
    try {
      const symbol =
        req.body.symbol ||
        "BTCUSDT";

      const timeframe =
        req.body.timeframe ||
        "1m";

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
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TRADING STATUS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/trading/status",
  (req, res) => {
    res.json({
      ok: true,
      ...engine.getStatus()
    });
  }
);

/*
|--------------------------------------------------------------------------
| START DEMO BOT
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/start",
  (req, res) => {
    try {
      const result =
        engine.start();

      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| STOP DEMO BOT
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/stop",
  (req, res) => {
    try {
      const result =
        engine.stop();

      res.json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CHANGE TIMEFRAME
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
        engine.symbol,
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
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OPEN DEMO POSITION
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/open",
  (req, res) => {
    try {
      const signal =
        req.body.signal;

      const price =
        Number(
          req.body.price
        );

      const candleTime =
        req.body.candleTime ||
        Date.now();

      const result =
        engine.openDemoPosition(
          signal,
          price,
          candleTime
        );
      if (!result.ok) {
        return res
          .status(400)
          .json(result);
      }

      res.json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CLOSE DEMO POSITION
|--------------------------------------------------------------------------
*/

app.post(
  "/api/trading/close",
  (req, res) => {
    try {
      const price =
        Number(
          req.body.price
        );

      const reason =
        req.body.reason ||
        "CANDLE_CLOSE";

      const result =
        engine.closeAtCandleBoundary(
          price,
          reason
        );

      res.json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ANALYZE MARKET
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
        analysis:
          result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          error.message
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
      "Wallet System"
    );

    console.log(
      "Market Data"
    );

    console.log(
      "Mode: DEMO"
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
