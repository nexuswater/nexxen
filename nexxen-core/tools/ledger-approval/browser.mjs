import {DeviceManagementKitBuilder,GetAppAndVersionCommand} from '@ledgerhq/device-management-kit';
import {webHidTransportFactory} from '@ledgerhq/device-transport-kit-web-hid';
import {SignerEthBuilder} from '@ledgerhq/device-signer-kit-ethereum';
import {createLedgerApprovalClient} from '../../adapters/ledger-approval-client.mjs';
const $=id=>document.getElementById(id),path="44'/60'/0'/0/0";
const client=createLedgerApprovalClient({fetch:(...args)=>fetch(...args)});
let dmk,sessionId,sessionSub,discovery,addressAction,addressSub,rejectAddress;
let epoch=0,busy=false,verifiedAddress=null,reviewed=null,capabilities={};
const say=text=>{$('status').textContent=text;};
const dispose=sub=>{try{sub?.unsubscribe();}catch{}};
function controls(){
 $('connect').disabled=busy||!!sessionId;
 $('verify').disabled=busy||!sessionId;
 $('review').disabled=busy;
 $('refresh').disabled=busy;
 $('challenges').disabled=busy;
 $('deny').disabled=busy||!reviewed;
 $('sign').disabled=busy||!sessionId||!reviewed||!verifiedAddress||!$('reviewed').checked||capabilities.signingAvailable!==true;
}
function resetReview(){reviewed=null;$('reviewed').checked=false;$('message').textContent='No challenge selected.';$('scope').textContent='';controls();}
function invalidate(message){
 const old=sessionId;epoch++;sessionId=null;verifiedAddress=null;busy=false;
 // Clear all user-visible evidence before calling any SDK or coordinator cleanup.
 $('deviceAddress').textContent='Not verified';resetReview();say(message);
 try{client.disconnect();}catch{}finally{dispose(sessionSub);dispose(discovery);dispose(addressSub);}
 sessionSub=discovery=addressSub=null;
 const reject=rejectAddress;rejectAddress=null;reject?.(Error('DISCONNECTED'));
 try{addressAction?.cancel();}catch{}addressAction=null;
 return old;
}
async function state(){const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error('SERVER_UNAVAILABLE');return r.json();}
async function refresh(){
 const current=epoch,s=await state();if(current!==epoch)return;
 capabilities=s.approvalCapabilities||{};
 $('authority').textContent=capabilities.configuredAuthority||'Not enrolled';
 $('gate').textContent=capabilities.signingAvailable?'Signing enabled for this local fixture scope. Each signature requires your explicit action.':'Signing disabled pending review. You can inspect challenges; no signature can be requested.';
 $('challenges').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Select a pending challenge';$('challenges').append(empty);
 for(const c of s.approvalChallenges||[]){if(c.status!=='pending')continue;const o=document.createElement('option');o.value=c.id;o.textContent=`${c.amountDecimal} fixture RLUSD · ${c.merchant} · ${c.id}`;$('challenges').append(o);}
 resetReview();
}
async function run(fn){if(busy)return;const current=epoch;busy=true;controls();try{await fn(current);}catch(e){if(current===epoch)say(`Stopped: ${e.message}. No automatic retry. If submission began, refresh to reconcile its outcome.`);}finally{if(current===epoch){busy=false;controls();}}}
$('refresh').onclick=()=>run(refresh);
$('challenges').onchange=resetReview;
$('reviewed').onchange=controls;
$('review').onclick=()=>run(async current=>{
 const next=await client.review($('challenges').value);if(current!==epoch)return;
 reviewed=next;$('reviewed').checked=false;$('message').textContent=next.challenge.message;
 $('scope').textContent=`${next.challenge.amountDecimal} fixture RLUSD to ${next.challenge.recipient}; expires ${next.challenge.expiresAtUtc}. Reserve only; no payment.`;
 say('Review the exact server-issued message. Device connection and on-device address verification are separate user actions.');
});
$('connect').onclick=()=>{
 if(busy||sessionId)return;
 if(!navigator.hid){say('Open this page in Chrome for WebHID.');return;}
 dmk??=new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
 const current=++epoch;let selected=false;busy=true;controls();
 const ended=()=>{if(current===epoch)invalidate('Device session ended. No further signature or submission will start.');};
 try{
  const sub=dmk.startDiscovering({}).subscribe({next:device=>{
   if(current!==epoch||selected)return;selected=true;dispose(discovery);discovery=null;
   (async()=>{try{
    const connected=await dmk.connect({device,sessionRefresherOptions:{isRefresherDisabled:true}});
    if(current!==epoch){try{await dmk.disconnect({sessionId:connected});}catch{}return;}
    sessionId=connected;
    const subscription=dmk.getDeviceSessionState({sessionId}).subscribe({next:s=>{if(s.deviceStatus==='NOT CONNECTED')ended();},error:ended,complete:ended});
    if(current!==epoch){dispose(subscription);return;}sessionSub=subscription;
    say('Connected. Open Ethereum, then explicitly verify the enrolled address on Flex.');
   }catch{ended();}finally{if(current===epoch){busy=false;controls();}}})();
  },error:ended,complete:()=>{if(!selected)ended();}});
  if(current===epoch&&!selected)discovery=sub;else dispose(sub);
 }catch{ended();}
};
$('verify').onclick=()=>run(async current=>{
 if(!sessionId)throw Error('NO_SESSION');
 verifiedAddress=null;$('deviceAddress').textContent='Not verified';
 const s=await state();if(current!==epoch)return;
 const expected=s.approvalCapabilities?.configuredAuthority;
 if(!expected)throw Error('NO_TRUSTED_AUTHORITY');
 const app=await dmk.sendCommand({sessionId,command:new GetAppAndVersionCommand()});
 if(current!==epoch)return;
 if(app.status!=='SUCCESS'||app.data.name!=='Ethereum')throw Error('OPEN_ETHEREUM_APP');
 if(app.data.version!==s.approvalCapabilities.observedEthereumApp)throw Error('APP_VERSION_CHANGED_REVIEW_REQUIRED');
 if(!s.approvalCapabilities.observedFirmware)throw Error('FIRMWARE_READINESS_UNKNOWN');
 addressAction=new SignerEthBuilder({dmk,sessionId}).build().getAddress(path,{checkOnDevice:true,returnChainCode:false,skipOpenApp:true,chainId:1449000});
 say('Verify this public address on Flex. This is not a signature.');
 let sub,settled=false;
 try{
  const address=await new Promise((resolve,reject)=>{
   const finish=(error,value)=>{if(settled)return;settled=true;dispose(sub);error?reject(error):resolve(value);};
   rejectAddress=error=>finish(error);
   sub=addressAction.observable.subscribe({next:r=>{if(current!==epoch)return finish(Error('DISCONNECTED'));if(r.status==='completed')finish(null,r.output?.address);else if(r.status==='error'||r.status==='stopped')finish(Error('ADDRESS_REJECTED'));},error:()=>finish(Error('ADDRESS_FAILED')),complete:()=>finish(Error('ADDRESS_INCOMPLETE'))});
   if(settled)dispose(sub);else addressSub=sub;
  });
  if(current!==epoch)return;
  if(typeof address!=='string'||address.toLowerCase()!==expected.toLowerCase())throw Error('WRONG_DEVICE_ADDRESS');
  verifiedAddress=address;$('deviceAddress').textContent=address;
  say('On-device address matches the enrolled approver. Review a challenge; signing remains separately controlled.');
 }finally{dispose(sub);if(current===epoch){addressAction=null;addressSub=null;rejectAddress=null;}}
});
$('sign').onclick=()=>run(async current=>{
 if(!sessionId||!reviewed||!verifiedAddress||!$('reviewed').checked||!capabilities.signingAvailable)throw Error('SIGNING_NOT_READY');
 const selected=reviewed;$('reviewed').checked=false;
 say('Review the complete message on Flex. Reject unreadable or hash-only prompts. No funds move.');
 const outcome=await client.signReviewed({reviewed:selected,verifiedDeviceAddress:verifiedAddress,signer:new SignerEthBuilder({dmk,sessionId}).build(),path,readiness:{trustedApproverConfirmed:true,firmwareVerified:!!capabilities.observedFirmware,ethereumAppVerified:true,readableAsciiReviewVerified:true}});
 if(current!==epoch)return;
 resetReview();say(`Server verified and consumed this one local exception. Reservation ${outcome.reservationId}. Original request remains blocked; no payment submitted. Hardware provenance is not independently proven.`);
});
$('deny').onclick=()=>run(async current=>{
 if(!reviewed)return;client.cancel();const id=reviewed.challenge.id;
 const r=await fetch('/api/approvals/deny',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:id})});
 if(current!==epoch)return;if(!r.ok)throw Error('DENIAL_NOT_CONFIRMED');resetReview();say('Challenge denied. Original request remains blocked.');
});
$('cancel').onclick=async()=>{
 const old=invalidate('Local operation cancelled. If submission already began, refresh to reconcile the server outcome.');const current=epoch;
 try{if(old)await dmk.disconnect({sessionId:old});}catch{if(current===epoch)say('Local state cleared. USB disconnect failed; unplug before reconnecting.');}
};
controls();refresh().catch(()=>say('Server state unavailable. No device action started.'));
