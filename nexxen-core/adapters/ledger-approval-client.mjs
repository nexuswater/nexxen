/** Dormant coordinator for one LOCAL SIMULATION exception.
 * The host supplies the official Ledger signer only after a user click and
 * on-device address verification. This module never discovers devices, enrolls
 * authority, constructs a challenge, or signs a transaction.
 */
import {prepareLedgerMessageAction} from './ledger-message.mjs';
export function createLedgerApprovalClient({fetch:request,clock=()=>Date.now()}){
 let attempt=0,operation=null;
 const stop=()=>{attempt++;const previous=operation;operation=null;try{previous?.cancel();}catch{/* Local fencing survives SDK cancellation failure. */}};
 async function load(challengeId){
  const response=await request('/api/state',{cache:'no-store'});
  if(!response.ok)throw Error('SERVER_STATE_UNAVAILABLE');
  const state=await response.json();
  const authority=state.approvalCapabilities?.configuredAuthority;
  const challenge=state.approvalChallenges?.find(c=>c.id===challengeId);
  if(!authority||!/^0x[0-9a-fA-F]{40}$/.test(authority))throw Error('TRUSTED_AUTHORITY_NOT_ENROLLED');
  if(!challenge||challenge.status!=='pending'||challenge.expiresAt*1000<=clock())throw Error('CHALLENGE_NOT_PENDING');
  if(challenge.expectedAuthority!==authority||challenge.chainId!==1449000||challenge.exception!=='PER_REQUEST_LIMIT_ONLY'||challenge.currency!=='RLUSD fixture hundredths'||challenge.amountMinor>state.approvalCapabilities.maximumMinor)throw Error('CHALLENGE_SCOPE_MISMATCH');
  return Object.freeze({authority,signingAvailable:state.approvalCapabilities.signingAvailable===true,challenge:Object.freeze({...challenge})});
 }
 async function review(challengeId){return load(challengeId);}
 async function signReviewed({reviewed,verifiedDeviceAddress,signer,path,readiness}){
  if(operation)throw Error('SIGNING_ALREADY_ACTIVE');
  const current=++attempt;
  const fresh=await load(reviewed.challenge.id);
  if(current!==attempt)throw Error('CANCELLED');
  if(!fresh.signingAvailable)throw Error('SIGNING_UI_NOT_ENABLED');
  if(fresh.authority!==reviewed.authority||fresh.challenge.message!==reviewed.challenge.message)throw Error('REVIEW_CHANGED');
  if(typeof verifiedDeviceAddress!=='string'||verifiedDeviceAddress.toLowerCase()!==fresh.authority.toLowerCase())throw Error('DEVICE_ADDRESS_MISMATCH');
  const local=prepareLedgerMessageAction({signer,path,message:fresh.challenge.message,readiness});
  operation=local;
  try{
   const result=await local.start();
   if(current!==attempt)throw Error('CANCELLED');
   // Denial, expiry or policy changes during device review must fence submission.
   const latest=await load(fresh.challenge.id);
   if(current!==attempt)throw Error('CANCELLED');
   if(latest.authority!==fresh.authority||latest.challenge.message!==fresh.challenge.message)throw Error('REVIEW_CHANGED');
   const {r,s,v}=result.candidateSignature;
   const signature=r+s.slice(2)+(v<27?v+27:v).toString(16).padStart(2,'0');
   const response=await request('/api/approvals/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:fresh.challenge.id,signature})});
   // Once submitted, cancellation cannot claim rollback: the server owns the outcome.
   if(!response.ok)throw Error('SERVER_REJECTED_APPROVAL');
   const outcome=await response.json();
   if(outcome.status!=='consumed'||outcome.mode!=='simulation'||outcome.paymentSubmitted!==false)throw Error('UNEXPECTED_SERVER_OUTCOME');
   return outcome;
  }finally{if(operation===local)operation=null;}
 }
 return {review,signReviewed,cancel:stop,disconnect:stop};
}
