import crypto from "crypto";

const BINANCE_BASE_URL =
  process.env.BINANCE_BASE_URL ||
  "https://api.binance.com";

class BinanceService {
  constructor() {
    this.apiKey =
      process.env.BINANCE_API_KEY || "";

    this.apiSecret =
      process.env.BINANCE_API_SECRET || "";
  }

  isConfigured() {
    return (
      this.apiKey.length > 0 &&
      this.apiSecret.length > 0
    );
  }

  async request(endpoint, params = {}) {
    if (!this.isConfigured()) {
      throw new Error(
        "Binance API credentials are not configured"
      );
    }

    const timestamp = Date.now();

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      searchParams.append(
        key,
        String(value)
      );
    }

    searchParams.append(
      "timestamp",
      String(timestamp)
    );

    searchParams.append(
      "recvWindow",
      "10000"
    );

    const query =
      searchParams.toString();

    const signature =
      crypto
        .createHmac(
          "sha256",
          this.apiSecret
        )
        .update(query)
        .digest("hex");

    const url =
      BINANCE_BASE_URL +
      endpoint +
      "?" +
      query +
      "&signature=" +
      signature;

    const response =
      await fetch(url, {
        method: "GET",
        headers: {
          "X-MBX-APIKEY":
            this.apiKey
        }
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.msg ||
        "Binance API request failed"
      );
    }

    return data;
  }

  async getAccount() {
    return this.request(
      "/api/v3/account"
    );
  }

  async getUsdtBalance() {
    const account =
      await this.getAccount();

    const asset =
      account.balances?.find(
        (item) =>
          item.asset === "USDT"
      );

    if (!asset) {
      return {
        asset: "USDT",
        free: 0,
        locked: 0,
        total: 0
      };
    }

    const free =
      Number(asset.free || 0);

    const locked =
      Number(asset.locked || 0);

    return {
      asset: "USDT",
      free,
      locked,
      total:
        free + locked
    };
  }

  async getStatus() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        message:
          "Binance API credentials are missing"
      };
    }

    try {
      const balance =
        await this.getUsdtBalance();

      return {
        configured: true,
        connected: true,
        asset: "USDT",
        balance:
          balance.total,
        free:
          balance.free,
        locked:
          balance.locked,
        message:
          "Binance account connected"
      };
    } catch (error) {
      return {
        configured: true,
        connected: false,
        message:
          error.message
      };
    }
  }
}

export default BinanceService;
