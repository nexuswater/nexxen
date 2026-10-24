// Types for the official CommonJS helper. ethers objects are typed loosely:
// from a .cts file `ethers` resolves to its CommonJS build, whose classes clash
// with the ESM ones the app passes in.
type Signer = { getAddress(): Promise<string>; signMessage(message: string): Promise<string> };
type Provider = object;
type Wallet = Signer & { provider: unknown };

type Channel = {
  channel_id: string;
  channel_status: string;
  cap_wei: string;
  payout: string;
  merchant_id: string;
  failure: string | null;
};

declare const sdk: {
  signIn(apiUrl: string, teamName: string, wallet: Signer): Promise<{ token: string; expiresInSeconds: number }>;
  listMerchants(apiUrl: string): Promise<{ team_name: string; merchant_id: string; payout: string }[]>;
  requestChannel(
    apiUrl: string,
    teamToken: string,
    agentWallet: Wallet,
    options: { capRlusd: string | number; merchantId?: string; rpcUrl?: string; timeoutMs?: number },
  ): Promise<Channel>;
  listChannels(apiUrl: string, teamToken: string): Promise<Channel[]>;
  getChannelState(
    provider: Provider,
    ledgerAddress: string,
    channelId: string,
  ): Promise<{ cap: bigint; redeemed: bigint; validBefore: bigint; status: number }>;
  signVoucher(wallet: Wallet, ledgerAddress: string, channelId: string, cumulativeAmount: bigint): Promise<string>;
  redeemVoucher(
    wallet: Wallet,
    ledgerAddress: string,
    rpcUrl: string,
    channelId: string,
    cumulativeAmount: bigint,
  ): Promise<{ claimId: string | null; txHash: string }>;
  closeChannel(
    apiUrl: string,
    teamToken: string,
    agentWallet: Wallet,
    channelId?: string,
  ): Promise<{ tx_hash: string; channel_id: string; final_cumulative_amount: string }>;
  settle(
    apiUrl: string,
    teamToken: string,
    channelId?: string,
  ): Promise<{
    settlement_tx: string;
    payout_tx: string;
    amount_rlusd: string;
    recipient: string;
    claim_id: string;
    channel_id: string;
    claims_settled: number;
    receipt_url: string | null;
    receipts: { claim_id: string; amount_rlusd: string; receipt_url: string | null }[];
  }>;
};

export = sdk;
