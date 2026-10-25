/** Public GET + read-only chain RPC only. Never loads .env or a signer. */
import {readFile} from 'node:fs/promises';import {verifyAp4mReceipt,validateExpectedOrder,validatePinnedContext} from '../../adapters/ap4m-receipt.mjs';
import {selectProvider,provenance,assertChain,rpcTransport,PROVIDER_ERRORS} from './provider.mjs';
import {createBoundedLogReader,createFreeTierLogReader} from './log-pagination.mjs';
const API='https://hackathon.ap4m.build';
const freeTierScan=process.env.AP4M_QUICKNODE_FREE_TIER_SCAN==='true';
const args=process.argv.slice(2);let provider,providerInfo,deadline;const abort=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort());
try{
 if(args.length!==1)throw new Error('EXPECTED_ORDER_JSON_PATH_REQUIRED');
 const order=validateExpectedOrder(JSON.parse(await readFile(args[0],'utf8')));
 const config=selectProvider(process.env);providerInfo=provenance(config);
 let sdk,ethers;try{sdk=await import('@ap4m/sdk/claim-receipt');({ethers}=await import('ethers'));const pkg=JSON.parse(await readFile(new URL('./node_modules/@ap4m/sdk/package.json',import.meta.url),'utf8'));if(pkg.version!=='0.10.1'||ethers.version!=='6.17.0')throw 0;}catch{throw new Error('PINNED_DEPENDENCIES_NOT_INSTALLED');}
 const request=new ethers.FetchRequest(config.url);request.timeout=15000;request.retryFunc=async()=>false;const transport=rpcTransport({signal:abort.signal});let totalRpcCalls=0,lastRpcStart=0,rpcGate=Promise.resolve();const scanStarted=Date.now();request.getUrlFunc=async(...args)=>{if(freeTierScan){const turn=rpcGate.then(async()=>{await new Promise(resolve=>setTimeout(resolve,Math.max(0,lastRpcStart+110-Date.now())));lastRpcStart=Date.now();});rpcGate=turn.catch(()=>{});await turn;}if(freeTierScan&&(totalRpcCalls>=8000||Date.now()-scanStarted>=900000))throw Error('RPC_SCAN_BUDGET_EXCEEDED');totalRpcCalls++;return transport(...args);};
 provider=new ethers.JsonRpcProvider(request,1449000,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
 await assertChain(provider);
 async function publicJson(path){let r;try{r=await fetch(API+path,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!r.ok)throw 0;const text=await r.text();if(text.length>1_000_000)throw 0;return JSON.parse(text);}catch{throw new Error('PUBLIC_RECEIPT_OR_CONTEXT_UNAVAILABLE');}}
 const published=await publicJson('/public/evidence/context');if(published.schemaId!=='ap4m.hackathon-service.evidence-context.v1')throw new Error('PUBLIC_CONTEXT_SCHEMA_MISMATCH');
 const context=validatePinnedContext(sdk.parseClaimReceiptContext(published.receipt));
 const receipt=await publicJson('/public/evidence/claims/'+order.claimId.toLowerCase()+'/'+order.settlementDigest.toLowerCase()+'.json');
 // SDK state, receipt, logs and canonicality fences all use fresh RPC reads.
 if(freeTierScan&&config.identity!=='quicknode-xrpl-evm-testnet')throw Error('QUICKNODE_SCAN_PROVIDER_REQUIRED');
 // Authoritative verification always uses fresh RPC reads. Unkeyed local cache
 // digests cannot authenticate log contents, even when block anchors match.
 const pageCache=undefined;
 const scanLogs=config.identity==='quicknode-xrpl-evm-testnet'?(freeTierScan?createFreeTierLogReader(f=>provider.getLogs(f),{signal:abort.signal,pageCache,onProgress:p=>console.error(JSON.stringify({...p,totalRpcCalls,cache:pageCache?.stats()})),onFailure:p=>console.error(JSON.stringify(p))}):createBoundedLogReader(f=>provider.getLogs(f))):f=>provider.getLogs(f);
 const readLogs=scanLogs;
 const readOnlyProvider=Object.freeze({send:(method,params)=>{if(method!=='eth_chainId'||params.length)throw new Error('READ_ONLY_RPC_METHOD_REQUIRED');return provider.send(method,params);},getBlock:n=>provider.getBlock(n),getBlockNumber:()=>provider.getBlockNumber(),getTransactionReceipt:h=>provider.getTransactionReceipt(h),getLogs:readLogs,call:t=>provider.call(t)});
 const result=await Promise.race([verifyAp4mReceipt({provider:readOnlyProvider,sdk,context,receipt,order}),new Promise((_,reject)=>{deadline=setTimeout(()=>{abort.abort();reject(Error('VERIFICATION_TIMEOUT'));},freeTierScan?900000:90000);})]);
 console.log(JSON.stringify({...result,scanStatistics:{totalRpcCalls,cache:pageCache?.stats()},source:'public-service-plus-read-only-chain-verification',providerProvenance:providerInfo,checkedAgainst:{chainId:context.chainId,ledger:context.ledger,vault:context.vault,token:context.token,environmentManifestDigest:context.environmentManifestDigest,vaultConfigurationId:context.vaultConfigurationId,confirmationBlocks:context.confirmationBlocks},authorizationAttempted:false},null,2));
}catch(e){const allowed=new Set([...PROVIDER_ERRORS,'EXPLICIT_EXPECTED_ORDER_REQUIRED','FIXTURE_ORDER_REJECTED','EXPECTED_ORDER_JSON_PATH_REQUIRED','PINNED_DEPENDENCIES_NOT_INSTALLED','PUBLIC_RECEIPT_OR_CONTEXT_UNAVAILABLE','PUBLIC_CONTEXT_SCHEMA_MISMATCH','PUBLIC_CONTEXT_DEPLOYMENT_MISMATCH','WRONG_RPC_CHAIN','NOT_A_PUBLIC_CLAIM_RECEIPT','RECEIPT_ORDER_MISMATCH','SDK_CHAIN_VERIFICATION_FAILED','SDK_FINALITY_NOT_VERIFIED','PAYOUT_TRANSACTION_CHANGED','AMBIGUOUS_TOKEN_TRANSFER','EXACT_TRANSFER_NOT_VERIFIED','PAYOUT_CANONICAL_FENCE_FAILED']);console.error(JSON.stringify({verified:false,error:allowed.has(e?.code||e?.message)?(e.code||e.message):'READ_ONLY_VERIFICATION_FAILED',readOnly:true,providerProvenance:providerInfo,sandboxFundingPerformed:false,authorizationAttempted:false}));process.exitCode=1;}finally{clearTimeout(deadline);abort.abort();provider?.destroy();}
