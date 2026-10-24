/** Read-only receipt binding. SDK verifier performs the actual on-chain evidence checks. */
import {PUBLIC_DEPLOYMENT_SNAPSHOT as deployment} from './ap4m-prepare.mjs';
/** Public evidence context captured 2026-10-24 22:07:55 UTC; deployment change requires review. */
export const RECEIPT_CONTEXT_SNAPSHOT=Object.freeze({environmentManifestDigest:'0x0ebaddb9abe66502618e5665edd04135407e77a99284a7918bc2bd416815965d',vaultConfigurationId:'0x9da206a6ad13739a526c90dee2cf62422efc0fd985e1f232af4d34f946855b4d',chainId:'1449000',ledger:deployment.paymentLedger,vault:deployment.pooledEscrowVault,token:deployment.rlusdToken,vaultDeploymentBlock:9192133,confirmationBlocks:1});
const HASH=/^0x(?!0{64}$)[a-fA-F0-9]{64}$/,ADDRESS=/^0x(?!0{40}$)[a-fA-F0-9]{40}$/;
// Full canonical ERC20 topic (kept literal, no event-name guessing).
export const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const reject=code=>{const e=new Error(code);e.code=code;throw e;};
const topic=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
export function validateExpectedOrder(order){
 if(!order||!['claimId','channelId','settlementDigest'].every(k=>HASH.test(order[k]||''))||!ADDRESS.test(order.payout||'')||typeof order.expectedRlusdBaseUnits!=='string'||! /^[1-9]\d*$/.test(order.expectedRlusdBaseUnits)||BigInt(order.expectedRlusdBaseUnits)>=2n**256n)reject('EXPLICIT_EXPECTED_ORDER_REQUIRED');
 if(order.fixture===true||order.simulated===true||order.demo===true)reject('FIXTURE_ORDER_REJECTED');
 return order;
}
export function validatePinnedContext(context){
 if(!context||Object.entries(RECEIPT_CONTEXT_SNAPSHOT).some(([key,value])=>typeof value==='string'?!eq(context[key],value):context[key]!==value))reject('PUBLIC_CONTEXT_DEPLOYMENT_MISMATCH');
 return context;
}
/** provider must be a read-only ethers-compatible provider; sdk.verifyClaimReceipt is mandatory. */
export async function verifyAp4mReceipt({provider,sdk,context,receipt,order}){
 validateExpectedOrder(order);validatePinnedContext(context);
 if(!provider||typeof sdk?.verifyClaimReceipt!=='function')reject('REAL_SDK_VERIFIER_REQUIRED');
 if(BigInt(await provider.send('eth_chainId',[]))!==1449000n)reject('WRONG_RPC_CHAIN');
 if(receipt?.schemaId!=='ap4m.claim-receipt.v1'||receipt.fixture===true||receipt.simulated===true||receipt.demo===true)reject('NOT_A_PUBLIC_CLAIM_RECEIPT');
 const payout=receipt.vaultPayoutEvidence;
 if(!eq(receipt.claimId,order.claimId)||!eq(receipt.settlementDigest,order.settlementDigest)||!eq(payout?.claimId,order.claimId)||!eq(payout?.channelId,order.channelId)||!eq(payout?.payout,order.payout)||payout?.amount!==order.expectedRlusdBaseUnits||!eq(payout?.vault,context.vault)||!eq(payout?.token,context.token)||payout?.chainId!==context.chainId)reject('RECEIPT_ORDER_MISMATCH');
 let checked;try{checked=await sdk.verifyClaimReceipt(provider,context,receipt);}catch{reject('SDK_CHAIN_VERIFICATION_FAILED');}
 if(checked?.verified!==true||checked.payoutFinal!==true||checked.settlementFinal!==true)reject('SDK_FINALITY_NOT_VERIFIED');
 // ClaimPaid and SettlementRecorded indexes are not the Transfer index consumed by the core gate.
 const tx=await provider.getTransactionReceipt(payout.transactionHash);
 if(tx?.status!==1||!eq(tx.hash??tx.transactionHash,payout.transactionHash)||tx.blockNumber!==payout.blockNumber||!eq(tx.blockHash,payout.blockHash))reject('PAYOUT_TRANSACTION_CHANGED');
 const transfers=(tx.logs||[]).filter(l=>eq(l.address,context.token)&&eq(l.topics?.[0],TRANSFER_TOPIC));
 if(transfers.length!==1)reject('AMBIGUOUS_TOKEN_TRANSFER');
 const log=transfers[0],index=log.index??log.logIndex;
 if(log.removed||!eq(log.transactionHash,payout.transactionHash)||!eq(log.blockHash,payout.blockHash)||log.blockNumber!==payout.blockNumber||log.topics?.length!==3||!eq(log.topics[1],topic(context.vault))||!eq(log.topics[2],topic(order.payout))||!/^0x[0-9a-fA-F]{64}$/.test(log.data||'')||BigInt(log.data)!==BigInt(order.expectedRlusdBaseUnits)||!Number.isSafeInteger(index)||index<0)reject('EXACT_TRANSFER_NOT_VERIFIED');
 const block=await provider.getBlock(payout.blockNumber),head=await provider.getBlockNumber();
 if(!eq(block?.hash,payout.blockHash)||head-payout.blockNumber+1<context.confirmationBlocks)reject('PAYOUT_CANONICAL_FENCE_FAILED');
 return {verification:'canonical-ap4m-payout',chainId:1449000,claimId:order.claimId,channelId:order.channelId,settlementDigest:order.settlementDigest,payout:order.payout,amountBaseUnits:order.expectedRlusdBaseUnits,txHash:payout.transactionHash,logIndex:index,blockHash:payout.blockHash,claimPaidLogIndex:payout.logIndex,settlementAnchorTxHash:receipt.settlementTransaction.transactionHash,payoutFinal:true,settlementFinal:true,readOnly:true,sandboxFundingPerformed:false};
}
/** Adapter for createPayoutVerifier's resolveClaim dependency. Loader only retrieves public JSON. */
export function createReceiptClaimResolver({provider,sdk,context,loadReceipt}){
 return async ({order,evidence})=>{const receipt=await loadReceipt(order.claimId,order.settlementDigest);const verified=await verifyAp4mReceipt({provider,sdk,context,receipt,order});if(!eq(verified.txHash,evidence.txHash)||verified.logIndex!==evidence.logIndex)reject('GATE_TRANSFER_IDENTITY_MISMATCH');return {channelId:verified.channelId,claimId:verified.claimId,settlementTxHash:verified.txHash,payoutLogIndex:verified.logIndex};};
}
