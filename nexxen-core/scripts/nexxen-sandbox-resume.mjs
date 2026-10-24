/** Recovery only: never creates a GPA load or negative authorization. */
import {pathToFileURL} from 'node:url';
import {mkdirSync,existsSync,lstatSync,openSync,closeSync,readFileSync,writeFileSync,fsyncSync,renameSync,chmodSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';import {randomUUID} from 'node:crypto';
const BASE='https://sandbox-api.marqeta.com/v3';
export const FIXTURE_IDS=Object.freeze({product:'nexxen-nonjit-v1',user:'nexxen-test-user-v1',card:'nexxen-test-card-v1'});
const paths=Object.freeze({card:'/cards/'+FIXTURE_IDS.card,product:'/cardproducts/'+FIXTURE_IDS.product,user:'/users/'+FIXTURE_IDS.user,balance:'/balances/'+FIXTURE_IDS.user});
class PreflightError extends Error {constructor(code,status){super(code);this.code=code;if(Number.isInteger(status))this.httpStatus=status;}}
const fail=(code,status)=>{throw new PreflightError(code,status);};
function amountCents(value){const s=typeof value==='number'?String(value):value;if(typeof s!=='string'||!/^(-?)(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(s))return null;const negative=s[0]==='-',[whole,fraction='']=(negative?s.slice(1):s).split('.');const n=(Number(whole)*100+Number(fraction.padEnd(2,'0')))*(negative?-1:1);return Number.isSafeInteger(n)?n:null;}
export function usdBaseline(body){
 const gpa=body?.gpa;let usd,source;
 if(gpa?.balances&&Object.hasOwn(gpa.balances,'USD')){usd=gpa.balances.USD;source='gpa.balances.USD';if(usd?.currency_code!=='USD')return {verified:false,reason:'USD_BUCKET_CURRENCY_MISSING_OR_MISMATCH'};}
 else if(gpa?.currency_code==='USD'){usd=gpa;source='gpa';}
 else return {verified:false,reason:'EXPLICIT_USD_GPA_UNAVAILABLE'};
 const availableCents=amountCents(usd.available_balance),ledgerCents=amountCents(usd.ledger_balance),pendingCreditsCents=amountCents(usd.pending_credits);
 if([availableCents,ledgerCents,pendingCreditsCents].some(v=>v===null))return {verified:false,reason:'BALANCE_FIELDS_MISSING_OR_INVALID'};
 return {verified:true,currency:'USD',source,availableCents,ledgerCents,pendingCreditsCents,ledgerMinusAvailableCents:ledgerCents-availableCents,zeroBaseline:availableCents===0&&ledgerCents===0&&pendingCreditsCents===0};
}
export function evaluatePreflight({card,product,user,balance}){
 const checks={cardIdentity:card?.token===FIXTURE_IDS.card,cardUserAssociation:card?.user_token===FIXTURE_IDS.user,cardProductAssociation:card?.card_product_token===FIXTURE_IDS.product,cardActive:card?.state==='ACTIVE',cardVirtual:card?.instrument_type==='VIRTUAL_PAN',productIdentity:product?.token===FIXTURE_IDS.product,productActive:product?.active===true,paymentcardJitDisabled:product?.config?.jit_funding?.paymentcard_funding_source?.enabled===false,programJitDisabled:product?.config?.jit_funding?.program_funding_source?.enabled===false,programGatewayJitDisabled:product?.config?.jit_funding?.programgateway_funding_source?.enabled===false,allowGpaAuth:product?.config?.transaction_controls?.allow_gpa_auth===true,userIdentity:user?.token===FIXTURE_IDS.user,userActive:user?.active===true,userOwnAccount:user?.uses_parent_account===false};
 const baseline=usdBaseline(balance),configurationVerified=Object.values(checks).every(Boolean);
 return {mode:'READ_ONLY_PREFLIGHT',checks,configurationVerified,usdBaseline:baseline,zeroBalanceSmokePrerequisitesObserved:configurationVerified&&baseline.verified&&baseline.zeroBaseline===true,networkVerified:false,network:null,behavioralNonJitTestPerformed:false,mutationsPerformed:false,fundingPerformed:false,authorizationPerformed:false,settlementVerified:false,gpuDeliveryVerified:false,ap4mFundingVerified:false,next:'Stop here. Any negative authorization, $1 sandbox load and positive authorization require a separate exact test plan and NEW explicit approval. This is not AP4M funding evidence.'};
}
export async function runPreflight({args=[],env=process.env,fetchImpl=fetch}={}){
 if(args.some(a=>a!=='--check'))fail('INVALID_ARGUMENTS_READ_ONLY_TOOL');
 if(!args.includes('--check'))return {mode:'PREVIEW_ONLY',networkCalls:0,filesWritten:0,operations:Object.values(paths).map(path=>({method:'GET',path})),nextCommandFlag:'--check',mutationsAvailable:false,scope:'Read associations, non-JIT product flags, own user account and USD GPA baseline only. No nonexistent card funding-override field is required.'};
 const app=env.MARQETA_APPLICATION_TOKEN,admin=env.MARQETA_ADMIN_ACCESS_TOKEN;
 if(env.MARQETA_SANDBOX_READ_ENABLED!=='true'||env.MARQETA_SANDBOX_BASE_URL?.replace(/\/$/,'')!==BASE||typeof app!=='string'||!app||app.includes(':')||typeof admin!=='string'||!admin||/[\r\n]/.test(app+admin))fail('RUNTIME_CONFIG_INVALID');
 const responses={};for(const [kind,path] of Object.entries(paths)){let response;try{response=await fetchImpl(BASE+path,{method:'GET',headers:{Authorization:'Basic '+Buffer.from(app+':'+admin).toString('base64'),Accept:'application/json'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{fail('READ_FAILED');}if(!response.ok)fail('READ_REJECTED',response.status);try{responses[kind]=await response.json();}catch{fail('RESPONSE_INVALID');}}
 return evaluatePreflight(responses);
}
export function safePreflightError(e){return {mode:'STOPPED',error:e instanceof PreflightError?e.code:'READ_FAILED',...(e instanceof PreflightError&&Number.isInteger(e.httpStatus)?{httpStatus:e.httpStatus}:{}),mutationsPerformed:false};}
const AUTH_PATH='/simulations/cardtransactions/authorization';
const AUTH_BODY=Object.freeze({card_token:FIXTURE_IDS.card,amount:1,currency_code:'USD',network:'MASTERCARD',card_acceptor:{mid:'11111'}});
const validToken=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{1,36}$/.test(t)&&!/^\d{12,}$/.test(t);
function persist(path,state){const tmp=path+'.tmp';if(existsSync(tmp)&&lstatSync(tmp).isSymbolicLink())fail('UNSAFE_STATE_FILE');const fd=openSync(tmp,'w',0o600);try{writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}chmodSync(tmp,0o600);renameSync(tmp,path);const d=openSync(join(path,'..'),'r');try{fsyncSync(d);}finally{closeSync(d);}}
function authResult(body,phase){const rows=body?.transaction?[body.transaction]:[body];const matches=rows.filter(v=>v?.card_token===FIXTURE_IDS.card);if(matches.length!==1)return null;const v=matches[0];if(!validToken(v.token))return null;const mid=typeof v.card_acceptor?.mid==='string'&&/^\d+$/.test(v.card_acceptor.mid)?v.card_acceptor.mid.replace(/^0+(?=\d)/,''):null;const identity=v.type==='authorization'&&v.user_token===FIXTURE_IDS.user&&mid==='11111'&&amountCents(v.amount)===100&&v.currency_code==='USD'&&v.network==='MASTERCARD';const code=/^\d{4}$/.test(v.response?.code||'')?v.response.code:null;const jitObserved=v.gpa_order?.jit_funding!=null;const expected=phase==='negative'?code==='1016'&&v.state==='DECLINED':code==='0000'&&v.state==='PENDING';return {status:identity&&expected&&!jitObserved?'verified':'blocked',transactionToken:v.token,responseCode:code,state:['DECLINED','PENDING','COMPLETION','CLEARED','ERROR'].includes(v.state)?v.state:'unverified',network:v.network==='MASTERCARD'?'MASTERCARD':null,jitObserved};}
export function verifyExistingLoad(v,token,alias,canonical){
 if(!validToken(alias?.token)||alias.active!==true||!validToken(canonical?.token)||canonical.active!==true||canonical.token!==alias.token)return null;
 const direct=v?.funding_source_token,nested=v?.funding?.source?.token;if(direct!=null&&nested!=null&&direct!==nested)return null;const source=direct??nested;
 if(source!==alias.token||v?.token!==token||v.user_token!==FIXTURE_IDS.user||amountCents(v.amount)!==100||v.currency_code!=='USD'||v.state!=='COMPLETION'||v.response?.code!=='0000'||!validToken(v.transaction_token))return null;
 return {status:'verified',resourceToken:token,amountCents:100,currency:'USD',responseCode:'0000',state:'COMPLETION',transactionToken:v.transaction_token,canonicalFundingSourceToken:alias.token,sourceBinding:'GET approved sandbox_program_funding alias and matching canonical program source'};
}
function resumeSummary(s,extra={}){return {mode:'EXISTING_SANDBOX_SMOKE_RECOVERY',existingLoadToken:s.load.resourceToken,existingLoadVerified:s.load.status==='verified',canonicalSourceBindingVerified:!!s.load.canonicalFundingSourceToken,negativeAuthorizationStatus:s.negative.status,positiveAuthorization:s.positive,finalUsdBalance:s.finalBalance||null,holdVerified:s.holdVerified===true,additionalFundingPerformed:false,negativeAuthorizationPerformed:false,ap4mFundingVerified:false,settlementVerified:false,gpuDeliveryVerified:false,conversionPerformed:false,stateFile:'data/nexxen-sandbox-smoke.json',...extra};}
export async function runResume({args=[],env=process.env,cwd=process.cwd(),fetchImpl=fetch}={}){
 const allowed=['--check','--reconcile','--complete-approved-positive'];if(args.some(a=>!allowed.includes(a))||args.length>1)fail('INVALID_RECOVERY_ARGUMENTS');
 const complete=args.includes('--complete-approved-positive'),reconcile=args.includes('--reconcile');
 if(!args.length)return {mode:'PREVIEW_ONLY',networkCalls:0,filesWritten:0,readOnlyFlag:'--check',getReconciliationFlag:'--reconcile',completionFlag:'--complete-approved-positive',scope:'Use only the existing saved load. Resolve approved program-funding alias by GET, verify exact load/negative transaction/card/user/product/balance, then optionally complete ONLY the originally approved positive $1 authorization.',neverCreatesOrReloadsFunds:true,neverRepeatsNegativeAuthorization:true,warning:'Keep existing data/nexxen-sandbox-smoke.json. Never delete state or repeat the old load. Missing canonical alias linkage stops this recovery.'};
 const app=env.MARQETA_APPLICATION_TOKEN,admin=env.MARQETA_ADMIN_ACCESS_TOKEN;if(env.MARQETA_SANDBOX_READ_ENABLED!=='true'||env.MARQETA_SANDBOX_BASE_URL?.replace(/\/$/,'')!==BASE||typeof app!=='string'||!app||app.includes(':')||typeof admin!=='string'||!admin||/[\r\n]/.test(app+admin))fail('RUNTIME_CONFIG_INVALID');
 const directory=join(cwd,'data'),path=join(directory,'nexxen-sandbox-smoke.json'),lock=path+'.lock';if(!existsSync(path))fail('EXISTING_SMOKE_STATE_REQUIRED');if(lstatSync(directory).isSymbolicLink()||lstatSync(path).isSymbolicLink())fail('UNSAFE_STATE_FILE');let lockFd;
 if(complete||reconcile)try{lockFd=openSync(lock,'wx',0o600);}catch{fail('SMOKE_LOCKED');}
 try{
  let s;try{s=JSON.parse(readFileSync(path,'utf8'));}catch{fail('STATE_INVALID');}
  if(s.version!==1||JSON.stringify(s.scope)!==JSON.stringify(AUTH_BODY)||!validToken(s.load?.resourceToken)||s.negative?.status!=='verified'||!validToken(s.negative?.transactionToken)||!['planned','posting','unknown','verified','blocked'].includes(s.positive?.status))fail('SAVED_SCOPE_OR_EXISTING_PROOF_INVALID');
  const auth='Basic '+Buffer.from(app+':'+admin).toString('base64');
  async function request(method,endpoint,body){
   // There is exactly one allowed POST target and only the positive continuation can invoke it.
   if(method!=='GET'&&!(method==='POST'&&complete&&endpoint===AUTH_PATH&&s.positive.status==='posting'&&JSON.stringify(body)===JSON.stringify(AUTH_BODY)))fail('RECOVERY_MUTATION_NOT_ALLOWED');
   let r;try{r=await fetchImpl(BASE+endpoint,{method,headers:{Authorization:auth,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{fail(method==='POST'?'POSITIVE_AUTH_OUTCOME_UNKNOWN':'READ_FAILED');}if(!r.ok)fail(method==='POST'?'POSITIVE_AUTH_OUTCOME_UNKNOWN':'READ_REJECTED',r.status);try{return await r.json();}catch{fail(method==='POST'?'POSITIVE_AUTH_OUTCOME_UNKNOWN':'RESPONSE_INVALID');}
  }
  const preflight=await runPreflight({args:['--check'],env,fetchImpl});if(!preflight.configurationVerified||!preflight.usdBaseline.verified)return resumeSummary(s,{stopped:'PREFLIGHT_NOT_VERIFIED',readOnlyPreflight:preflight});
  const alias=await request('GET','/fundingsources/program/sandbox_program_funding');
  if(!validToken(alias?.token)||alias.active!==true)return resumeSummary(s,{stopped:'APPROVED_FUNDING_ALIAS_UNRESOLVED'});
  const canonical=await request('GET','/fundingsources/program/'+alias.token);
  const existing=await request('GET','/gpaorders/'+s.load.resourceToken);
  const verifiedLoad=verifyExistingLoad(existing,s.load.resourceToken,alias,canonical);if(!verifiedLoad)return resumeSummary(s,{stopped:'EXISTING_LOAD_CANONICAL_SOURCE_OR_IDENTITY_MISMATCH'});
  const negative=authResult(await request('GET','/transactions/'+s.negative.transactionToken),'negative');
  if(!negative||negative.status!=='verified'||negative.transactionToken!==s.negative.transactionToken)return resumeSummary(s,{stopped:'EXISTING_NEGATIVE_PROOF_NOT_VERIFIED'});
  s.load=verifiedLoad;s.negative=negative;
  if(s.positive.status==='planned'){
   const b=preflight.usdBaseline;if(b.availableCents!==100||b.ledgerCents!==100||b.pendingCreditsCents!==0)return resumeSummary(s,{stopped:'EXACT_EXISTING_ONE_DOLLAR_BALANCE_REQUIRED'});
   if(!complete){if(reconcile)persist(path,s);return resumeSummary(s,{readyForOriginalPositiveAuthorization:true,stateUpdated:reconcile,positiveAuthorizationPerformedByThisRun:false,next:'Only if completing the originally approved remaining authorization: --complete-approved-positive. No load or negative authorization can be created by this file.'});}
   s.positive={status:'posting'};persist(path,s);let body;try{body=await request('POST',AUTH_PATH,AUTH_BODY);}catch(e){s.positive={status:'unknown',error:e instanceof PreflightError?e.code:'POSITIVE_AUTH_OUTCOME_UNKNOWN',...(e.httpStatus?{httpStatus:e.httpStatus}:{})};persist(path,s);return resumeSummary(s,{stopped:'POSITIVE_AUTH_OUTCOME_UNKNOWN',next:'No automatic retry. Preserve state; an authorization without a returned transaction token requires manual review.'});}
   const positive=authResult(body,'positive');s.positive=positive||{status:'unknown',error:'POSITIVE_AUTH_RESPONSE_UNVERIFIED'};persist(path,s);
  }else{
   if(!validToken(s.positive.transactionToken))return resumeSummary(s,{stopped:'POSITIVE_AUTH_UNCERTAIN_NO_SAFE_REPLAY'});
   const positive=authResult(await request('GET','/transactions/'+s.positive.transactionToken),'positive');if(!positive||positive.transactionToken!==s.positive.transactionToken)return resumeSummary(s,{stopped:'EXISTING_POSITIVE_AUTH_NOT_VERIFIED'});s.positive=positive;if(complete||reconcile)persist(path,s);
  }
  if(s.positive.status!=='verified')return resumeSummary(s,{stopped:'POSITIVE_AUTH_NOT_APPROVED_AS_EXPECTED'});
  s.finalBalance=usdBaseline(await request('GET',paths.balance));s.holdVerified=s.finalBalance.verified&&s.finalBalance.ledgerCents===100&&s.finalBalance.availableCents===0&&s.finalBalance.pendingCreditsCents===0;if(complete||reconcile)persist(path,s);
  return resumeSummary(s,{result:s.holdVerified?'EXISTING_SANDBOX_SMOKE_HOLD_VERIFIED':'POSITIVE_APPROVAL_OBSERVED_HOLD_NOT_VERIFIED'});
 }finally{if(lockFd!==undefined){closeSync(lockFd);unlinkSync(lock);}}
}
export function safeResumeError(e,args=[]){const safe=safePreflightError(e);return {mode:'RECOVERY_STOPPED',error:safe.error,...(safe.httpStatus?{httpStatus:safe.httpStatus}:{}),additionalFundingPerformed:false,negativeAuthorizationPerformed:false,positiveAuthorizationOutcome:args.includes('--complete-approved-positive')?'unknown':'no POST attempted by this run',reconciliationRequired:true,stateFile:'data/nexxen-sandbox-smoke.json',next:'Keep saved state. No load replay or negative authorization is available in this file; use --reconcile for GET-only inspection.'};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await runResume({args:process.argv.slice(2)}),null,2));}catch(e){console.error(JSON.stringify(safeResumeError(e,process.argv.slice(2)),null,2));process.exitCode=1;}}
