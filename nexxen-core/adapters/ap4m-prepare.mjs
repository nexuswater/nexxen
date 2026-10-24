/** Source-derived, DISABLED-BY-DEFAULT preparation only. No I/O, signer or broadcast. */
export const PUBLIC_DEPLOYMENT_SNAPSHOT = Object.freeze({
 chainId:1449000,rpcUrl:'https://rpc.testnet.xrplevm.org',explorerUrl:'https://explorer.testnet.xrplevm.org',
 participantRegistry:'0x4cF27435FE56161aa9b1cffdD87784aa68b7D1E8',
 paymentLedger:'0xcAB42800A5ECF0D253Fa2581Bb3334B4DAEfaE91',
 pooledEscrowVault:'0x83DD9cD010eb46e96eceF8F7eB0a18f7845AaBC0',
 rlusdToken:'0x27b57a9D0b8d24EB97259c4E2279e45255e016f3',tokenDecimals:18,
 source:'https://hackathon.ap4m.build/public/config',snapshotDate:'2026-10-24',
});
export const REDEEM_VOUCHER_ABI='function redeemVoucher((bytes32 channelId, uint256 cumulativeAmount) voucher, bytes agentSignature) returns (bytes32 claimId, uint256 amount, bytes32 digest)';
const address=v=>/^0x[0-9a-fA-F]{40}$/.test(v??'')&&!/^0x0{40}$/i.test(v);
const bytes32=v=>/^0x[0-9a-fA-F]{64}$/.test(v??'')&&!/^0x0{64}$/i.test(v);
const uint=v=>{if(typeof v!=='string'||!/^\d+$/.test(v)||BigInt(v)>=2n**256n)throw new Error('Unsigned base units must be a uint256 decimal string');return BigInt(v);};
function requireConfig(config){
 if(config?.preparationEnabled!==true)throw new Error('AP4M preparation disabled');
 if(config.verifiedDeployment!==true||config.chainId!==1449000)throw new Error('Fresh deployment and chain verification required');
 for(const field of ['participantRegistry','paymentLedger','pooledEscrowVault','rlusdToken'])if(config[field]?.toLowerCase()!==PUBLIC_DEPLOYMENT_SNAPSHOT[field].toLowerCase())throw new Error(`Deployment ${field} mismatch`);
 if(config.tokenDecimals!==18||!address(config.agent)||!address(config.merchantPayout)||!bytes32(config.merchantId))throw new Error('Full verified agent, merchant, payout and token precision required');
}
function blocked(plan){return {...plan,preparationOnly:true,signingAllowed:false,broadcastAllowed:false};}
export function parseRlusdBaseUnits(amount){
 if(typeof amount!=='string'||! /^(0|[1-9]\d*)(\.\d{1,18})?$/.test(amount))throw new Error('RLUSD amount must be an exact decimal string with at most 18 places');
 const [whole,fraction='']=amount.split('.');const value=BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));uint(String(value));return String(value);
}
/** Exact SDK service request body. Merely describes a request; does not call the service. */
export function prepareChannelRequest(config,{capRlusd,verifiedAvailableBudgetBaseUnits}){
 requireConfig(config);const cap=uint(parseRlusdBaseUnits(capRlusd));
 if(cap===0n||cap>uint(verifiedAvailableBudgetBaseUnits))throw new Error('Channel cap exceeds verified funded budget or is zero');
 return blocked({method:'POST',url:'https://hackathon.ap4m.build/public/participant/channel-requests/prepare',requiresAuthorizedSession:true,body:{cap_rlusd:capRlusd,merchant_id:config.merchantId},expectedTransactionDestination:config.pooledEscrowVault,expectedChainId:1449000,capBaseUnits:String(cap),remainingChecks:['Decode prepared calldata against independently verified vault ABI and bind agent/merchant/cap','Actual supported human treasury approval, gas and confirmed transaction','Only after receipt confirmation record tx_hash via /public/participant/channel-requests']});
}
/** Narrow voucher shape from inspected SDK; not a generic signing facility. */
export function prepareVoucher(config,{channelId,previousCumulativeBaseUnits,cumulativeBaseUnits,channelCapBaseUnits,reservedIncrementBaseUnits}){
 requireConfig(config);if(!bytes32(channelId)||channelId.toLowerCase()!==config.channelId?.toLowerCase())throw new Error('Configured channel mismatch');
 const previous=uint(previousCumulativeBaseUnits),next=uint(cumulativeBaseUnits),cap=uint(channelCapBaseUnits),reserved=uint(reservedIncrementBaseUnits);
 if(next<=previous||next>cap||next-previous!==reserved)throw new Error('Cumulative obligation must equal the atomic reservation increment and fit channel cap');
 return blocked({domain:{name:'AP4M Payment Ledger',version:'1',chainId:1449000,verifyingContract:config.paymentLedger},types:{Voucher:[{name:'channelId',type:'bytes32'},{name:'cumulativeAmount',type:'uint256'}]},primaryType:'Voucher',message:{channelId,cumulativeAmount:String(next)},incrementBaseUnits:String(next-previous),remainingChecks:['Fresh channel identity/state, payout, expiry and capacity verification','Bind durable reservation to operational signer; signer not implemented']});
}
/** ABI call plan only; no fabricated selector/calldata or signature is produced. */
export function prepareRedemptionCall(config,input){
 const voucher=prepareVoucher(config,input);
 return blocked({chainId:1449000,to:config.paymentLedger,value:'0',abi:REDEEM_VOUCHER_ABI,functionName:'redeemVoucher',voucher:voucher.message,agentSignature:null,remainingChecks:['Obtain authorized isolated-agent signature after reservation binding','Encode with a reviewed ABI codec; no calldata is synthesized here','Submit only after configured approval; confirm canonical receipt','Report redemption via verified API schema, then independently verify settlement and payout']});
}
