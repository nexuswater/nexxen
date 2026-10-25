import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('browser.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const elements=new Map();const calls=[];let output;const sessions=[];let rejectDisconnect=false;let disposed=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:''});return elements.get(id);};
  const dmk={startDiscovering(){calls.push('discover');return{subscribe(observer){queueMicrotask(()=>observer.next({}));return{unsubscribe(){}};}};},async connect(){calls.push('connect');return 'session';},async disconnect(){calls.push('disconnect');if(rejectDisconnect)throw Error('USB failure');},getDeviceSessionState(){return{subscribe(observer){sessions.push(observer);return{unsubscribe(){disposed++;}};}};},async sendCommand({command}){return{status:'SUCCESS',data:command.kind==='app'?{name:'Ethereum',version:'test-only'}:{seVersion:'test-only'}};}};
  class Builder{addTransport(){return this;}build(){return dmk;}}
  class Signer{build(){return{getAddress(path,options){calls.push({path,options});return{observable:{subscribe(observer){output=observer;return{unsubscribe(){disposed++;}};}},cancel(){output?.next({status:'stopped'});}};}};}}
  vm.runInNewContext(source,{document:{getElementById:el},navigator:{hid:{}},DeviceManagementKitBuilder:Builder,webHidTransportFactory:{},SignerEthBuilder:Signer,GetAppAndVersionCommand:class{kind='app';},GetOsVersionCommand:class{kind='firmware';}});
  return{el,calls,sessions,emit:state=>output.next(state),complete:()=>output.complete(),rejectDisconnect:()=>{rejectDisconnect=true;},disposed:()=>disposed};
}
test('no hardware on load; user address read requires on-device check and stays untrusted',async()=>{
  const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.el('address').disabled,true);
  f.el('connect').onclick();await tick();await f.el('app').onclick();
  const pending=f.el('address').onclick();await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),{path:"44'/60'/0'/0/0",options:{checkOnDevice:true,returnChainCode:false,skipOpenApp:true,chainId:1449000}});
  f.emit({status:'completed',output:{address:'0x'+'12'.repeat(20)}});await pending;
  assert.match(f.el('status').textContent,/NOT enrolled or trusted/);
});
test('cancel and late completion cannot retain a verified address',async()=>{
  const f=fixture();f.el('connect').onclick();await tick();await f.el('app').onclick();
  const pending=f.el('address').onclick();await tick();await f.el('disconnect').onclick();
  f.emit({status:'completed',output:{address:'0x'+'12'.repeat(20)}});await pending;
  assert.equal(f.el('addressValue').textContent,'Not verified');assert.equal(f.el('address').disabled,true);
});

async function connected(){const f=fixture();f.el('connect').onclick();await tick();await f.el('firmware').onclick();await f.el('app').onclick();return f;}
async function addressDone(f){const pending=f.el('address').onclick();await tick();f.emit({status:'completed',output:{address:'0x'+'12'.repeat(20)}});await pending;}
test('physical unplug clears all observed evidence and disables reads',async()=>{
 const f=await connected();await addressDone(f);f.sessions[0].next({deviceStatus:'NOT CONNECTED'});
 for(const id of ['firmwareValue','appValue'])assert.equal(f.el(id).textContent,'Unknown');
 assert.equal(f.el('addressValue').textContent,'Not verified');assert.equal(f.el('address').disabled,true);assert.equal(f.el('connect').disabled,false);
});
test('disconnect rejection still clears session immediately',async()=>{
 const f=await connected();await addressDone(f);f.rejectDisconnect();const pending=f.el('disconnect').onclick();
 assert.equal(f.el('addressValue').textContent,'Not verified');assert.equal(f.el('appValue').textContent,'Unknown');await pending;
 assert.match(f.el('status').textContent,/disconnect failed/);assert.equal(f.el('connect').disabled,false);
});
test('old session events cannot invalidate a new connection',async()=>{
 const f=await connected();const old=f.sessions[0];await f.el('disconnect').onclick();f.el('connect').onclick();await tick();await f.el('app').onclick();
 old.next({deviceStatus:'NOT CONNECTED'});old.complete();old.error(Error());
 assert.equal(f.el('appValue').textContent,'Ethereum test-only');assert.equal(f.el('address').disabled,false);
});
test('address completion without terminal state releases busy and disposes subscription',async()=>{
 const f=await connected();const before=f.disposed();const pending=f.el('address').onclick();await tick();f.complete();await pending;
 assert.equal(f.el('addressValue').textContent,'Not verified');assert.equal(f.el('app').disabled,false);assert.ok(f.disposed()>before);
});
test('session completion cancels in-flight address and ignores its late result',async()=>{
 const f=await connected();const pending=f.el('address').onclick();await tick();f.sessions[0].complete();await pending;
 f.emit({status:'completed',output:{address:'0x'+'34'.repeat(20)}});
 assert.equal(f.el('addressValue').textContent,'Not verified');assert.equal(f.el('connect').disabled,false);
});
