import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedSubmitter,GAS_BUDGET_WEI} from './bounded-submitter.mjs';
const tx={to:'0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91',data:'0x1234',value:0n};
function fixture({chain=1449000n,gas=100000n,fee=1000000000n}={}){const calls=[];const wallet={address:'0x0000000000000000000000000000000000000001',sendTransaction:async t=>{calls.push(t);return {hash:'fixture'};}};const provider={getNetwork:async()=>({chainId:chain}),estimateGas:async()=>gas,getFeeData:async()=>({maxFeePerGas:fee,maxPriorityFeePerGas:1n})};return {submitter:boundedSubmitter(wallet,provider),calls};}
test('explicit fees and padded gas bind transaction below budget',async()=>{const f=fixture();await f.submitter.sendTransaction(tx);assert.equal(f.calls.length,1);const t=f.calls[0];assert.equal(t.gasLimit,120000n);assert.equal(t.chainId,1449000);assert.equal(t.type,2);assert.ok(t.gasLimit*t.maxFeePerGas<=GAS_BUDGET_WEI);});
test('over-budget estimate cannot reach signing/broadcast',async()=>{const f=fixture({gas:10000000n});await assert.rejects(f.submitter.sendTransaction(tx),/GAS_BUDGET_EXCEEDED/);assert.equal(f.calls.length,0);});
test('wrong network, destination, value and fee overrides fail closed',async()=>{for(const [options,request] of [[{chain:1n},tx],[{}, {...tx,to:'0x0'}],[{}, {...tx,value:1n}],[{}, {...tx,gasLimit:1n}]]){const f=fixture(options);await assert.rejects(f.submitter.sendTransaction(request));assert.equal(f.calls.length,0);}});
test('missing fee data fails closed',async()=>{const f=fixture({fee:null});await assert.rejects(f.submitter.sendTransaction(tx),/FEE_DATA_UNAVAILABLE/);assert.equal(f.calls.length,0);});
