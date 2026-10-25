// EXPERIMENTAL ONLY: not used by authoritative receipt verification.
// A local operator can rewrite records and recompute the unkeyed digest.
import {mkdir,readdir,lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex64=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
// This cache is private local operator state, not an independently signed proof.
// Digests detect corruption; canonical anchors and the unchanged SDK validate chain evidence.
export async function createCanonicalPageCache({directory,identity,anchors,getBlock,read,signal,ttlMs=21600000,maxBytes=33554432,now=()=>Date.now()}){
 if(identity.chainId!==1449000||identity.sdk!=='0.10.1'||!anchors.length||anchors.some(a=>!integer(a.number)||!hex64(a.hash)))throw Error('INVALID_CACHE_CONTEXT');
 await mkdir(directory,{recursive:true,mode:0o700});const ds=await lstat(directory);if(ds.isSymbolicLink()||!ds.isDirectory()||(ds.mode&0o077))throw Error('UNSAFE_CACHE_DIRECTORY');
 let bytes=0;const sizes=new Map();for(const name of await readdir(directory)){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const st=await lstat(join(directory,name));if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||st.size>262144)throw Error('UNSAFE_CACHE_FILE');sizes.set(name,st.size);bytes+=st.size;}if(bytes>maxBytes)throw Error('CACHE_SIZE_LIMIT');
 let hits=0,writes=0;
 const cancelled=()=>{if(signal?.aborted)throw Error('LOG_SCAN_CANCELLED');};
 async function validateAnchors(){cancelled();for(const a of anchors){const b=await getBlock(a.number);cancelled();if(!b||b.hash?.toLowerCase()!==a.hash.toLowerCase())throw Error('CACHE_ANCHOR_CHANGED');}}
 function normalize(logs,filter){if(!Array.isArray(logs)||logs.length>10000)throw Error('INVALID_CACHED_LOGS');const unique=new Map();for(const l of logs){if(!integer(l.blockNumber)||l.blockNumber<filter.fromBlock||l.blockNumber>filter.toBlock||l.removed!==false||!hex64(l.blockHash)||!hex64(l.transactionHash)||!integer(l.index)||!integer(l.transactionIndex)||typeof l.address!=='string'||l.address.toLowerCase()!==filter.address.toLowerCase()||typeof l.data!=='string'||!/^0x(?:[a-fA-F0-9]{2})*$/.test(l.data)||!Array.isArray(l.topics)||l.topics.some(x=>!hex64(x))||filter.topics.some((x,i)=>x!==null&&x.toLowerCase()!==l.topics[i]?.toLowerCase()))throw Error('INVALID_CACHED_LOGS');const value={address:l.address,blockNumber:l.blockNumber,blockHash:l.blockHash,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,index:l.index,removed:false,data:l.data,topics:[...l.topics]};const k=`${l.blockHash.toLowerCase()}:${l.transactionHash.toLowerCase()}:${l.index}`;if(unique.has(k)&&hash(unique.get(k))!==hash(value))throw Error('CONFLICTING_CACHED_LOG');unique.set(k,value);}return [...unique.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.transactionIndex-b.transactionIndex||a.index-b.index);}
 async function page(filter,fetchPage=read){cancelled();if(Object.keys(filter).sort().join()!=='address,fromBlock,toBlock,topics'||!integer(filter.fromBlock)||!integer(filter.toBlock)||filter.toBlock<filter.fromBlock||filter.toBlock-filter.fromBlock>=5||filter.toBlock>Math.max(...anchors.map(a=>a.number)))throw Error('INVALID_CACHE_FILTER');
 const key={identity,anchors,filter},name=hash(key)+'.json',path=join(directory,name);let saved;
 try{const st=await lstat(path);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||st.size>262144)throw Error('UNSAFE_CACHE_FILE');saved=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('INVALID_CACHE_RECORD');}
 if(saved){const {digest,...body}=saved;if(Object.keys(saved).sort().join()!=='createdAt,digest,key,logs,version'||saved.version!==1||hash(saved.key)!==hash(key)||digest!==hash(body)||!integer(saved.createdAt)||saved.createdAt>now())throw Error('INVALID_CACHE_RECORD');const logs=normalize(saved.logs,filter);if(now()-saved.createdAt<=ttlMs){hits++;return logs;}}
 const logs=normalize(await fetchPage(filter),filter);cancelled();const body={version:1,key,createdAt:now(),logs},text=JSON.stringify({...body,digest:hash(body)});const size=Buffer.byteLength(text),old=sizes.get(name)??0;if(size>262144||bytes-old+size>maxBytes)throw Error('CACHE_SIZE_LIMIT');bytes+=size-old;const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,text,{mode:0o600,flag:'wx'});cancelled();await rename(temp,path);}catch(error){bytes-=size-old;throw error;}finally{await unlink(temp).catch(()=>{});}sizes.set(name,size);writes++;return logs;
 }
 await validateAnchors();return {page,validateAnchors,stats:()=>({hits,writes,bytes})};
}
