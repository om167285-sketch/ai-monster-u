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
    return Boolean(
      this.apiKey &&
      this.apiSecret
    );
  }

  async request(
    endpoint,
    params = {}
  ) {
    if (!this.isConfigured()) {
      throw new Error(
        "Binance API credentials are not configured"
      );
    }

    const timestamp = Date.now();

    const query = new URLSearchParams({
      ...params,
      timestamp: String(timestamp),
      recvWindow: "10000"
    }).toString();

    const signature =
      crypto
        .createHmac(
          "sha256",
          this.apiSecret
        )
        .update(query)
        .digest("hex");

    const url =
      ${BINANCE_BASE_URL}${endpoint} +
      ?${query}&signature=${signature};

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
        Binance API error ${response.status}
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
        item =>
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
      total: free + locked
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
        balance: balance.total,
        free: balance.free,
        locked: balance.locked,
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
