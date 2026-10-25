import { randomUUID } from 'node:crypto';
import { AppError } from './store.mjs';
export const TERM_POLICY=Object.freeze({version:'fixture-hours-days-v1',minAmountMinor:1,maxAmountMinor:1000,minHours:1,maxHours:168,annualRateBps:1200,feeMinor:0,quoteValiditySeconds:600});
const fail=message=>{throw new AppError(message);};
export function decimalMinor(value){
 if(typeof value!=='string'||!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))fail('Enter an exact amount with at most two decimal places.');
 const [whole,fraction='']=value.split('.'),n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('Amount is out of range.');return Number(n);
}
export function calculateTermQuote(input,now=new Date(),policy=TERM_POLICY){
 if(!input||Object.keys(input).some(k=>!['amount','duration','unit'].includes(k)))fail('Only amount, duration and unit may be supplied.');
 const amountMinor=decimalMinor(input.amount);
 if(!Number.isSafeInteger(input.duration)||input.duration<1||!['hours','days'].includes(input.unit))fail('Use whole hours or days, not months or years.');
 for(const k of ['minAmountMinor','maxAmountMinor','minHours','maxHours','annualRateBps','feeMinor','quoteValiditySeconds'])if(!Number.isSafeInteger(policy[k])||policy[k]<0)fail('Invalid quote policy.');
 if(!policy.version||policy.minAmountMinor<1||policy.minHours<1||policy.quoteValiditySeconds<1||policy.maxHours>168||policy.maxAmountMinor>1000||policy.annualRateBps>10000||policy.feeMinor>policy.maxAmountMinor)fail('Unsupported quote policy.');
 const hours=input.duration*(input.unit==='days'?24:1);
 if(!Number.isSafeInteger(hours)||hours<policy.minHours||hours>policy.maxHours||amountMinor<policy.minAmountMinor||amountMinor>policy.maxAmountMinor)fail('Terms are outside configured fixture limits.');
 const durationSeconds=hours*3600,denominator=10000n*365n*86400n,numerator=BigInt(amountMinor)*BigInt(policy.annualRateBps)*BigInt(durationSeconds);
 // Simple ACT/365 Fixed; round final interest once, half up to the nearest hundredth.
 const interestMinor=Number((numerator+denominator/2n)/denominator),totalMinor=amountMinor+interestMinor+policy.feeMinor;
 if(!Number.isSafeInteger(totalMinor)||totalMinor<=0||totalMinor<amountMinor)fail('Invalid repayment total.');
 if(!Number.isFinite(now.getTime()))fail('Invalid quote time.');
 const due=new Date(now.getTime()+durationSeconds*1000),expires=new Date(now.getTime()+policy.quoteValiditySeconds*1000);
 if(!Number.isFinite(due.getTime())||!Number.isFinite(expires.getTime()))fail('Due time out of range.');
 return {mode:'simulation',currency:'RLUSD fixture',policyVersion:policy.version,amountMinor,annualRateBps:policy.annualRateBps,feeMinor:policy.feeMinor,interestMinor,totalMinor,duration:input.duration,unit:input.unit,durationSeconds,createdAt:now.toISOString(),dueAt:due.toISOString(),expiresAt:expires.toISOString(),timezone:'UTC',convention:'Simple ACT/365 Fixed; actual seconds / 31536000; interest rounded half up to 0.01',unroundedInterest:{numerator:numerator.toString(),denominator:denominator.toString()},fundingCreated:false};
}
export class TermQuotes {
 constructor(store,policy=TERM_POLICY){this.store=store;this.policy=Object.freeze({...policy});store.db.exec('CREATE TABLE IF NOT EXISTS term_quotes (id TEXT PRIMARY KEY,value TEXT NOT NULL,accepted_at TEXT)');}
 create(body){const quote={id:randomUUID(),...calculateTermQuote(body,this.store.now(),this.policy)};this.store.db.prepare('INSERT INTO term_quotes VALUES (?,?,NULL)').run(quote.id,JSON.stringify(quote));return quote;}
 accept(body){if(!body||Object.keys(body).length!==1||typeof body.quoteId!=='string')fail('Only an existing quote ID may be accepted.');return this.store.tx(()=>{
  const row=this.store.db.prepare('SELECT * FROM term_quotes WHERE id=?').get(body.quoteId);if(!row)fail('Unknown quote.');const quote=JSON.parse(row.value);
  if(row.accepted_at)return {...quote,acceptedAt:row.accepted_at};
  if(this.store.now().getTime()>=Date.parse(quote.expiresAt))fail('Quote expired; request a new quote.');
  const at=this.store.now().toISOString();this.store.db.prepare('UPDATE term_quotes SET accepted_at=? WHERE id=?').run(at,row.id);this.store.audit('fixture.quote.accepted',{quoteId:row.id});return {...quote,acceptedAt:at};
 });}
 list(){return this.store.db.prepare('SELECT * FROM term_quotes ORDER BY rowid DESC LIMIT 50').all().map(r=>({...JSON.parse(r.value),acceptedAt:r.accepted_at}));}
}
