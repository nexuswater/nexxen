/** Documented Marqeta PUBLIC SANDBOX operations. No production endpoint, PAN or retry API. */
export const MARQETA_PUBLIC_SANDBOX='https://sandbox-api.marqeta.com/v3';
export class SandboxAdapterError extends Error {
 constructor(code,httpStatus){super(`Marqeta sandbox: ${code}`);this.name='SandboxAdapterError';this.code=code;if(httpStatus)this.httpStatus=httpStatus;}
}
const fail=(code,status)=>{throw new SandboxAdapterError(code,status);};
const token=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,36}$/.test(value)||/^\d{12,}$/.test(value))fail('INVALID_RESOURCE_TOKEN');return value;};
export function usdCents(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value))fail('INVALID_USD_AMOUNT');const [a,b='']=value.split('.');const cents=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents<1)fail('INVALID_USD_AMOUNT');return cents;}
const usd=value=>{const n=typeof value==='number'?String(value):value;return (usdCents(n)/100).toFixed(2);};
const states=new Set(['ACTIVE','INACTIVE','SUSPENDED','TERMINATED','PENDING','COMPLETION','CLEARED','DECLINED','ERROR']);
const state=value=>states.has(value)?value:'UNRECOGNIZED';
const code=value=>typeof value==='string'&&/^\d{4}$/.test(value)?value:null;
const safeToken=value=>value==null?null:token(value);
function cleanLoad(v){return {token:token(v.token),userToken:token(v.user_token),amountUsd:usd(v.amount),currencyCode:v.currency_code==='USD'?'USD':'UNRECOGNIZED',currency:v.currency_code==='USD'?'USD':'UNRECOGNIZED',amountCents:usdCents(typeof v.amount==='number'?String(v.amount):v.amount),fundingSourceToken:token(v.funding_source_token),state:state(v.state),responseCode:code(v.response?.code),transactionToken:safeToken(v.transaction_token),sandboxOnly:true};}
/** Caller must persist the operation before invocation; this class never retries a POST. */
export class MarqetaSandboxAdapter {
 #config;#fetch;#auth;
 constructor(config={}, {applicationToken,adminAccessToken,fetchImpl=fetch}={}){
  this.#config=Object.freeze({...config});this.#fetch=fetchImpl;
  if(typeof applicationToken==='string'&&applicationToken.length>0&&!applicationToken.includes(':')&&typeof adminAccessToken==='string'&&adminAccessToken.length>0&&!/[\r\n]/.test(applicationToken+adminAccessToken))this.#auth='Basic '+Buffer.from(applicationToken+':'+adminAccessToken).toString('base64');
 }
 status(){const blockers=[];if(this.#config.enabled!==true)blockers.push('Sandbox adapter disabled');if(this.#config.approvedSandboxOperations!==true)blockers.push('Explicit sandbox operation authorization required');if(this.#config.baseUrl!==MARQETA_PUBLIC_SANDBOX)blockers.push('Assigned public sandbox base URL must be verified and pinned');if(!this.#auth)blockers.push('Runtime sandbox credentials unavailable');if(!Number.isSafeInteger(this.#config.maxUsdCents)||this.#config.maxUsdCents<1)blockers.push('Approved sandbox USD cap required');return {mode:'sandbox',status:blockers.length?'unavailable':'configured-unverified',blockers,productionApprovalRequired:false,nonJitVerified:this.#config.nonJitVerified===true,liveConversion:false,realFunds:false};}
 #require(funding=false){if(this.status().blockers.length)fail('NOT_CONFIGURED');if(funding&&this.#config.nonJitVerified!==true)fail('NON_JIT_PRODUCT_NOT_VERIFIED');}
 #amount(amountUsd){const cents=usdCents(amountUsd);if(cents>this.#config.maxUsdCents)fail('SANDBOX_AMOUNT_CAP_EXCEEDED');return (cents/100).toFixed(2);}
 async #request(method,path,body,{funding=false,notFound=false}={}){
  this.#require(funding);let response;
  try{response=await this.#fetch(MARQETA_PUBLIC_SANDBOX+path,{method,headers:{Authorization:this.#auth,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{fail(method==='POST'?'OUTCOME_UNKNOWN_RECONCILE':'READ_FAILED');}
  if(notFound&&response.status===404)return null;
  if(!response.ok)fail(method==='POST'?'POST_REJECTED_RECONCILE':'READ_REJECTED',response.status);
  try{return await response.json();}catch{fail(method==='POST'?'OUTCOME_UNKNOWN_RECONCILE':'INVALID_RESPONSE');}
 }
 async createUser({firstName,lastName}){if(this.#config.setupApproved!==true)fail('SETUP_NOT_AUTHORIZED');if(![firstName,lastName].every(v=>typeof v==='string'&&v.length>0&&v.length<=40))fail('INVALID_FIXTURE_NAME');const v=await this.#request('POST','/users',{first_name:firstName,last_name:lastName});return {token:token(v.token),sandboxOnly:true};}
 async listCardProducts(){const v=await this.#request('GET','/cardproducts');if(!Array.isArray(v.data))fail('INVALID_RESPONSE');return v.data.map(p=>({token:token(p.token),name:typeof p.name==='string'?p.name.slice(0,80):'',active:p.active===true,nonJitProven:false}));}
 async createCard({userToken,cardProductToken}){if(this.#config.setupApproved!==true)fail('SETUP_NOT_AUTHORIZED');if(token(cardProductToken)!==this.#config.cardProductToken)fail('UNAPPROVED_CARD_PRODUCT');const v=await this.#request('POST','/cards',{user_token:token(userToken),card_product_token:cardProductToken});if(v.user_token!==userToken||v.card_product_token!==cardProductToken)fail('CARD_RESPONSE_MISMATCH_RECONCILE');return {token:token(v.token),userToken:token(v.user_token),cardProductToken:token(v.card_product_token),state:state(v.state),sandboxOnly:true};}
 async loadSandboxUsd({operationToken,userToken,amountUsd}){
  this.#require(true);const requested={token:token(operationToken),user_token:token(userToken),amount:Number(this.#amount(amountUsd)),currency_code:'USD',funding_source_token:'sandbox_program_funding'};
  const result=cleanLoad(await this.#request('POST','/gpaorders',requested,{funding:true}));
  if(result.token!==requested.token||result.userToken!==requested.user_token||result.amountUsd!==usd(requested.amount)||result.currencyCode!=='USD'||result.fundingSourceToken!==requested.funding_source_token)fail('LOAD_RESPONSE_MISMATCH_RECONCILE');
  return {...result,confirmed:result.state==='COMPLETION'&&result.responseCode==='0000',verified:result.state==='COMPLETION'&&result.responseCode==='0000'};
 }
 async getLoad(operationToken){const result=await this.#request('GET','/gpaorders/'+token(operationToken),undefined,{notFound:true});if(result===null)return {found:false,token:operationToken,sandboxOnly:true};const clean=cleanLoad(result);if(clean.token!==operationToken)fail('LOAD_RESPONSE_MISMATCH_RECONCILE');const verified=clean.state==='COMPLETION'&&clean.responseCode==='0000'&&clean.currency==='USD'&&clean.fundingSourceToken==='sandbox_program_funding';return {...clean,found:true,confirmed:verified,verified};}
 async authorizeSimulation({cardToken,amountUsd,merchantId,network}){
  this.#require(true);if(token(cardToken)!==this.#config.cardToken||merchantId!==this.#config.merchantId||network!==this.#config.network||!['VISA','MASTERCARD','DISCOVER'].includes(network))fail('UNAPPROVED_SIMULATION_SCOPE');
  const amount=this.#amount(amountUsd);const response=await this.#request('POST','/simulations/cardtransactions/authorization',{amount,card_token:cardToken,card_acceptor:{mid:merchantId},network},{funding:true});
  const rows=Array.isArray(response.transactions)?response.transactions:[response];
  const matches=rows.filter(t=>t.card_token===cardToken&&t.card_acceptor?.mid===merchantId&&usd(t.amount)===amount&&t.currency_code==='USD'&&t.type==='authorization');
  if(matches.length!==1)fail('AUTH_RESPONSE_UNVERIFIED_RECONCILE');const t=matches[0];
  return {transactionToken:token(t.token),cardToken,amountUsd:amount,currencyCode:'USD',state:state(t.state),responseCode:code(t.response?.code),approved:t.response?.code==='0000'&&t.state==='PENDING',sandboxOnly:true,settlementVerified:false,gpuDeliveryVerified:false};
 }
}
