import test from 'node:test';import assert from 'node:assert/strict';import {prepareLedgerMessageAction} from './ledger-message.mjs';
const readiness={trustedApproverConfirmed:true,firmwareVerified:true,ethereumAppVerified:true,readableAsciiReviewVerified:true};
const message='NEXXEN LOCAL FIXTURE POLICY APPROVAL v1\nrequestId: fixture';
function fixture(){let observer,cancelled=0,calls=0;const signer={signMessage:(path,text)=>{calls++;assert.equal(text,message);return {observable:{subscribe:o=>{observer=o;return {unsubscribe(){}};}},cancel:()=>{cancelled++;}};}};const a=prepareLedgerMessageAction({signer,path:"44'/60'/0'/0/0",message,readiness});return {a,emit:s=>observer.next(s),get calls(){return calls;},get cancelled(){return cancelled;}};}
test('Ledger guard refuses missing readiness, hex/hash-only messages and unsupported paths before signer call',()=>{for(const args of [{readiness:{}},{message:'0x'+'0'.repeat(64)},{path:'invalid'}])assert.throws(()=>prepareLedgerMessageAction({signer:{signMessage(){assert.fail();}},path:"44'/60'/0'/0/0",message,readiness,...args}));});
test('only Completed yields an unverified candidate, never spending approval',async()=>{const f=fixture();assert.equal(f.calls,0);const promise=f.a.start();f.emit({status:'pending'});f.emit({status:'completed',output:{r:'0x'+'1'.repeat(64),s:'0x'+'2'.repeat(64),v:27}});assert.deepEqual(await promise,{candidateSignature:{r:'0x'+'1'.repeat(64),s:'0x'+'2'.repeat(64),v:27},verified:false,hardwareProven:false});assert.equal(f.calls,1);});
test('error, stopped, cancellation and disconnect reject; late completion cannot restore approval',async()=>{for(const kind of ['error','stopped','cancel','disconnect']){const f=fixture(),p=f.a.start();if(kind==='cancel'||kind==='disconnect')f.a[kind]();else f.emit({status:kind});f.emit({status:'completed',output:{}});await assert.rejects(p);assert.ok(f.cancelled>=1);}});
test('throwing SDK cancel still rejects, disposes and fences late completion',async()=>{
 let observer,disposed=0;
 const signer={signMessage(){return{observable:{subscribe(o){observer=o;return{unsubscribe(){disposed++;}};}},cancel(){throw Error('USB disappeared');}};}};
 const a=prepareLedgerMessageAction({signer,path:"44'/60'/0'/0/0",message,readiness}),pending=a.start();
 assert.doesNotThrow(()=>a.disconnect());await assert.rejects(pending,/DEVICE_DISCONNECTED/);assert.equal(disposed,1);
 observer.next({status:'completed',output:{r:'0x'+'1'.repeat(64),s:'0x'+'2'.repeat(64),v:27}});assert.equal(disposed,1);
});
