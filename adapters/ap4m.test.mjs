import test from 'node:test';
import assert from 'node:assert/strict';
import { AP4MReadAdapter, activationIssues, AP4M_CHAIN_ID, AP4M_SERVICE } from './ap4m.mjs';
// These addresses are deliberately synthetic test-only values, never runtime defaults.
const addr = n => `0x${String(n).repeat(40)}`;
const bytes = n => `0x${String(n).repeat(64)}`;
const config = { enabled: true, environment: 'testnet', chainId: AP4M_CHAIN_ID, apiUrl: AP4M_SERVICE, verifiedTeamSetup: true,
  teamName: 'unit-test-only', participantRegistry: addr(1), paymentLedger: addr(2), pooledEscrowVault: addr(3), rlusdToken: addr(4),
  agent: addr(5), merchantPayout: addr(6), merchantId: bytes(7), channelId: bytes(8), tokenDecimals: 18, confirmations: 3 };
const publicConfig = { network: { chainId: AP4M_CHAIN_ID }, contracts: Object.fromEntries(['participantRegistry','paymentLedger','pooledEscrowVault','rlusdToken'].map(k=>[k,config[k]])) };
const json = value => ({ ok: true, json: async () => value });
test('missing configuration is unavailable and performs no network request', async () => {
  const a = new AP4MReadAdapter({}, { fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal(a.status().status, 'unavailable'); await assert.rejects(a.verifyPublicConfiguration(), /AP4M unavailable/);
});
test('network, token decimals, zero addresses and shared payout fail closed', () => {
  for (const bad of [{chainId:1}, {environment:'mainnet'}, {tokenDecimals:6}, {rlusdToken:addr(0)}, {merchantPayout:config.agent}, {apiUrl:'https://example.com'}]) assert.ok(activationIssues({...config,...bad}).length);
});
test('configured status never claims payment verification', () => assert.equal(new AP4MReadAdapter(config).status().status,'configured-unverified'));
test('public contract pins and chain checked', async () => {
  assert.equal((await new AP4MReadAdapter(config,{fetchImpl:async()=>json(publicConfig)}).verifyPublicConfiguration()).livePaymentsVerified,false);
  await assert.rejects(new AP4MReadAdapter(config,{fetchImpl:async()=>json({...publicConfig,network:{chainId:1}})}).verifyPublicConfiguration(),/network mismatch/);
  await assert.rejects(new AP4MReadAdapter(config,{fetchImpl:async()=>json({...publicConfig,contracts:{}})}).verifyPublicConfiguration(),/mismatch/);
});
test('only configured channel returned, without session credential', async () => {
  const calls=[];
  const a=new AP4MReadAdapter(config,{sessionToken:'test-only-token',fetchImpl:async(url,options)=>{calls.push({url,options});return json(url.endsWith('/config')?publicConfig:{channels:[{channel_id:config.channelId,merchant_id:config.merchantId,payout:config.merchantPayout,cap_wei:'20000000000000000000',channel_status:'open'}]});}});
  const result=await a.readConfiguredChannel();assert.equal(result.state,'open');assert.equal(calls[1].options.headers.Authorization,'Bearer test-only-token');assert.equal(calls[1].options.redirect,'error');assert.ok(!JSON.stringify(result).includes('test-only-token'));
});
test('missing session and HTTP failure do not leak bodies', async()=>{
  await assert.rejects(new AP4MReadAdapter(config,{fetchImpl:async()=>json(publicConfig)}).readConfiguredChannel(),/session unavailable/);
  await assert.rejects(new AP4MReadAdapter(config,{fetchImpl:async()=>({ok:false,status:401,json:async()=>({secret:'do-not-log'})})}).verifyPublicConfiguration(),/^Error: AP4M read failed: HTTP 401$/);
});
test('all payment operations unavailable even with complete configuration',async()=>{
  const a=new AP4MReadAdapter(config);for(const op of ['requestChannel','signVoucher','redeemVoucher','recordRedemption','buyResource'])await assert.rejects(a[op](),/Unavailable/);
});
