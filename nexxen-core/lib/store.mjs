import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
export const SERVICES = [
 {id:'inference',name:'Inference burst',description:'Run a focused AI workload · 1,000 inference tokens',price:200},
 {id:'compute',name:'Compute session',description:'Provision an isolated GPU compute session · 30 minutes',price:800},
 {id:'card_cloud',name:'NVIDIA GPU rental simulation',description:'Fictional GPU compute quote · no vendor integration',price:400,rail:'card_simulation',merchant:'Fictional GPU Cloud',purpose:'NVIDIA GPU compute rental — simulated quote'},
 {id:'funding_standin',name:'Card-funding provider stand-in',description:'AP4M fixture endpoint models an unverified card-funding leg only',price:450,internal:true},
 {id:'funding_large',name:'Large card-funding stand-in',description:'Large-spend review fixture',price:2550,internal:true},
 {id:'training',name:'Training sprint',description:'Dedicated model-training capacity · 2 hours',price:2500},
];
// Startup PRAGMAs can return SQLITE_BUSY even before normal statement waiting applies.
// Retry only idempotent schema initialization; never replay a payment transaction blindly.
function initializeWithRetry(initialize){
 const deadline=Date.now()+10000;const wait=new Int32Array(new SharedArrayBuffer(4));
 while(true){try{return initialize();}catch(error){
  if(![5,6].includes(error.errcode & 255)||Date.now()>=deadline)throw error;
  Atomics.wait(wait,0,0,25);
 }}
}
const DEFAULT_POLICY={daily:1000,weekly:3000,monthly:8000,perRequest:900,agentDaily:1000};
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export class Store {
 constructor(path=':memory:',now=()=>new Date()) {
  this.now=now;this.db=new DatabaseSync(path);
  // Install waiting BEFORE the first journal/schema operation on every connection.
  this.db.exec('PRAGMA busy_timeout=5000');
  try { initializeWithRetry(()=>{
   const mode=this.db.prepare('PRAGMA journal_mode').get().journal_mode;
   if(mode!=='wal' && path!==':memory:')this.db.exec('PRAGMA journal_mode=WAL');
   this.db.exec(`
   CREATE TABLE IF NOT EXISTS config (id TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, service TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL, reason TEXT);
   CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, orderId TEXT UNIQUE NOT NULL, created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS cycles (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, scenario TEXT NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, created TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);`);
  this.db.prepare('INSERT OR IGNORE INTO config VALUES (?,?)').run('policy',JSON.stringify(DEFAULT_POLICY));
  }); } catch(error) { this.db.close(); throw error; }
 }
 close(){this.db.close();}
 tx(fn){if(this.transactionActive)return fn();this.db.exec('BEGIN IMMEDIATE');this.transactionActive=true;try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}finally{this.transactionActive=false;}}
 policy(){return JSON.parse(this.db.prepare('SELECT value FROM config WHERE id=?').get('policy').value);}
 boundaries(){const d=new Date(this.now());d.setUTCHours(0,0,0,0);const w=new Date(d);w.setUTCDate(w.getUTCDate()-((w.getUTCDay()+6)%7));const m=new Date(d);m.setUTCDate(1);return {daily:d.toISOString(),weekly:w.toISOString(),monthly:m.toISOString()};}
 usage(){const b=this.boundaries();const result={};for(const [period,start] of Object.entries(b)){result[period]=this.db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM orders WHERE status IN ('reserved','unknown','settled_fixture') AND service != 'card_cycle_charge' AND (created >= ? OR status IN ('reserved','unknown'))").get(start).n;}result.agentDaily=result.daily;return result;}
 balance(rail='ap4m'){const sum=(statuses)=>this.db.prepare(`SELECT COALESCE(SUM(amount),0) AS n FROM orders WHERE ${rail==='card'?"service IN ('card_cloud','card_cycle_charge')":"service NOT IN ('card_cloud','card_cycle_charge')"} AND status IN (${statuses.map(()=>'?').join(',')})`).get(...statuses).n;
 const issued=sum(['reserved','unknown','settled_fixture']);const settled=sum(['settled_fixture']);return {funded:2000,issued,redeemed:settled,settled,available:2000-issued};}
 audit(event,detail){this.db.prepare('INSERT INTO audit(created,event,detail) VALUES (?,?,?)').run(this.now().toISOString(),event,JSON.stringify(detail));}
 decorate(o){const service=SERVICES.find(s=>s.id===o.service);const card=service?.rail==='card_simulation';return {...o,rail:card?'card_simulation':'ap4m_fixture',merchant:service?.merchant,purpose:service?.purpose,serviceName:service?.name,mode:'simulation',currency:card?'USD (simulated quote)':'RLUSD',policyCost:o.amount,policyUnit:'fixture policy units',evidence:o.status==='settled_fixture'?(card?[{stage:'Requested merchant and purpose',status:`fixture — ${service.merchant}; ${service.purpose}`},{stage:'Shared atomic policy reservation',status:'implemented'},{stage:'Issuer authorization',status:'fixture — no issuer contacted or card issued'},{stage:'Merchant purchase',status:'fixture — no acceptance or purchase verified'},{stage:'Card-network settlement',status:'fixture — no funds moved; no RLUSD conversion'}]:[{stage:'HTTP 402 requirements',status:'fixture'},{stage:'Atomic policy reservation',status:'implemented'},{stage:'Agent voucher signature',status:'fixture — no signature created'},{stage:service?.internal?'Funding-provider stand-in receipt':'Resource delivery',status:service?.internal?'fixture — no real provider credited or USD funding verified':'fixture — no compute provisioned'},{stage:'Voucher redemption',status:'fixture — no transaction submitted'},{stage:'Payout settlement',status:'fixture — no token transfer'}]):[{stage:'Policy check',status:o.reason||o.status},{stage:'Treasury approval',status:'pending — Ledger adapter unavailable'}]};}
 reserve(body,{allowInternal=false}={}){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['serviceId','idempotencyKey'].includes(k)))throw new AppError('Only an approved service and idempotency key may be submitted.');
  const {serviceId,idempotencyKey}=body;
  if(typeof idempotencyKey!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey))throw new AppError('Provide a stable idempotency key (8–100 letters, numbers, _ or -).');
  const service=SERVICES.find(s=>s.id===serviceId);if(!service||service.internal&&!allowInternal)throw new AppError('Merchant resource is not approved.');
  return this.tx(()=>{
   const old=this.db.prepare('SELECT * FROM orders WHERE key=?').get(idempotencyKey);if(old){if(old.service!==serviceId)throw new AppError('Idempotency key already belongs to a different request.',409);return this.decorate(old);}
   const policy=this.policy(),usage=this.usage(),balance=this.balance(service.rail==='card_simulation'?'card':'ap4m');let reason=null;
   if(service.price>policy.perRequest)reason='Per-request mandate exceeded';
   for(const k of ['daily','weekly','monthly','agentDaily'])if(!reason&&usage[k]+service.price>policy[k])reason=`${k} mandate exceeded`;
   if(!reason&&service.price>balance.available)reason=service.rail==='card_simulation'?'Card fixture budget exceeded':'Funded channel capacity exceeded';
   const o={id:randomUUID(),key:idempotencyKey,service:serviceId,amount:service.price,status:reason?'blocked':'reserved',created:this.now().toISOString(),reason};
   this.db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?)').run(o.id,o.key,o.service,o.amount,o.status,o.created,o.reason);
   if(reason)this.db.prepare('INSERT INTO reviews VALUES (?,?,?)').run(randomUUID(),o.id,o.created);
   this.audit(reason?'policy.blocked':'reservation.created',{orderId:o.id,amount:o.amount,reason});return this.decorate(o);
  });
 }
 settleFixture(id){return this.tx(()=>{const o=this.db.prepare('SELECT * FROM orders WHERE id=?').get(id);if(!o)throw new AppError('Unknown order.',404);if(o.status==='reserved'){this.db.prepare("UPDATE orders SET status='settled_fixture' WHERE id=?").run(id);this.audit('fixture.settled',{orderId:id});o.status='settled_fixture';}return this.decorate(o);});}
 purchase(body){const order=this.reserve(body);return order.status==='reserved'?this.settleFixture(order.id):order;}
 updatePolicy(policy){const keys=Object.keys(DEFAULT_POLICY);if(!policy||Object.keys(policy).length!==keys.length||keys.some(k=>!Number.isSafeInteger(policy[k])||policy[k]<1||policy[k]>10000000))throw new AppError('Every mandate must be a positive integer number of hundredths, at most 100,000 fixture policy units.');return this.tx(()=>{this.db.prepare('UPDATE config SET value=? WHERE id=?').run(JSON.stringify(policy),'policy');this.audit('fixture.policy.updated',policy);return policy;});}
 cycles(){return this.db.prepare('SELECT value FROM cycles ORDER BY rowid DESC').all().map(r=>JSON.parse(r.value));}
 cycleAccounting(){const totals={rlusdFunding:0,feeRlusd:0,usdFunded:0,usdSpent:0,usdAvailable:0,serviceIncome:0,borrowedPrincipal:0};for(const c of this.cycles()){for(const k of ['rlusdFunding','feeRlusd','usdFunded','usdSpent'])totals[k]+=c[k];}totals.usdAvailable=totals.usdFunded-totals.usdSpent;return totals;}
 cardCycle(body){
  if(!body||Object.keys(body).some(k=>!['idempotencyKey','scenario'].includes(k)))throw new AppError('Only an approved cycle scenario and idempotency key may be supplied.');
  const {idempotencyKey,scenario='success'}=body;
  if(typeof idempotencyKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(idempotencyKey)||!['success','funding_failed','gpu_failed','high_spend'].includes(scenario))throw new AppError('Invalid cycle key or fixture scenario.');
  return this.tx(()=>{
   const prior=this.db.prepare('SELECT * FROM cycles WHERE key=?').get(idempotencyKey);if(prior){if(prior.scenario!==scenario)throw new AppError('Cycle key is already bound to another scenario.',409);return JSON.parse(prior.value);}
   const c={id:randomUUID(),created:this.now().toISOString(),scenario,mode:'simulation',status:'requested',merchant:'Fictional GPU Cloud',category:'approved-compute',fundingProvider:'AP4M test-merchant stand-in; not Marqeta or an endorsed integration',rate:'1.00 USD per RLUSD — FIXTURE ONLY; not an executable conversion',quotedUsd:scenario==='high_spend'?2500:400,quotedFeeRlusd:50,rlusdFunding:0,feeRlusd:0,usdFunded:0,usdSpent:0,serviceIncome:0,borrowedPrincipal:0,evidence:[]};
   // The funding obligation consumes the shared business budget exactly once.
   // Downstream charge consumes the funded USD subledger, not another RLUSD obligation.
   const order=this.reserve({serviceId:scenario==='high_spend'?'funding_large':'funding_standin',idempotencyKey:'cycle-'+idempotencyKey},{allowInternal:true});c.fundingOrderId=order.id;
   if(order.status==='blocked'){c.status='blocked';c.reason=order.reason;c.evidence=[{stage:'Policy and downstream merchant/category',status:'blocked before funding; human treasury review pending'}];}
   else if(scenario==='funding_failed'){
    // Only explicit fixture failure is reconciled safe to release; never an unknown live outcome.
    this.db.prepare("UPDATE orders SET status='cancelled_fixture',reason='Fixture funding failure; no funds moved' WHERE id=?").run(order.id);
    c.status='funding_failed_fixture';c.reason='Fixture funding leg failed; no USD card funding or GPU purchase';c.evidence=[{stage:'RLUSD funding stand-in',status:'failed fixture; reservation safely released'},{stage:'USD card funding / GPU purchase',status:'not attempted'}];
   }else{
    this.settleFixture(order.id);c.rlusdFunding=order.amount;c.feeRlusd=50;c.usdFunded=c.quotedUsd;
    c.evidence=[{stage:'Approved provider stand-in',status:'simulated RLUSD payment; not evidence Marqeta accepts RLUSD/AP4M'},{stage:'Conversion and prefunded card',status:'simulated USD funding at fixture rate/fee; no card issued'}];
    if(scenario==='gpu_failed'){c.status='gpu_declined_fixture';c.reason='Fixture GPU charge declined; simulated USD stays available, funding is not undone';c.evidence.push({stage:'GPU merchant card charge',status:'declined fixture; cycle not successful'});}
    else{c.status='completed_fixture';c.usdSpent=c.quotedUsd;c.evidence.push({stage:'GPU merchant card charge',status:'completed fixture only; no vendor acceptance or resource provisioning'});}
   }
   this.db.prepare('INSERT INTO cycles VALUES (?,?,?,?)').run(c.id,idempotencyKey,scenario,JSON.stringify(c));this.audit('fixture.card-cycle',{cycleId:c.id,status:c.status});return c;
  });
 }
 state(){return {mode:'simulation',currency:'RLUSD',network:'XRPL EVM testnet · 1449000 (not connected)',policy:this.policy(),usage:this.usage(),boundaries:this.boundaries(),timezone:'UTC',weekStart:'Monday',balance:this.balance(),cardBalance:this.balance('card'),cycles:this.cycles(),cycleAccounting:this.cycleAccounting(),services:SERVICES.filter(s=>!s.internal),orders:this.db.prepare('SELECT * FROM orders ORDER BY created DESC,rowid DESC').all().map(o=>this.decorate(o)),reviews:this.db.prepare('SELECT * FROM reviews ORDER BY created DESC').all().map(r=>({...r,status:'pending',reason:'A supported Ledger treasury action and verified sponsor configuration are required. No device or transaction was invoked.'})),capabilities:[{name:'Atomic mandates & idempotency',status:'implemented',detail:'Durable local SQLite reservations; daily / weekly / monthly UTC.'},{name:'AP4M payment flow',status:'simulated',detail:'Fixture funds and evidence only. Team configuration pending.'},{name:'Ledger Flex treasury',status:'unavailable',detail:'No supported hardware transport or confirmed treasury action.'},{name:'RLUSD settlement',status:'simulated',detail:'No token transfers or on-chain transactions.'},{name:'Credit quotes',status:'simulated',detail:'Versioned fixture underwriting. No loan originated.'},{name:'Virtual-card route',status:'simulated',detail:'Separate card-network fixture; shared owner budget. No issuer authorization, PAN, card issuance or conversion.'},{name:'Lender allocation / bridge',status:'planned',detail:'Outside this demo; no deposits, yield or bridge.'}]};}
}
export function creditQuote(scenario){if(!['healthy','review'].includes(scenario))throw new AppError('Select a known fixture scenario.');return {mode:'simulated',disclaimer:'Simulated underwriting; no loan originated.',policyVersion:'fixture-rate-v1',fixtureVersion:'fixture-evidence-v1',scenario,outcome:scenario==='healthy'?'indicative_quote':'human_review',principal:10000,fee:scenario==='healthy'?250:null,repayment:scenario==='healthy'?10250:null,reasonCodes:scenario==='healthy'?['FIXTURE_CASHFLOW_SUFFICIENT','FIXTURE_EVIDENCE_CURRENT']:['FIXTURE_EVIDENCE_STALE','FIXTURE_COVERAGE_INSUFFICIENT']};}
