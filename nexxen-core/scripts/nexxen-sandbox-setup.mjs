/** Standalone PREVIEW-FIRST setup: dedicated sandbox product, fixture user, one virtual card. */
import {mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,fsyncSync,existsSync,lstatSync,unlinkSync,chmodSync} from 'node:fs';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const BASE='https://sandbox-api.marqeta.com/v3';const APPROVAL='--approve-create-product-user-card';
const codes=new Set(['INVALID_ARGUMENTS','EXPLICIT_SETUP_APPROVAL_REQUIRED','RUNTIME_CONFIG_INVALID','SETUP_LOCKED','UNSAFE_STATE_FILE','STATE_INVALID','NO_SAVED_SETUP','READ_FAILED','READ_REJECTED','RESPONSE_INVALID','UNKNOWN_POST_OUTCOME','RESOURCE_MISMATCH','UNKNOWN_RESOURCE_NOT_FOUND']);
const fail=code=>{throw new Error(code);};
export function setupPlan(date=new Date().toISOString().slice(0,10)){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('STATE_INVALID');
 const product='nexxen-nonjit-v1',user='nexxen-test-user-v1',card='nexxen-test-card-v1';
 return [{kind:'product',path:'/cardproducts',body:{token:product,name:'NEXXEN Sandbox Non-JIT',start_date:date,active:true,config:{card_life_cycle:{activate_upon_issue:true,reloadability:'RELOADABLE'},fulfillment:{payment_instrument:'VIRTUAL_PAN',allow_card_creation:true,card_personalization:{text:{name_line_1:{value:'NEXXEN TEST'}}}},jit_funding:{paymentcard_funding_source:{enabled:false},program_funding_source:{enabled:false},programgateway_funding_source:{enabled:false,always_fund:false}},transaction_controls:{allow_gpa_auth:true,enable_partial_auth_approval:false},poi:{ecommerce:true,atm:false}}}},
 {kind:'user',path:'/users',body:{token:user,first_name:'NEXXEN',last_name:'Sandbox',uses_parent_account:false}},
 {kind:'card',path:'/cards',body:{token:card,user_token:user,card_product_token:product}}];
}
function matches(actual,expected){return expected&&typeof expected==='object'?actual&&typeof actual==='object'&&Object.entries(expected).every(([k,v])=>matches(actual[k],v)):actual===expected;}
function runtime(env){const app=env.MARQETA_APPLICATION_TOKEN,admin=env.MARQETA_ADMIN_ACCESS_TOKEN;if(env.MARQETA_SANDBOX_READ_ENABLED!=='true'||env.MARQETA_SANDBOX_BASE_URL?.replace(/\/$/,'')!==BASE||typeof app!=='string'||!app||app.includes(':')||typeof admin!=='string'||!admin||/[\r\n]/.test(app+admin))fail('RUNTIME_CONFIG_INVALID');return 'Basic '+Buffer.from(app+':'+admin).toString('base64');}
function save(path,state){const tmp=path+'.tmp';if(existsSync(tmp)&&lstatSync(tmp).isSymbolicLink())fail('UNSAFE_STATE_FILE');const fd=openSync(tmp,'w',0o600);try{writeFileSync(fd,JSON.stringify(state,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}chmodSync(tmp,0o600);renameSync(tmp,path);const dir=openSync(join(path,'..'),'r');try{fsyncSync(dir);}finally{closeSync(dir);}}
function summary(state){return {mode:'sandbox-setup',operations:state.steps.map(s=>({kind:s.kind,resourceToken:s.body.token,status:s.status})),productNonJitConfigured:state.steps[0].status==='verified',cardState:state.cardState||'unverified',networkVerified:false,network:null,effectiveCardFundingVerified:false,fundingPerformed:false,authorizationPerformed:false,defaultProductModified:false,panOrCvvPrinted:false,stateFile:'data/nexxen-sandbox-setup.json'};}
export async function runSetup({args=[],env=process.env,cwd=process.cwd(),fetchImpl=fetch,today=new Date().toISOString().slice(0,10)}={}){
 if(args.some(a=>!['--apply',APPROVAL,'--reconcile'].includes(a))||args.includes('--apply')&&args.includes('--reconcile'))fail('INVALID_ARGUMENTS');
 const apply=args.includes('--apply'),reconcile=args.includes('--reconcile');
 if(!apply&&!reconcile)return {mode:'PREVIEW_ONLY',networkCalls:0,filesWritten:0,operations:setupPlan(today),approvalRequired:'Creates exactly one dedicated non-JIT sandbox product, one fixture user and one virtual test card; no default edits, funding or authorization.',applyFlags:'--apply '+APPROVAL,warning:'Do not run apply until you explicitly approve these three sandbox creations. Program-specific API validation may reject; no success assumed.'};
 if(apply&&!args.includes(APPROVAL))fail('EXPLICIT_SETUP_APPROVAL_REQUIRED');const auth=runtime(env);
 const directory=join(cwd,'data'),path=join(directory,'nexxen-sandbox-setup.json'),lock=path+'.lock';
 if(existsSync(directory)&&lstatSync(directory).isSymbolicLink())fail('UNSAFE_STATE_FILE');mkdirSync(directory,{recursive:true,mode:0o700});
 if(existsSync(path)&&lstatSync(path).isSymbolicLink())fail('UNSAFE_STATE_FILE');if(reconcile&&!existsSync(path))fail('NO_SAVED_SETUP');
 let fd;try{fd=openSync(lock,'wx',0o600);}catch{fail('SETUP_LOCKED');}
 try{
  let state;if(existsSync(path)){try{state=JSON.parse(readFileSync(path,'utf8'));}catch{fail('STATE_INVALID');}if(state.version!==1||JSON.stringify(state.steps.map(({kind,path,body})=>({kind,path,body})))!==JSON.stringify(setupPlan(state.date))||state.steps.some(s=>!['planned','posting','unknown','verified'].includes(s.status)))fail('STATE_INVALID');}
  else{state={version:1,date:today,steps:setupPlan(today).map(s=>({...s,status:'planned'}))};save(path,state);}
  async function request(method,step){let r;try{r=await fetchImpl(BASE+step.path+(method==='GET'?'/'+step.body.token:''),{method,headers:{Authorization:auth,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(step.body)}:{}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{fail(method==='POST'?'UNKNOWN_POST_OUTCOME':'READ_FAILED');}if(method==='GET'&&r.status===404)return null;if(!r.ok)fail(method==='POST'?'UNKNOWN_POST_OUTCOME':'READ_REJECTED');try{return await r.json();}catch{fail(method==='POST'?'UNKNOWN_POST_OUTCOME':'RESPONSE_INVALID');}}
  for(const step of state.steps){
   let value=await request('GET',step);
   if(!value){
    if(step.status!=='planned'||reconcile){if(step.status!=='planned'){step.status='unknown';save(path,state);}return {...summary(state),stopped:'UNKNOWN_RESOURCE_NOT_FOUND',next:'Use --reconcile only; no automatic POST retry or new card token.'};}
    step.status='posting';save(path,state);
    try{value=await request('POST',step);}catch(e){step.status='unknown';save(path,state);return {...summary(state),stopped:codes.has(e.message)?e.message:'UNKNOWN_POST_OUTCOME',next:'Use --reconcile; do not delete state or create another card.'};}
   }
   if(!matches(value,step.body)){step.status='unknown';save(path,state);return {...summary(state),stopped:'RESOURCE_MISMATCH',next:'Stop for review; no later creation or retry.'};}
   step.status='verified';if(step.kind==='card')state.cardState=['ACTIVE','INACTIVE','SUSPENDED','TERMINATED'].includes(value.state)?value.state:'unverified';save(path,state);
  }
  return summary(state);
 }finally{closeSync(fd);unlinkSync(lock);}
}
export function safeSetupError(error){return {mode:'stopped',error:codes.has(error?.message)?error.message:'SETUP_FAILED',fundingPerformed:false,authorizationPerformed:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await runSetup({args:process.argv.slice(2)}),null,2));}catch(e){console.error(JSON.stringify(safeSetupError(e),null,2));process.exitCode=1;}}
