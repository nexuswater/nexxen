/** No secrets are loaded from files or emitted. Environment is supplied by the operator. */
export const PUBLIC_RPC='https://rpc.testnet.xrplevm.org';
export const CHAIN_ID=1449000;
export function selectProvider(env={}){
 const mode=env.AP4M_RPC_PROVIDER||'public';
 if(!['public','quicknode'].includes(mode))throw Error('UNSUPPORTED_RPC_PROVIDER');
 if(mode==='public'){
  if(env.AP4M_RPC_URL)throw Error('EXPLICIT_RPC_PROVIDER_REQUIRED');
  return {url:PUBLIC_RPC,identity:'public-xrpl-evm-testnet',chainId:CHAIN_ID};
 }
 if(!env.AP4M_RPC_URL)throw Error('QUICKNODE_ENDPOINT_REQUIRED');
 let url;try{url=new URL(env.AP4M_RPC_URL);}catch{throw Error('INVALID_QUICKNODE_ENDPOINT');}
 if(url.protocol!=='https:'||!url.hostname.endsWith('.quiknode.pro')||url.username||url.password||url.port||url.search||url.hash)throw Error('INVALID_QUICKNODE_ENDPOINT');
 return {url:url.href,identity:'quicknode-xrpl-evm-testnet',chainId:CHAIN_ID};
}
export function provenance(config){return {provider:config.identity,chainId:CHAIN_ID,endpoint:'redacted',fallbackUsed:false};}
export async function assertChain(provider){
 let chain;try{chain=await provider.send('eth_chainId',[]);}catch{throw Error('RPC_UNAVAILABLE');}
 try{if(BigInt(chain)!==BigInt(CHAIN_ID))throw 0;}catch{throw Error('WRONG_RPC_CHAIN');}
}
export const PROVIDER_ERRORS=['UNSUPPORTED_RPC_PROVIDER','EXPLICIT_RPC_PROVIDER_REQUIRED','QUICKNODE_ENDPOINT_REQUIRED','INVALID_QUICKNODE_ENDPOINT','RPC_UNAVAILABLE','RPC_TIMEOUT','VERIFICATION_TIMEOUT','WRONG_RPC_CHAIN'];
export function safeProviderError(error){return PROVIDER_ERRORS.includes(error?.message)?error.message:'RPC_UNAVAILABLE';}
// Use a bounded, no-redirect transport so a private URL cannot redirect credentials elsewhere.
export function rpcTransport({fetchImpl=fetch,signal,timeoutMs=15000}={}){
 return async request=>{
  try{
   const response=await fetchImpl(request.url,{method:request.method,headers:request.headers,body:request.body,redirect:'error',credentials:'omit',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
   const data=new Uint8Array(await response.arrayBuffer());
   if(data.byteLength>5_000_000)throw Error('RPC_UNAVAILABLE');
   if(response.status===413){let body;try{body=JSON.parse(new TextDecoder().decode(data));}catch{}if(body?.error?.code===-32615){return {statusCode:200,statusMessage:'RPC range limit',headers:{'content-type':'application/json'},body:new TextEncoder().encode(JSON.stringify({jsonrpc:'2.0',id:body.id,error:{code:-32615,message:'QUICKNODE_LOG_RANGE_LIMIT'}}))};}}
   return {statusCode:response.status,statusMessage:response.statusText,headers:Object.fromEntries(response.headers),body:data};
  }catch(error){throw Error(error?.name==='TimeoutError'?'RPC_TIMEOUT':'RPC_UNAVAILABLE');}
 };
}
