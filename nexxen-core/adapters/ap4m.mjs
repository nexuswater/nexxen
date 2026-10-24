/** AP4M testnet read adapter. No wallet, signing, broadcast or funding capability. */
export const AP4M_CHAIN_ID = 1449000;
export const AP4M_SERVICE = 'https://hackathon.ap4m.build';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const requiredAddresses = ['participantRegistry', 'paymentLedger', 'pooledEscrowVault', 'rlusdToken', 'agent', 'merchantPayout'];
const nonzero = value => ADDRESS.test(value ?? '') && !/^0x0{40}$/i.test(value);

export function activationIssues(config = {}) {
  const issues = [];
  if (config.enabled !== true) issues.push('AP4M not enabled');
  if (config.environment !== 'testnet' || config.chainId !== AP4M_CHAIN_ID) issues.push('Only XRPL EVM Testnet chain 1449000 is supported');
  if (config.apiUrl !== AP4M_SERVICE) issues.push('Official AP4M service URL must be pinned');
  if (config.verifiedTeamSetup !== true) issues.push('Portal team setup has not been verified');
  if (!config.teamName?.trim()) issues.push('Verified team name missing');
  for (const field of requiredAddresses) if (!nonzero(config[field])) issues.push(`Verified ${field} address missing`);
  for (const field of ['merchantId', 'channelId']) if (!BYTES32.test(config[field] ?? '') || /^0x0{64}$/i.test(config[field] ?? '')) issues.push(`Verified ${field} missing`);
  if (config.tokenDecimals !== 18) issues.push('Sponsor test RLUSD decimals must be verified as 18');
  if (!Number.isSafeInteger(config.confirmations) || config.confirmations < 1) issues.push('Confirmation policy missing');
  if (config.agent?.toLowerCase() === config.merchantPayout?.toLowerCase()) issues.push('Agent and merchant payout must be separate');
  return issues;
}

export class AP4MReadAdapter {
  #config; #fetch; #sessionToken;
  constructor(config, { fetchImpl = fetch, sessionToken } = {}) {
    this.#config = Object.freeze({ ...config });
    this.#fetch = fetchImpl;
    this.#sessionToken = sessionToken;
  }
  status() {
    const blockers = activationIssues(this.#config);
    return { status: blockers.length ? 'unavailable' : 'configured-unverified', mode: 'read-only', blockers,
      transactions: 'unavailable', reason: 'Live signing, treasury transport, redemption and payout verification are not implemented or tested.' };
  }
  #requireConfigured() {
    const issues = activationIssues(this.#config);
    if (issues.length) throw new Error(`AP4M unavailable: ${issues.join('; ')}`);
  }
  async #get(path, authenticated = false) {
    this.#requireConfigured();
    if (authenticated && !this.#sessionToken) throw new Error('AP4M participant session unavailable');
    const response = await this.#fetch(`${AP4M_SERVICE}${path}`, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000),
      headers: authenticated ? { Authorization: `Bearer ${this.#sessionToken}` } : {},
    });
    // Do not include third-party response bodies: they may contain sensitive information.
    if (!response.ok) throw new Error(`AP4M read failed: HTTP ${response.status}`);
    return response.json();
  }
  async verifyPublicConfiguration() {
    const value = await this.#get('/public/config');
    if (value.network?.chainId !== AP4M_CHAIN_ID) throw new Error('AP4M network mismatch');
    for (const field of requiredAddresses.slice(0, 4)) {
      if (value.contracts?.[field]?.toLowerCase() !== this.#config[field].toLowerCase()) throw new Error(`AP4M ${field} mismatch`);
    }
    return { chainId: AP4M_CHAIN_ID, contractsMatch: true, livePaymentsVerified: false };
  }
  async readConfiguredChannel() {
    await this.verifyPublicConfiguration();
    const response = await this.#get('/public/participant/channels', true);
    if (!Array.isArray(response.channels)) throw new Error('Invalid AP4M channel response');
    const channel = response.channels.find(c => c.channel_id?.toLowerCase() === this.#config.channelId.toLowerCase());
    if (!channel || channel.merchant_id?.toLowerCase() !== this.#config.merchantId.toLowerCase()
      || channel.payout?.toLowerCase() !== this.#config.merchantPayout.toLowerCase()
      || !/^[0-9]+$/.test(channel.cap_wei)) throw new Error('AP4M channel identity/cap mismatch');
    return { channelId: channel.channel_id, state: channel.channel_status, capBaseUnits: channel.cap_wei,
      evidence: 'service-reported; independent on-chain verification still required' };
  }
  async requestChannel() { throw new Error('Unavailable: supported treasury approval and validated requestChannel transaction preparation required'); }
  async signVoucher() { throw new Error('Unavailable: isolated operational signer and durable atomic policy reservation binding required'); }
  async redeemVoucher() { throw new Error('Unavailable: validated direct redemption and canonical receipt verifier required'); }
  async recordRedemption() { throw new Error('Unavailable: authenticated API reference request schema must be verified; never guess its body'); }
  async buyResource() { throw new Error('Unavailable: reviewed and pinned x402 SDK integration with reservation/recovery binding required'); }
}
