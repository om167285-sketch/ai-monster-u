import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || "";

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "WARNING: Supabase wallet service is not configured."
  );
}

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey
  );

class WalletService {
  async getWallet(userId) {
    if (!userId) {
      throw new Error(
        "User ID is required"
      );
    }

    const { data, error } =
      await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async getTransactions(userId) {
    if (!userId) {
      throw new Error(
        "User ID is required"
      );
    }

    const { data, error } =
      await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", userId)
        .order(
          "created_at",
          {
            ascending: false
          }
        );

    if (error) {
      throw error;
    }

    return data || [];
  }

  async createDepositRequest({
    userId,
    amount,
    network,
    txHash
  }) {
    if (!userId) {
      throw new Error(
        "User ID is required"
      );
    }

    const value =
      Number(amount);

    if (
      !Number.isFinite(value) ||
      value < 50
    ) {
      throw new Error(
        "Minimum deposit is $50"
      );
    }

    const { data, error } =
      await supabase
        .from(
          "wallet_transactions"
        )
        .insert({
          user_id: userId,
          type: "DEPOSIT",
          asset: "USDT",
          amount: value,
          network:
            network || null,
          tx_hash:
            txHash || null,
          status: "PENDING"
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async createWithdrawalRequest({
    userId,
    amount,
    network,
    walletAddress
  }) {
    if (!userId) {
      throw new Error(
        "User ID is required"
      );
    }

    const value =
      Number(amount);

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        "Invalid withdrawal amount"
      );
    }

    if (!walletAddress) {
      throw new Error(
        "Wallet address is required"
      );
    }

    if (!network) {
      throw new Error(
        "Network is required"
      );
    }

    const wallet =
      await this.getWallet(
        userId
      );

    const available =
      Number(
        wallet.available_balance || 0
      );

    if (value > available) {
      throw new Error(
        "Insufficient available balance"
      );
    }

    const { data, error } =
      await supabase.rpc(
        "request_withdrawal",
        {
          p_user_id:
            userId,
          p_amount:
            value,
          p_network:
            network,
          p_wallet_address:
            walletAddress
        }
      );

    if (error) {
      throw error;
    }

    return data;
  }
}

export default WalletService;
