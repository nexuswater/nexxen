import {DeviceManagementKitBuilder, GetOsVersionCommand, GetAppAndVersionCommand} from '@ledgerhq/device-management-kit';
import {webHidTransportFactory} from '@ledgerhq/device-transport-kit-web-hid';
import {SignerEthBuilder} from '@ledgerhq/device-signer-kit-ethereum';

// Readiness only: no signing, enrollment, approval API or persistent storage.
const $ = id => document.getElementById(id);
let dmk, sessionId, discovery, sessionSubscription, action, actionSubscription;
let rejectAction, busy=false, ethereum=false, generation=0;
const say = text => { $('status').textContent=text; };
const dispose = subscription => { try { subscription?.unsubscribe(); } catch {} };
function controls(){
  for(const id of ['firmware','app','address']) $(id).disabled=busy||!sessionId||(id==='address'&&!ethereum);
  $('connect').disabled=busy||!!sessionId;
}
function clearEvidence(){
  ethereum=false;
  $('addressValue').textContent='Not verified';
  $('firmwareValue').textContent='Unknown';
  $('appValue').textContent='Unknown';
}
// Invalidate synchronously, before any SDK operation that may reject or hang.
function invalidate(message){
  const oldSession=sessionId;
  generation++; sessionId=null; busy=false; clearEvidence();
  const oldAction=action; action=null;
  const reject=rejectAction; rejectAction=null;
  dispose(actionSubscription); actionSubscription=null;
  dispose(discovery); discovery=null;
  dispose(sessionSubscription); sessionSubscription=null;
  reject?.(Error('Session ended'));
  try { oldAction?.cancel(); } catch {}
  controls(); say(message);
  return oldSession;
}
async function run(fn){
  if(busy||!sessionId)return;
  const current=generation;
  busy=true;controls();
  try{await fn(current);}catch{
    if(current===generation){clearEvidence();say('Read failed or cancelled. No approval or signature was made. Retry explicitly.');}
  }finally{if(current===generation){busy=false;controls();}}
}
async function command(cmd,current){
  const r=await dmk.sendCommand({sessionId,command:cmd});
  if(current!==generation||!sessionId)throw Error('Disconnected');
  if(r.status!=='SUCCESS')throw Error('Device read failed');
  return r.data;
}
function watchSession(current){
  const ended=()=>{if(current===generation)invalidate('Device session ended. Spending remains blocked.');};
  const sub=dmk.getDeviceSessionState({sessionId}).subscribe({
    next:s=>{if(current===generation&&s.deviceStatus==='NOT CONNECTED')ended();},
    error:ended, complete:ended,
  });
  if(current===generation)sessionSubscription=sub;else dispose(sub);
}
$('connect').onclick=()=>{
  if(busy||sessionId)return;
  if(!navigator.hid){say('Use Chrome on this Mac: WebHID is unavailable in this browser.');return;}
  dmk??=new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
  const current=++generation;let selected=false;
  busy=true;clearEvidence();controls();say('Choose your Ledger in the browser device picker. This grants this local page USB access.');
  const failed=()=>{if(current===generation)invalidate('Device selection cancelled or unavailable. Nothing signed.');};
  try{
    const sub=dmk.startDiscovering({}).subscribe({
      next:device=>{
        if(current!==generation||selected)return;
        selected=true;dispose(discovery);discovery=null;
        (async()=>{
          try{
            const connected=await dmk.connect({device,sessionRefresherOptions:{isRefresherDisabled:true}});
            if(current!==generation){try{await dmk.disconnect({sessionId:connected});}catch{}return;}
            sessionId=connected;watchSession(current);
            if(current===generation)say('Connected. Business authority is not established. Read firmware on the dashboard, then manually open Ethereum.');
          }catch{failed();}
          finally{if(current===generation){busy=false;controls();}}
        })();
      }, error:failed, complete:()=>{if(!selected)failed();},
    });
    if(current===generation&&!selected)discovery=sub;else dispose(sub);
  }catch{failed();}
};
$('firmware').onclick=()=>run(async current=>{
  const r=await command(new GetOsVersionCommand(),current);
  $('firmwareValue').textContent=r.seVersion;say('Firmware version read from device. This is not an authenticity attestation.');
});
$('app').onclick=()=>run(async current=>{
  const r=await command(new GetAppAndVersionCommand(),current);
  $('addressValue').textContent='Not verified';
  $('appValue').textContent=`${r.name} ${r.version}`;ethereum=r.name==='Ethereum';
  say(ethereum?'Ethereum observed. You may request on-device public-address verification.':'Open Ethereum manually, then read the app again.');
});
$('address').onclick=()=>run(async current=>{
  $('addressValue').textContent='Not verified';
  const r=await command(new GetAppAndVersionCommand(),current);
  if(r.name!=='Ethereum')throw Error('Ethereum required');
  const signer=new SignerEthBuilder({dmk,sessionId}).build();
  const localAction=signer.getAddress("44'/60'/0'/0/0",{checkOnDevice:true,returnChainCode:false,skipOpenApp:true,chainId:1449000});
  action=localAction;
  say('Check the public address on your Flex. No message or transaction signing is requested.');
  let sub,settled=false;
  try{
    const address=await new Promise((resolve,reject)=>{
      const finish=(error,value)=>{if(settled)return;settled=true;dispose(sub);error?reject(error):resolve(value);};
      rejectAction=error=>finish(error);
      sub=localAction.observable.subscribe({
        next:s=>{
          if(current!==generation)return finish(Error('Disconnected'));
          if(s.status==='completed'){
            if(!/^0x[0-9a-fA-F]{40}$/.test(s.output?.address))return finish(Error('Invalid address'));
            finish(null,s.output.address);
          }else if(s.status==='error'||s.status==='stopped')finish(Error('Address read stopped'));
        },error:()=>finish(Error('Address read failed')),
        complete:()=>finish(Error('Address read ended without a result')),
      });
      if(settled)dispose(sub);else actionSubscription=sub;
    });
    if(current!==generation||!sessionId)throw Error('Disconnected');
    $('addressValue').textContent=address;
    say('Address display completed on-device. This address is NOT enrolled or trusted as business authority.');
  }finally{
    dispose(sub);
    if(current===generation){action=null;actionSubscription=null;rejectAction=null;}
  }
});
$('disconnect').onclick=async()=>{
  const old=invalidate('Disconnected locally. Spending remains blocked.');
  const current=generation;
  try{if(old)await dmk.disconnect({sessionId:old});}
  catch{if(current===generation)say('Local state cleared; device disconnect failed. Unplug the device before reconnecting. Spending remains blocked.');}
  finally{if(current===generation)controls();}
};
controls();
