import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {PUBLIC_DEPLOYMENT_SNAPSHOT} from './ap4m-prepare.mjs';
const HASH=/^0x[0-9a-fA-F]{64}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const orderDigest=o=>createHash('sha256').update(JSON.stringify([o.channelId,o.claimId,o.settlementDigest??null,o.payout,o.expectedRlusdBaseUnits,o.amountUsdCents,o.userToken,o.reservationId])).digest('hex');
const topicAddress=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
/** Read-only canonical payout verifier. Claim resolver must independently bind payout to AP4M claim. */
export function createPayoutVerifier({rpc,resolveClaim,config}={}){
 return async function verify(order,evidence){
  if(typeof rpc!=='function'||typeof resolveClaim!=='function')throw new Error('Canonical RPC and independent AP4M claim/payout resolver required');
  if(config?.chainId!==1449000||!eq(config.token,PUBLIC_DEPLOYMENT_SNAPSHOT.rlusdToken)||!ADDRESS.test(config.payoutSource||'')||!Number.isSafeInteger(config.confirmations)||config.confirmations<1)throw new Error('Verified testnet payout configuration required');
  if(!/^[1-9]\d*$/.test(order.expectedRlusdBaseUnits||''))throw new Error('Positive approved RLUSD payout required');
  if(!ADDRESS.test(order.payout||'')||!HASH.test(order.channelId||'')||!HASH.test(order.claimId||''))throw new Error('Approved order claim identity missing');
  const chain=await rpc('eth_chainId',[]);if(BigInt(chain)!==1449000n)throw new Error('Wrong chain');
  const receipt=await rpc('eth_getTransactionReceipt',[evidence.txHash]);
  if(!receipt||receipt.status!=='0x1'||!eq(receipt.transactionHash,evidence.txHash))throw new Error('Successful payout receipt unavailable');
  const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);const head=await rpc('eth_blockNumber',[]);
  if(!block||!eq(block.hash,receipt.blockHash)||BigInt(head)-BigInt(receipt.blockNumber)+1n<BigInt(config.confirmations))throw new Error('Payout not canonical/final enough');
  const log=receipt.logs?.find(l=>Number(BigInt(l.logIndex))===evidence.logIndex);
  if(!log||log.removed||!eq(log.transactionHash,evidence.txHash)||!eq(log.blockHash,receipt.blockHash)||log.blockNumber!==receipt.blockNumber||!eq(log.address,config.token)||!eq(log.topics?.[0],TRANSFER)||!eq(log.topics?.[1],topicAddress(config.payoutSource))||!eq(log.topics?.[2],topicAddress(order.payout))||!HASH.test(log.data||'')||BigInt(log.data)!==BigInt(order.expectedRlusdBaseUnits))throw new Error('Pinned token payout source/destination/amount mismatch');
  const claim=await resolveClaim({order,evidence,receipt});
  if(!claim||!eq(claim.channelId,order.channelId)||!eq(claim.claimId,order.claimId)||!eq(claim.settlementTxHash,evidence.txHash)||claim.payoutLogIndex!==evidence.logIndex)throw new Error('Transfer not independently linked to expected AP4M settlement claim');
  return {chainId:1449000,txHash:evidence.txHash.toLowerCase(),logIndex:evidence.logIndex,blockHash:receipt.blockHash,verification:'canonical-ap4m-payout'};
 };
}
/** Durable exactly-once dispatch gate. Unknown POST outcomes reconcile; never blindly retry. */
export class SandboxFundingGate {
 constructor({path=':memory:',adapter,verifyPayout,lookupApprovedOrder,enabled=false}={}){
  this.adapter=adapter;this.verifyPayout=verifyPayout;this.lookupApprovedOrder=lookupApprovedOrder;this.enabled=enabled;this.db=new DatabaseSync(path);this.db.exec('PRAGMA busy_timeout=5000');
  this.db.exec(`CREATE TABLE IF NOT EXISTS sandbox_funding (id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, chain INTEGER NOT NULL, tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, operation_token TEXT UNIQUE NOT NULL, amount_cents INTEGER NOT NULL, user_token TEXT NOT NULL, order_digest TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(chain,tx_hash,log_index));`);
  if(!this.db.prepare('PRAGMA table_info(sandbox_funding)').all().some(c=>c.name==='balance_baseline'))this.db.exec('ALTER TABLE sandbox_funding ADD COLUMN balance_baseline TEXT');
 }
 close(){this.db.close();}
 guard(){if(!this.enabled||!this.adapter||typeof this.verifyPayout!=='function'||typeof this.lookupApprovedOrder!=='function')throw new Error('Sandbox receipt gate disabled or missing verified runtime dependencies');}
 enqueue({orderId,txHash,logIndex}){
  this.guard();if(typeof orderId!=='string'||!HASH.test(txHash||'')||!Number.isSafeInteger(logIndex)||logIndex<0)throw new Error('Invalid payout identity');
  const order=this.lookupApprovedOrder(orderId);
  if(!order||order.sandboxLoadApproved!==true||order.conversionMode!=='simulated'||!order.nonJitProductVerified||order.reservationActive!==true||typeof order.reservationId!=='string'||!order.reservationId||!Number.isSafeInteger(order.amountUsdCents)||order.amountUsdCents<=0||order.amountUsdCents>10000||typeof order.userToken!=='string'||!order.userToken)throw new Error('Bound sandbox load approval, USD fixture amount and non-JIT product verification required');
  this.db.exec('BEGIN IMMEDIATE');try{
   const old=this.db.prepare('SELECT * FROM sandbox_funding WHERE order_id=?').get(orderId);
   if(old){if(!eq(old.tx_hash,txHash)||old.log_index!==logIndex||old.amount_cents!==order.amountUsdCents||old.user_token!==order.userToken||old.order_digest!==orderDigest(order))throw new Error('Existing order is bound to a different operation');this.db.exec('COMMIT');return this.publicStatus(old);}
   const id=randomUUID();this.db.prepare('INSERT INTO sandbox_funding (id,order_id,chain,tx_hash,log_index,operation_token,amount_cents,user_token,order_digest,status) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,orderId,1449000,txHash.toLowerCase(),logIndex,randomUUID(),order.amountUsdCents,order.userToken,orderDigest(order),'awaiting_payout');this.db.exec('COMMIT');return this.status(id);
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 publicStatus(row){return {id:row.id,orderId:row.order_id,status:row.status,usdCents:row.amount_cents,conversion:'simulated — no RLUSD sent to Marqeta',canonicalSourceBindingVerified:false,cardApi:row.status==='sandbox_funded'?'sandbox GPA load verified':'not verified',authorization:'not attempted',clearing:'not verified',gpuDelivery:'not verified'};}
 row(id){const row=this.db.prepare('SELECT * FROM sandbox_funding WHERE id=?').get(id);if(!row)throw new Error('Unknown funding operation');return row;}
 status(id){return this.publicStatus(this.row(id));}
 async run(id){
  this.guard();let row=this.row(id);if(['dispatching','unknown'].includes(row.status))return this.reconcile(id);if(row.status==='sandbox_funded')return this.status(id);
  const order=this.lookupApprovedOrder(row.order_id);if(!order||order.sandboxLoadApproved!==true||order.amountUsdCents!==row.amount_cents||order.userToken!==row.user_token||!order.nonJitProductVerified||order.reservationActive!==true||row.order_digest!==orderDigest(order))throw new Error('Approval changed; operation remains blocked');
  const proof=await this.verifyPayout(order,{txHash:row.tx_hash,logIndex:row.log_index});
  if(proof?.verification!=='canonical-ap4m-payout'||proof.chainId!==1449000||!eq(proof.txHash,row.tx_hash)||proof.logIndex!==row.log_index)throw new Error('Independent canonical payout proof missing');
  const observed=await this.adapter.getUsdBalance(row.user_token);
  const baseline={verified:observed?.verified,currency:observed?.currency,userToken:observed?.userToken,availableCents:observed?.availableCents,ledgerCents:observed?.ledgerCents,pendingCreditsCents:observed?.pendingCreditsCents};
  if(baseline?.verified!==true||baseline.currency!=='USD'||baseline.userToken!==row.user_token||!['availableCents','ledgerCents','pendingCreditsCents'].every(k=>Number.isSafeInteger(baseline[k])))throw new Error('Verified explicit USD baseline required before dispatch');
  // CAS is the dispatch claim across concurrent processes; persisted BEFORE external POST.
  const claimed=this.db.prepare("UPDATE sandbox_funding SET status='dispatching', balance_baseline=? WHERE id=? AND status='awaiting_payout'").run(JSON.stringify(baseline),id);
  if(!claimed.changes)return this.status(id);
  try{const load=await this.adapter.loadSandboxUsd({operationToken:row.operation_token,userToken:row.user_token,amountUsd:(row.amount_cents/100).toFixed(2),baseline});this.acceptLoad(row,load);}
  catch {this.db.prepare("UPDATE sandbox_funding SET status='unknown' WHERE id=? AND status='dispatching'").run(id);}
  return this.status(id);
 }
 acceptLoad(row,load){
  if(!load||load.token!==row.operation_token||load.userToken!==row.user_token||load.currency!=='USD'||load.amountCents!==row.amount_cents||load.verified!==true||load.transactionVerified!==true||load.balanceVerified!==true||load.canonicalSourceBindingVerified!==false)throw new Error('Sandbox load response did not verify bound operation');
  this.db.prepare("UPDATE sandbox_funding SET status='sandbox_funded' WHERE id=? AND status IN ('dispatching','unknown')").run(row.id);
 }
 async reconcile(id){this.guard();const row=this.row(id);if(!['dispatching','unknown'].includes(row.status))return this.status(id);try{const load=await this.adapter.getLoad(row.operation_token,{userToken:row.user_token,amountUsd:(row.amount_cents/100).toFixed(2),baseline:row.balance_baseline?JSON.parse(row.balance_baseline):null});this.acceptLoad(row,load);}catch{/* 404/timeouts/mismatch remain unresolved. Never release or replay POST. */}return this.status(id);}
}
