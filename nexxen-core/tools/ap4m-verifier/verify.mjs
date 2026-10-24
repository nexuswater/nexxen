/** Public GET + read-only chain RPC only. Never loads .env or a signer. */
import {readFile} from 'node:fs/promises';import {verifyAp4mReceipt,validateExpectedOrder,validatePinnedContext} from '../../adapters/ap4m-receipt.mjs';
const API='https://hackathon.ap4m.build',RPC='https://rpc.testnet.xrplevm.org';
const args=process.argv.slice(2);let provider;
try{
 if(args.length!==1)throw new Error('EXPECTED_ORDER_JSON_PATH_REQUIRED');
 const order=validateExpectedOrder(JSON.parse(await readFile(args[0],'utf8')));
 let sdk,ethers;try{sdk=await import('@ap4m/sdk/claim-receipt');({ethers}=await import('ethers'));const pkg=JSON.parse(await readFile(new URL('./node_modules/@ap4m/sdk/package.json',import.meta.url),'utf8'));if(pkg.version!=='0.10.1'||ethers.version!=='6.17.0')throw 0;}catch{throw new Error('PINNED_DEPENDENCIES_NOT_INSTALLED');}
 async function publicJson(path){let r;try{r=await fetch(API+path,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!r.ok)throw 0;const text=await r.text();if(text.length>1_000_000)throw 0;return JSON.parse(text);}catch{throw new Error('PUBLIC_RECEIPT_OR_CONTEXT_UNAVAILABLE');}}
 const published=await publicJson('/public/evidence/context');if(published.schemaId!=='ap4m.hackathon-service.evidence-context.v1')throw new Error('PUBLIC_CONTEXT_SCHEMA_MISMATCH');
 const context=validatePinnedContext(sdk.parseClaimReceiptContext(published.receipt));
 const receipt=await publicJson('/public/evidence/claims/'+order.claimId.toLowerCase()+'/'+order.settlementDigest.toLowerCase()+'.json');
 // Cache disabled so SDK canonicality fences and fresh chain checks reach the node.
 provider=new ethers.JsonRpcProvider(RPC,undefined,{cacheTimeout:-1,batchMaxCount:1});
 const readOnlyProvider=Object.freeze({send:(method,params)=>{if(method!=='eth_chainId'||params.length)throw new Error('READ_ONLY_RPC_METHOD_REQUIRED');return provider.send(method,params);},getBlock:n=>provider.getBlock(n),getBlockNumber:()=>provider.getBlockNumber(),getTransactionReceipt:h=>provider.getTransactionReceipt(h),getLogs:f=>provider.getLogs(f),call:t=>provider.call(t)});
 const result=await verifyAp4mReceipt({provider:readOnlyProvider,sdk,context,receipt,order});
 console.log(JSON.stringify({...result,source:'public-service-plus-read-only-chain-verification',checkedAgainst:{chainId:context.chainId,ledger:context.ledger,vault:context.vault,token:context.token,environmentManifestDigest:context.environmentManifestDigest,vaultConfigurationId:context.vaultConfigurationId,confirmationBlocks:context.confirmationBlocks},authorizationAttempted:false},null,2));
}catch(e){const allowed=new Set(['EXPLICIT_EXPECTED_ORDER_REQUIRED','FIXTURE_ORDER_REJECTED','EXPECTED_ORDER_JSON_PATH_REQUIRED','PINNED_DEPENDENCIES_NOT_INSTALLED','PUBLIC_RECEIPT_OR_CONTEXT_UNAVAILABLE','PUBLIC_CONTEXT_SCHEMA_MISMATCH','PUBLIC_CONTEXT_DEPLOYMENT_MISMATCH','WRONG_RPC_CHAIN','NOT_A_PUBLIC_CLAIM_RECEIPT','RECEIPT_ORDER_MISMATCH','SDK_CHAIN_VERIFICATION_FAILED','SDK_FINALITY_NOT_VERIFIED','PAYOUT_TRANSACTION_CHANGED','AMBIGUOUS_TOKEN_TRANSFER','EXACT_TRANSFER_NOT_VERIFIED','PAYOUT_CANONICAL_FENCE_FAILED']);console.error(JSON.stringify({verified:false,error:allowed.has(e?.code||e?.message)?(e.code||e.message):'READ_ONLY_VERIFICATION_FAILED',readOnly:true,sandboxFundingPerformed:false,authorizationAttempted:false}));process.exitCode=1;}finally{provider?.destroy();}
