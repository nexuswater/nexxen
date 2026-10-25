import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { verifyMessage,getAddress } from 'ethers';
import { AppError,SERVICES } from './store.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact=(body,keys)=>{if(!body||Object.keys(body).sort().join(',')!==keys.sort().join(','))throw new AppError('Unexpected approval fields.');};
export const APPROVAL_SCOPE='NEXXEN LOCAL FIXTURE POLICY APPROVAL v1';
const AGENT='0xe3D841aE3Acc8Dc79577092C141205f3d0Bf5183';
// Authority is trusted server configuration only, never a request field or recovered-address default.
// Production server deliberately supplies none until the business approver is independently confirmed.
export class Approvals {
 constructor(store,{authority=null,maximumMinor=2,ttlSeconds=300}={}){
  this.store=store;this.authority=authority?getAddress(authority):null;
  if(!Number.isSafeInteger(maximumMinor)||maximumMinor<1||maximumMinor>2000||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>600)throw new AppError('Invalid approval authority limits.');
  this.maximumMinor=maximumMinor;this.ttlSeconds=ttlSeconds;
  store.db.exec('CREATE TABLE IF NOT EXISTS approval_challenges (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,value TEXT NOT NULL,status TEXT NOT NULL,reservation_id TEXT); CREATE UNIQUE INDEX IF NOT EXISTS one_approved_exception ON approval_challenges(order_id) WHERE status=\'consumed\';');
  store.db.prepare('INSERT OR IGNORE INTO config VALUES (?,?)').run('approval-instance',randomUUID());
  this.instance=store.db.prepare('SELECT value FROM config WHERE id=?').get('approval-instance').value;
 }
 policyVersion(){return hash([this.store.policy(),this.maximumMinor,this.authority,this.instance]);}
 requestRevision(order){return hash([order.id,order.key,order.service,order.amount,order.status,order.created,order.reason]);}
 getOrder(id){const o=this.store.db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!o||o.status!=='blocked')throw new AppError('Only an existing blocked request can be reviewed.');return o;}
 eligible(o){if(!['Per-request mandate exceeded','Rehearsal per-request limit of 0.01 RLUSD exceeded; human review pending'].includes(o.reason))throw new AppError('This exception cannot override capacity or aggregate business limits.');if(o.amount>this.maximumMinor)throw new AppError('Request exceeds trusted business exception authority.');if(!SERVICES.some(s=>s.id===o.service&&s.id!=='card_cloud'))throw new AppError('Unsupported approval destination.');}
 prepare(body){exact(body,['orderId']);return this.store.tx(()=>{
  const o=this.getOrder(body.orderId);this.eligible(o);
  if(this.store.db.prepare("SELECT id FROM approval_challenges WHERE order_id=? AND status='consumed'").get(o.id))throw new AppError('Request already has a consumed approval.',409);
  const id=randomUUID(),expiresAt=Math.floor(this.store.now().getTime()/1000)+this.ttlSeconds,nonce=randomBytes(32).toString('hex');
  const c={id,instance:this.instance,business:'NEXXEN local fixture business',agent:AGENT,requestId:o.id,requestRevision:this.requestRevision(o),merchant:o.service,recipient:'local-fixture:'+o.service,amountMinor:o.amount,amountDecimal:(o.amount/100).toFixed(2),currency:'RLUSD fixture hundredths',chainId:1449000,policyVersion:this.policyVersion(),exception:'PER_REQUEST_LIMIT_ONLY',purpose:'Reserve one local fixture request; no payment, funds or on-chain authority',nonce,expiresAt,expiresAtUtc:new Date(expiresAt*1000).toISOString(),expectedAuthority:this.authority};
  const lines=[APPROVAL_SCOPE,...Object.entries(c).map(([k,v])=>`${k}: ${v??'UNCONFIGURED - DO NOT SIGN'}`)];
  const message=lines.join('\n');if(!/^[\x20-\x7e\n]+$/.test(message))throw new AppError('Approval message must be readable ASCII.');
  const result={...c,message,hardwareReady:false,signingAvailable:false};
  this.store.db.prepare('INSERT INTO approval_challenges VALUES (?,?,?,?,NULL)').run(id,o.id,JSON.stringify(result),'pending');this.store.audit('approval.prepared',{id,orderId:o.id});return result;
 });}
 deny(body){exact(body,['challengeId']);return this.store.tx(()=>{const r=this.store.db.prepare('SELECT * FROM approval_challenges WHERE id=?').get(body.challengeId);if(!r||r.status!=='pending')throw new AppError('Challenge is not pending.');this.store.db.prepare("UPDATE approval_challenges SET status='denied' WHERE id=?").run(r.id);this.store.audit('approval.denied',{id:r.id});return {status:'denied',orderStillBlocked:true};});}
 submit(body){exact(body,['challengeId','signature']);if(!this.authority)throw new AppError('Trusted business approver is not configured. Signing remains unavailable.',409);
  if(typeof body.signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(body.signature))throw new AppError('Invalid signature encoding.');
  return this.store.tx(()=>{
   const row=this.store.db.prepare('SELECT * FROM approval_challenges WHERE id=?').get(body.challengeId);if(!row||row.status!=='pending')throw new AppError('Approval is unknown, denied or already consumed.',409);
   const c=JSON.parse(row.value),o=this.getOrder(row.order_id);this.eligible(o);
   if(Math.floor(this.store.now().getTime()/1000)>=c.expiresAt)throw new AppError('Approval challenge expired.');
   if(c.expectedAuthority!==this.authority||c.instance!==this.instance||c.policyVersion!==this.policyVersion()||c.requestRevision!==this.requestRevision(o))throw new AppError('Request, business authority or policy changed; prepare a new challenge.');
   let signer;try{signer=getAddress(verifyMessage(c.message,body.signature));}catch{throw new AppError('Signature verification failed.');}if(signer!==this.authority)throw new AppError('Signature is not from the trusted business approver.');
   const usage=this.store.usage(),policy=this.store.policy();for(const k of ['daily','weekly','monthly','agentDaily'])if(usage[k]+o.amount>policy[k])throw new AppError(`${k} limit still blocks the request.`);
   if(o.amount>this.store.balance().available)throw new AppError('Funded fixture capacity is insufficient; signature creates no funds.');
   if(this.store.db.prepare("SELECT id FROM approval_challenges WHERE order_id=? AND status='consumed'").get(o.id))throw new AppError('Request already approved.',409);
   const reservationId=randomUUID(),created=this.store.now().toISOString();
   // Preserve the original blocked row. The separately linked reservation consumes capacity once.
   this.store.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?)').run(reservationId,'approval-'+c.id,o.service,o.amount,'reserved',created,'Signed application policy exception; fixture only');
   this.store.db.prepare("UPDATE approval_challenges SET status='consumed',reservation_id=? WHERE id=? AND status='pending'").run(reservationId,c.id);
   this.store.audit('approval.consumed',{id:c.id,originalOrderId:o.id,reservationId,signer});
   return {status:'consumed',reservationId,originalOrderId:o.id,originalStillBlocked:true,mode:'simulation',paymentSubmitted:false,hardwareProven:false};
  });
 }
 list(){return this.store.db.prepare('SELECT * FROM approval_challenges ORDER BY rowid DESC LIMIT 50').all().map(r=>({...JSON.parse(r.value),status:r.status==='pending'&&JSON.parse(r.value).expiresAt<=Math.floor(this.store.now().getTime()/1000)?'expired':r.status,reservationId:r.reservation_id}));}
 capabilities(){return {configuredAuthority:this.authority,maximumMinor:this.maximumMinor,ttlSeconds:this.ttlSeconds,hardwareReady:false,signingAvailable:false,reason:'Business approver, Flex firmware and Ethereum app readiness are not confirmed. No hardware transport is activated.'};}
}
