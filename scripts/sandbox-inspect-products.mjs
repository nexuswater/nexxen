/** Standalone read-only funding-config inspector. No imports from project, writes or POSTs. */
import {pathToFileURL} from 'node:url';
const BASE='https://sandbox-api.marqeta.com/v3';
const boolean=v=>typeof v==='boolean'?v:null;
const text=v=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,'').slice(0,80):null;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,36}$/.test(v)&&!/^\d{12,}$/.test(v)?v:null;
export function summarizeProduct(p){
 const j=p?.config?.jit_funding;
 const flags={paymentcardEnabled:boolean(j?.paymentcard_funding_source?.enabled),programEnabled:boolean(j?.program_funding_source?.enabled),programGatewayEnabled:boolean(j?.programgateway_funding_source?.enabled),programGatewayAlwaysFund:boolean(j?.programgateway_funding_source?.always_fund)};
 const enabled=[flags.paymentcardEnabled,flags.programEnabled,flags.programGatewayEnabled];
 const contradiction=flags.programGatewayAlwaysFund===true&&flags.programGatewayEnabled!==true;
 const off=enabled.every(v=>v===false)&&!contradiction;
 const mode=contradiction?'contradictory-review-required':enabled.some(v=>v===true)?'jit-enabled':off?'jit-explicitly-disabled':'unknown-fields-missing-or-invalid';
 return {productToken:token(p?.token),productName:text(p?.name),active:boolean(p?.active),jit:flags,programFundingSourceConfigured:typeof j?.program_funding_source?.funding_source_token==='string'&&j.program_funding_source.funding_source_token.length>0,programGatewayFundingSourceConfigured:typeof j?.programgateway_funding_source?.funding_source_token==='string'&&j.programgateway_funding_source.funding_source_token.length>0,jitAssessment:mode,productNonJitConfigured:off,cardEffectiveConfigVerified:false,needsCardOverrideVerification:true,strictPrefundingCandidate:off&&p?.active===true,scope:'Product response fields only; no funding/authorization test or runtime policy update'};
}
export async function inspectProducts({env=process.env,fetchImpl=fetch}={}){
 const reject=code=>{throw new Error(code);};
 if(env.MARQETA_SANDBOX_READ_ENABLED!=='true')reject('READ_INSPECTION_NOT_ENABLED');
 // Normalize only the harmless trailing slash; do not broaden host or scheme acceptance.
 if(typeof env.MARQETA_SANDBOX_BASE_URL!=='string'||env.MARQETA_SANDBOX_BASE_URL.replace(/\/$/,'')!==BASE)reject('SANDBOX_BASE_URL_MISMATCH');
 const app=env.MARQETA_APPLICATION_TOKEN,admin=env.MARQETA_ADMIN_ACCESS_TOKEN;
 if(typeof app!=='string'||!app||app.includes(':')||typeof admin!=='string'||!admin||/[\r\n]/.test(app+admin))reject('RUNTIME_CREDENTIALS_MISSING_OR_INVALID');
 let response;try{response=await fetchImpl(BASE+'/cardproducts',{method:'GET',headers:{Authorization:'Basic '+Buffer.from(app+':'+admin).toString('base64'),Accept:'application/json'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{reject('SANDBOX_READ_FAILED');}
 if(!response.ok)reject('SANDBOX_READ_REJECTED');
 let body;try{body=await response.json();}catch{reject('SANDBOX_RESPONSE_INVALID');}
 if(!Array.isArray(body?.data)||body.data.some(p=>!p||typeof p!=='object'||Array.isArray(p)))reject('SANDBOX_RESPONSE_INVALID');
 const products=body.data.map(summarizeProduct);
 for(const product of products)for(const field of ['productToken','productName'])if(typeof product[field]==='string')for(const secret of [app,admin])if(product[field].includes(secret))product[field]='[REDACTED]';
 return {read:'sandbox-product-config',method:'GET',resource:'/cardproducts',mutationsPerformed:false,runtimePolicyChanged:false,products,note:'Missing fields remain unknown; documented defaults are not treated as observed values. Product funding-source tokens, gateway credentials and raw response are omitted.'};
}
const safeCodes=new Set(['READ_INSPECTION_NOT_ENABLED','SANDBOX_BASE_URL_MISMATCH','RUNTIME_CREDENTIALS_MISSING_OR_INVALID','SANDBOX_READ_FAILED','SANDBOX_READ_REJECTED','SANDBOX_RESPONSE_INVALID']);
export function safeInspectionError(error){return {read:'not-verified',error:safeCodes.has(error?.message)?error.message:'SANDBOX_READ_FAILED',mutationsPerformed:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await inspectProducts(),null,2));}catch(e){console.error(JSON.stringify(safeInspectionError(e),null,2));process.exitCode=1;}}
