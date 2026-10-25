import http from 'node:http';
import { readFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { PUBLIC_DEPLOYMENT_SNAPSHOT } from './adapters/ap4m-prepare.mjs';
import { EVIDENCE_SNAPSHOT } from './lib/evidence-snapshot.mjs';
import { TermQuotes } from './lib/term-quotes.mjs';
import { Approvals } from './lib/approvals.mjs';
import { readAuthority } from './lib/approval-authority.mjs';
import { Store,AppError,creditQuote } from './lib/store.mjs';
const root=dirname(fileURLToPath(import.meta.url));mkdirSync(join(root,'data'),{recursive:true});
// This local application intentionally cannot activate live transfers by environment flag.
if(process.env.APP_MODE&&process.env.APP_MODE!=='simulation')throw new Error('Only simulation is supported by this application. Live adapters require separate verified integration.');
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('This unauthenticated local demo only permits loopback HOST (127.0.0.1, localhost, or ::1).');
const store=new Store(process.env.NEXXEN_DB||join(root,'data','nexxen.sqlite'));

// Disabled by default; enabled only by explicit local operator approval.
const enrolledAuthority=readAuthority(store);
const signingUiReady=enrolledAuthority?.signingUiEnabled===true;
const terms=new TermQuotes(store),approvals=new Approvals(store,{authority:enrolledAuthority?.address??null,maximumMinor:2});
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 const requestHost=new URL(`http://${req.headers.host || ''}`).hostname;
 if(!['localhost','127.0.0.1','[::1]',host].includes(requestHost))throw new AppError('Unrecognized host.',403);
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/ap4m-preparation')return send(res,200,{mode:'preparation-only',deployment:PUBLIC_DEPLOYMENT_SNAPSHOT,knownAgent:'0xe3D841aE3Acc8Dc79577092C141205f3d0Bf5183',portalEvidence:'Organizer-reported 20 RLUSD deposit is separate from the SDK-verified historical 0.001 RLUSD claim; current spendable capacity is not verified.',historicalEvidence:{scope:'recorded historical observations; no fresh verification by this endpoint',ap4m:EVIDENCE_SNAPSHOT.ap4mVerified,earlierUnpaidObservation:EVIDENCE_SNAPSHOT.ap4m,quicknode:{checkedAt:'2026-10-25T04:14:58.544Z',provider:'quicknode-xrpl-evm-testnet',sdkVersion:'0.10.1',verification:'canonical-ap4m-payout',claimId:EVIDENCE_SNAPSHOT.ap4mVerified.claimId,payoutFinal:true,settlementFinal:true,readOnly:true,fallbackUsed:false,totalRpcCalls:41}},runtime:'Local simulation and preparation only; no new chain submission or direct Marqeta funding.',merchantSelection:'pending',signingAllowed:false,broadcastAllowed:false,blockers:['Merchant selection for a new request is pending; historical payout is independently verified','No operational chain signer is configured; local Ledger message approvals authorize fixture exceptions only','Current channel capacity, gas and any new-payment authority remain unverified'],operations:['prepareChannelRequest','prepareVoucher','prepareRedemptionCall']});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,{...store.state(),termPolicy:terms.policy,termQuotes:terms.list(),approvalCapabilities:{...approvals.capabilities(),signingAvailable:signingUiReady&&!!enrolledAuthority,reason:signingUiReady?'Local fixture message approval enabled; each request still requires explicit user device review.':approvals.capabilities().reason,observedFirmware:enrolledAuthority?.observedFirmware??null,observedEthereumApp:enrolledAuthority?.observedEthereumApp??null},approvalChallenges:approvals.list()});
 if(req.method==='POST'&&url.pathname.startsWith('/api/')){
  const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`)throw new AppError('Cross-origin mutation rejected.',403);
  if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError('JSON required.',415);
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw new AppError('Request too large.',413);}let body;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('object required');}catch{throw new AppError('Invalid JSON.');}
  if(url.pathname==='/api/term-quotes')return send(res,200,terms.create(body));
  if(url.pathname==='/api/term-quotes/accept')return send(res,200,terms.accept(body));
  if(url.pathname==='/api/approvals/prepare')return send(res,200,approvals.prepare(body));
  if(url.pathname==='/api/approvals/deny')return send(res,200,approvals.deny(body));
  if(url.pathname==='/api/approvals/submit'){if(!signingUiReady)throw new AppError('Signing UI is not enabled pending review.',409);return send(res,200,approvals.submit(body));}
  if(url.pathname==='/api/card-cycles')return send(res,200,store.cardCycle(body));
  if(url.pathname==='/api/orders')return send(res,200,store.purchase(body));
  if(url.pathname==='/api/policy')return send(res,200,store.updatePolicy(body));
  if(url.pathname==='/api/credit-quotes')return send(res,200,creditQuote(body.scenario));
  throw new AppError('Unsupported action. Treasury approval is unavailable.',404);
 }
 const approvalFiles={'/approval':['index.html','text/html'],'/approval/approval.js':['dist/approval.js','text/javascript'],'/approval/style.css':['style.css','text/css']};
 if(req.method==='GET'&&approvalFiles[url.pathname]){const [file,type]=approvalFiles[url.pathname];let bytes;try{bytes=readFileSync(join(root,'tools','ledger-approval',file));}catch{return send(res,503,{error:'Approval panel assets unavailable. Build the local bundle before use.'});}res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Permissions-Policy':'hid=(self)'});return res.end(bytes);}
 const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
 if(req.method==='GET'&&files[url.pathname]){const [file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type});return res.end(readFileSync(join(root,'public',file)));}throw new AppError('Not found.',404);
}catch(e){send(res,e.status||500,{error:e.status?e.message:'Internal server error.'});}});
server.listen(port,host,()=>console.log(`NEXXEN fixture demo: http://${host}:${port} — no live funds, hardware, or network signing`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{store.close();process.exit(0);}));
