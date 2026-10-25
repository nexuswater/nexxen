import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('browser clears displayed evidence even if client disconnect throws',async()=>{
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',checked:false,replaceChildren(){},append(){}});return nodes.get(id);};
 const source=readFileSync(new URL('../tools/ledger-approval/browser.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{document:{getElementById:el,createElement:()=>({})},fetch:async()=>({ok:true,json:async()=>({approvalCapabilities:{signingAvailable:false},approvalChallenges:[]})}),createLedgerApprovalClient:()=>({disconnect(){throw Error('Cancellation failed');}})});
 await new Promise(resolve=>setImmediate(resolve));
 el('deviceAddress').textContent='previous verified address';el('message').textContent='old challenge';el('reviewed').checked=true;
 await assert.doesNotReject(el('cancel').onclick());
 assert.equal(el('deviceAddress').textContent,'Not verified');assert.equal(el('message').textContent,'No challenge selected.');assert.equal(el('reviewed').checked,false);assert.equal(el('sign').disabled,true);
});
