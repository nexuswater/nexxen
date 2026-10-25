import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
test('missing approval assets return sanitized 503 and server remains alive',async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'nexxen-missing-assets-'));
 for(const name of ['server.mjs','lib','adapters','evidence'])cpSync(join(root,name),join(dir,name),{recursive:true});
 symlinkSync(join(root,'node_modules'),join(dir,'node_modules'),'dir');
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'32121',HOST:'127.0.0.1',NEXXEN_DB:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Test server exited')));});
  for(const route of ['/approval/approval.js','/approval']){
   const r=await fetch('http://127.0.0.1:32121'+route);assert.equal(r.status,503);
   const body=await r.json();assert.match(body.error,/assets unavailable/);assert.doesNotMatch(body.error,/ENOENT|\/Users|stack/);
   assert.equal((await fetch('http://127.0.0.1:32121/api/state')).status,200);assert.equal(child.exitCode,null);
  }
 }finally{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}rmSync(dir,{recursive:true,force:true});}
});
