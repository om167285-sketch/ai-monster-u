import WebSocket from "ws";

class MarketData {
  constructor() {
    this.socket = null;
    this.symbol = "BTCUSDT";
    this.timeframe = "1m";
    this.connected = false;
    this.lastCandle = null;
  }

  connect(symbol = "BTCUSDT", timeframe = "1m") {
    this.symbol = symbol.toUpperCase();
    this.timeframe = timeframe;

    const stream =
      this.symbol.toLowerCase() +
      "@kline_" +
      this.timeframe;

    const url =
      "wss://stream.binance.com:9443/ws/" +
      stream;

    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      this.connected = true;

      console.log(
        "AI MONSTER U market data connected:",
        this.symbol,
        this.timeframe
      );
    });

    this.socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw);

        if (!message.k) {
          return;
        }

        const k = message.k;

        this.lastCandle = {
          symbol: k.s,
          timeframe: k.i,
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v),
          startTime: k.t,
          endTime: k.T,
          complete: k.x
        };

        if (k.x) {
          console.log(
            "CANDLE CLOSED:",
            k.s,
            k.i,
            k.c
          );
        }
      } catch (error) {
        console.error(
          "Market data message error:",
          error.message
        );
      }
    });

    this.socket.on("close", () => {
      this.connected = false;

      console.log(
        "Market data disconnected"
      );
    });

    this.socket.on("error", (error) => {
      this.connected = false;

      console.error(
        "Market data error:",
        error.message
      );
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.connected = false;
  }

  getStatus() {
    return {
      connected: this.connected,
      symbol: this.symbol,
      timeframe: this.timeframe,
      lastCandle: this.lastCandle
    };
  }
}

export default MarketData;
