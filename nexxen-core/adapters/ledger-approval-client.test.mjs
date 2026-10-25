import test from 'node:test';import assert from 'node:assert/strict';
import {createLedgerApprovalClient} from './ledger-approval-client.mjs';
const authority='0x'+'12'.repeat(20),path="44'/60'/0'/0/0";
const readiness={trustedApproverConfirmed:true,firmwareVerified:true,ethereumAppVerified:true,readableAsciiReviewVerified:true};
function fixture(){let observer;const requests=[];const state={approvalCapabilities:{configuredAuthority:authority,maximumMinor:2,signingAvailable:true},approvalChallenges:[{id:'test',status:'pending',expiresAt:100,expectedAuthority:authority,chainId:1449000,exception:'PER_REQUEST_LIMIT_ONLY',currency:'RLUSD fixture hundredths',amountMinor:2,message:'NEXXEN LOCAL FIXTURE POLICY APPROVAL v1\nfixture: test only'}]};
 const client=createLedgerApprovalClient({clock:()=>1000,fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>url==='/api/state'?structuredClone(state):{status:'consumed',mode:'simulation',paymentSubmitted:false}};}});
 const signer={signMessage(p,m){requests.push({p,m});return{observable:{subscribe(o){observer=o;return{unsubscribe(){}};}},cancel(){observer?.next({status:'stopped'});}};}};
 return{client,state,requests,signer,finish:()=>observer.next({status:'completed',output:{r:'0x'+'01'.repeat(32),s:'0x'+'02'.repeat(32),v:0}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('unconfigured authority prevents even challenge review',async()=>{const f=fixture();f.state.approvalCapabilities.configuredAuthority=null;await assert.rejects(f.client.review('test'),/NOT_ENROLLED/);});
test('wrong displayed device address never signs',async()=>{const f=fixture(),reviewed=await f.client.review('test');await assert.rejects(f.client.signReviewed({reviewed,verifiedDeviceAddress:'0x'+'34'.repeat(20),signer:f.signer,path,readiness}),/ADDRESS_MISMATCH/);assert.equal(f.requests.some(r=>r.p),false);});
test('exact server message signs and only signature plus ID are submitted',async()=>{const f=fixture(),reviewed=await f.client.review('test');const pending=f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness});await tick();f.finish();await pending;const post=f.requests.find(r=>r.options?.method==='POST');assert.deepEqual(Object.keys(JSON.parse(post.options.body)).sort(),['challengeId','signature']);assert.equal(f.requests.find(r=>r.p).m,reviewed.challenge.message);});
test('denial during device review prevents submission',async()=>{const f=fixture(),reviewed=await f.client.review('test');const pending=f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness});await tick();f.state.approvalChallenges[0].status='denied';f.finish();await assert.rejects(pending,/NOT_PENDING/);assert.equal(f.requests.some(r=>r.options?.method==='POST'),false);});
test('disconnect cancels action and never submits late result',async()=>{const f=fixture(),reviewed=await f.client.review('test');const pending=f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness});await tick();f.client.disconnect();await assert.rejects(pending);f.finish();assert.equal(f.requests.some(r=>r.options?.method==='POST'),false);});
test('tampered reviewed message is rejected before device call',async()=>{const f=fixture(),original=await f.client.review('test');const reviewed={...original,challenge:{...original.challenge,message:original.challenge.message+'\namount: 999'}};await assert.rejects(f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness}),/REVIEW_CHANGED/);assert.equal(f.requests.some(r=>r.p),false);});
test('expired server challenge cannot be signed',async()=>{const f=fixture(),reviewed=await f.client.review('test');f.state.approvalChallenges[0].expiresAt=1;await assert.rejects(f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness}),/NOT_PENDING/);});
test('disabled server readiness prevents signing even with enrolled authority',async()=>{const f=fixture(),reviewed=await f.client.review('test');f.state.approvalCapabilities.signingAvailable=false;await assert.rejects(f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness}),/NOT_ENABLED/);assert.equal(f.requests.some(r=>r.p),false);});
test('consumed challenge cannot be replayed',async()=>{const f=fixture(),reviewed=await f.client.review('test');f.state.approvalChallenges[0].status='consumed';await assert.rejects(f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer:f.signer,path,readiness}),/NOT_PENDING/);});
test('throwing SDK cancel cannot leave active operation or permit stale submission',async()=>{
 const f=fixture(),reviewed=await f.client.review('test');let observer;
 const signer={signMessage(){return{observable:{subscribe(o){observer=o;return{unsubscribe(){}};}},cancel(){throw Error('USB lost');}};}};
 const pending=f.client.signReviewed({reviewed,verifiedDeviceAddress:authority,signer,path,readiness});await tick();
 assert.doesNotThrow(()=>f.client.disconnect());await assert.rejects(pending);
 observer.next({status:'completed',output:{r:'0x'+'1'.repeat(64),s:'0x'+'2'.repeat(64),v:27}});
 assert.equal(f.requests.some(r=>r.options?.method==='POST'),false);
});
