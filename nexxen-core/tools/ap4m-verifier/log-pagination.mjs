/** Adapt only Quicknode's explicit oversized-log-range response; never change filters. */
export function isRangeLimit(error){
 const code=error?.info?.error?.code??error?.error?.code;
 const status=error?.response?.statusCode??error?.info?.responseStatus;
 return code===-32615&&(status===413||status===undefined);
}
const integer=v=>{try{const n=Number(BigInt(v));if(Number.isSafeInteger(n)&&n>=0)return n;}catch{}throw Error('INVALID_LOG_RANGE');};
export function createBoundedLogReader(read,{maxRequests=1200,maxBlocks=20000,timeoutMs=80000,clock=()=>Date.now()}={}){
 let requests=0;const deadline=clock()+timeoutMs;
 async function invoke(filter){
  if(clock()>=deadline)throw Error('LOG_PAGINATION_TIMEOUT');
  if(++requests>maxRequests)throw Error('LOG_REQUEST_BUDGET_EXCEEDED');
  let timer;
  try{return await Promise.race([read(filter),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOG_PAGINATION_TIMEOUT')),Math.max(1,deadline-clock()));})]);}
  finally{clearTimeout(timer);}
 }
 return async filter=>{
  if(filter.blockHash)return invoke(filter);
  const from=integer(filter.fromBlock),to=integer(filter.toBlock);
  if(to<from||to-from+1>maxBlocks)throw Error('LOG_RANGE_BUDGET_EXCEEDED');
  async function range(a,b){
   let logs;
   try{logs=await invoke({...filter,fromBlock:a,toBlock:b});}
   catch(error){if(!isRangeLimit(error))throw error;if(a===b)throw Error('SINGLE_BLOCK_LOG_LIMIT');const middle=a+Math.floor((b-a)/2);return [...await range(a,middle),...await range(middle+1,b)];}
   if(!Array.isArray(logs))throw Error('INVALID_LOG_RESPONSE');
   for(const log of logs){if(integer(log.blockNumber)<a||integer(log.blockNumber)>b||log.removed===true||!/^0x[0-9a-fA-F]{64}$/.test(log.blockHash)||!/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)||!Number.isSafeInteger(log.index)||log.index<0)throw Error('INVALID_LOG_RESPONSE');}
   return logs;
  }
  // Both halves must succeed; a failed subrange never returns partial evidence.
  const logs=await range(from,to),unique=new Map();
  for(const log of logs){const key=`${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.index}`;const prior=unique.get(key);if(prior&&JSON.stringify([prior.address,prior.data,prior.topics,prior.blockNumber,prior.transactionIndex])!==JSON.stringify([log.address,log.data,log.topics,log.blockNumber,log.transactionIndex]))throw Error('CONFLICTING_LOG_DUPLICATE');unique.set(key,log);}
  return [...unique.values()].sort((a,b)=>integer(a.blockNumber)-integer(b.blockNumber)||(a.transactionIndex??0)-(b.transactionIndex??0)||a.index-b.index);
 };
}

/** Explicit free-tier mode: conservative inclusive five-block windows, global budget. */
export function createFreeTierLogReader(read,{maxRequests=8000,timeoutMs=900000,intervalMs=125,signal,pageCache,onProgress=()=>{},onFailure=()=>{},clock=()=>Date.now()}={}){
 if(!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>8000||timeoutMs<1||timeoutMs>900000||intervalMs<100)throw Error('INVALID_SCAN_BUDGET');
 const started=clock(),deadline=started+timeoutMs;let count=0,completed=0,nextSlot=started,stopped=false,lastProgress=started;
 const fail=()=>{if(signal?.aborted||stopped)throw Error('LOG_SCAN_CANCELLED');if(clock()>=deadline)throw Error('LOG_PAGINATION_TIMEOUT');};
 const sleep=ms=>new Promise((resolve,reject)=>{if(ms<=0)return resolve();const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Error('LOG_SCAN_CANCELLED'));}signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
 async function invoke(filter){
  fail();const slot=Math.max(clock(),nextSlot);nextSlot=slot+intervalMs;
  await sleep(Math.min(slot-clock(),Math.max(0,deadline-clock())));fail();
  if(count>=maxRequests)throw Error('LOG_REQUEST_BUDGET_EXCEEDED');count++;
  let timer,abortHandler;
  try{
   const result=await Promise.race([read(filter),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOG_PAGINATION_TIMEOUT')),Math.max(1,deadline-clock()));abortHandler=()=>reject(Error('LOG_SCAN_CANCELLED'));signal?.addEventListener('abort',abortHandler,{once:true});})]);
   fail();completed++;
   if(clock()-lastProgress>=30000){lastProgress=clock();onProgress({event:'log-scan-progress',requests:count,completed,maximumRequests:maxRequests,elapsedSeconds:Math.floor((clock()-started)/1000)});}
   return result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abortHandler);}
 }
 async function page(filter){
  // Retry only explicit throttling, transient gateway failures or read timeouts.
  // Every retry re-enters the shared pacing, deadline and request budget.
  for(let attempt=0;;attempt++){
   try{return await invoke(filter);}catch(error){const status=error?.response?.statusCode;const code=error?.error?.code??error?.info?.error?.code;if(attempt>=2||!([429,502,503,504].includes(status)||code===-32005||error?.message==='RPC_TIMEOUT')){onFailure(safeLogFailure(error,{fromBlock:filter.fromBlock,toBlock:filter.toBlock,requests:count,completed}));throw error;}await sleep(500*(attempt+1));}
  }
 }
 return async filter=>{
  fail();
  if(filter.blockHash)throw Error('EXPLICIT_LOG_RANGE_REQUIRED');
  const from=integer(filter.fromBlock),to=integer(filter.toBlock);
  if(to<from||to-from+1>40000)throw Error('LOG_RANGE_BUDGET_EXCEEDED');
  let next=from;const results=[];
  async function worker(){while(next<=to){fail();const a=next,b=Math.min(a+4,to);next=b+1;const current={...filter,fromBlock:a,toBlock:b};const logs=await (pageCache?pageCache.page(current,()=>page(current)):page(current));if(!Array.isArray(logs))throw Error('INVALID_LOG_RESPONSE');for(const log of logs){if(integer(log.blockNumber)<a||integer(log.blockNumber)>b||log.removed===true||!/^0x[0-9a-fA-F]{64}$/.test(log.blockHash)||!/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)||!Number.isSafeInteger(log.index)||log.index<0)throw Error('INVALID_LOG_RESPONSE');}results.push(...logs);}}
  try{await Promise.all([worker(),worker(),worker(),worker()]);}catch(error){stopped=true;throw error;}
  const unique=new Map();for(const log of results){const key=`${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.index}`,old=unique.get(key);if(old&&JSON.stringify([old.address,old.data,old.topics,old.blockNumber,old.transactionIndex])!==JSON.stringify([log.address,log.data,log.topics,log.blockNumber,log.transactionIndex]))throw Error('CONFLICTING_LOG_DUPLICATE');unique.set(key,log);}
  return [...unique.values()].sort((a,b)=>integer(a.blockNumber)-integer(b.blockNumber)||(a.transactionIndex??0)-(b.transactionIndex??0)||a.index-b.index);
 };
}

/** Allowlist diagnostic fields; never serialize provider exceptions or URLs. */
export function safeLogFailure(error,range){
 const code=error?.error?.code??error?.info?.error?.code;
 const status=error?.response?.statusCode??error?.info?.responseStatus;
 const known=['LOG_SCAN_CANCELLED','LOG_PAGINATION_TIMEOUT','LOG_REQUEST_BUDGET_EXCEEDED','INVALID_LOG_RESPONSE','CONFLICTING_LOG_DUPLICATE','RPC_TIMEOUT','RPC_UNAVAILABLE'];
 return {event:'log-scan-failed',method:'eth_getLogs',fromBlock:range.fromBlock,toBlock:range.toBlock,requests:range.requests,completed:range.completed,reason:known.includes(error?.message)?error.message:'PROVIDER_READ_FAILED',providerClassification:classifyRpcFailure(error),...(Number.isInteger(code)?{rpcCode:code}:{}),...(Number.isInteger(status)?{httpStatus:status}:{})};
}

/** Classify provider text privately; only fixed labels can leave this function. */
export function classifyRpcFailure(error){
 const text=String(error?.error?.message??error?.info?.error?.message??error?.message??'').toLowerCase();
 if(/timeout|timed out|deadline/.test(text))return 'UPSTREAM_TIMEOUT';
 if(/archive|historical|prun|missing trie/.test(text))return 'HISTORICAL_STATE_UNAVAILABLE';
 if(/too many|limit|exceed|size/.test(text))return 'RESULT_OR_RATE_LIMIT';
 if(/backend|upstream|gateway|server/.test(text))return 'BACKEND_ERROR';
 return 'UNCLASSIFIED_PROVIDER_ERROR';
}
