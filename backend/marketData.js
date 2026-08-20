import WebSocket from "ws";

class MarketData {
  constructor() {
    this.socket = null;

    this.symbol = "BTCUSDT";
    this.timeframe = "1m";

    this.connected = false;
    this.lastCandle = null;

    this.candles = [];

    this.maxCandles = 300;

    this.onCandleClose = null;
  }

  connect(
    symbol = "BTCUSDT",
    timeframe = "1m"
  ) {
    this.disconnect();

    this.symbol =
      String(symbol).toUpperCase();

    this.timeframe = timeframe;

    const stream =
      this.symbol.toLowerCase() +
      "@kline_" +
      this.timeframe;

    const url =
      "wss://data-stream.binance.vision/ws/" +
      stream;

    console.log(
      "Connecting market data:",
      this.symbol,
      this.timeframe
    );

    this.socket =
      new WebSocket(url);

    this.socket.on("open", () => {
      this.connected = true;

      console.log(
        "Market data connected:",
        this.symbol,
        this.timeframe
      );
    });

    this.socket.on(
      "message",
      raw => {
        try {
          const message =
            JSON.parse(raw);

          if (!message.k) {
            return;
          }

          const k =
            message.k;

          const candle = {
            symbol: k.s,
            timeframe: k.i,

            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),

            volume: Number(k.v),

            startTime: k.t,
            endTime: k.T,

            complete: Boolean(k.x)
          };

          this.lastCandle =
            candle;

          /*
           * Keep the current candle
           * updated in the history.
           */
          const existingIndex =
            this.candles.findIndex(
              item =>
                item.startTime ===
                candle.startTime
            );

          if (
            existingIndex >= 0
          ) {
            this.candles[
              existingIndex
            ] = candle;
          } else {
            this.candles.push(
              candle
            );
          }

          /*
           * Keep only the most
           * recent candles.
           */
          if (
            this.candles.length >
            this.maxCandles
          ) {
            this.candles =
              this.candles.slice(
                -this.maxCandles
              );
          }

          /*
           * Only notify the trading
           * engine when a candle
           * actually closes.
           */
          if (
            candle.complete &&
            typeof this.onCandleClose ===
              "function"
          ) {
            this.onCandleClose(
              candle,
              [...this.candles]
            );
          }
        } catch (error) {
          console.error(
            "Market data message error:",
            error.message
          );
        }
      }
    );

    this.socket.on(
      "close",
      () => {
        this.connected =
          false;

        console.log(
          "Market data disconnected"
        );
      }
    );

    this.socket.on(
      "error",
      error => {
        this.connected =
          false;

        console.error(
          "Market data error:",
          error.message
        );
      }
    );
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
    }

    this.socket = null;
    this.connected = false;
  }

  setCandleCloseHandler(
    callback
  ) {
    this.onCandleClose =
      callback;
  }

  getStatus() {
    return {
      connected:
        this.connected,

      symbol:
        this.symbol,

      timeframe:
        this.timeframe,

      candleCount:
        this.candles.length,

      lastCandle:
        this.lastCandle
    };
  }

  getCandles() {
    return [
      ...this.candles
    ];
  }
}

export default MarketData;
