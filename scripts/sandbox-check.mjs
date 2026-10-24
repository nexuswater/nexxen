/** Read-only Marqeta sandbox connection check. Never imports mutation methods. */
import {pathToFileURL} from 'node:url';
export const SANDBOX_READ_URL='https://sandbox-api.marqeta.com/v3';
export class SandboxReadError extends Error {
 constructor(code,httpStatus){super(code);this.name='SandboxReadError';this.code=code;if(httpStatus)this.httpStatus=httpStatus;}
}
export function readConfiguration(env){
 if(env.MARQETA_SANDBOX_READ_ENABLED!=='true')throw new SandboxReadError('READ_CHECK_NOT_ENABLED');
 if(env.MARQETA_SANDBOX_BASE_URL!==SANDBOX_READ_URL)throw new SandboxReadError('SANDBOX_BASE_URL_MISMATCH');
 const app=env.MARQETA_APPLICATION_TOKEN,admin=env.MARQETA_ADMIN_ACCESS_TOKEN;
 if(typeof app!=='string'||!app||app.includes(':')||typeof admin!=='string'||!admin||/[\r\n]/.test(app+admin))throw new SandboxReadError('SANDBOX_RUNTIME_CREDENTIALS_MISSING_OR_INVALID');
 return {baseUrl:SANDBOX_READ_URL,applicationToken:app,adminAccessToken:admin};
}
/** Exact GET /cardproducts; returns counts only, never names/tokens/provider bodies. */
export async function checkSandboxConnection({env=process.env,fetchImpl=fetch}={}){
 const config=readConfiguration(env);let response;
 try{response=await fetchImpl(config.baseUrl+'/cardproducts',{method:'GET',headers:{Authorization:'Basic '+Buffer.from(config.applicationToken+':'+config.adminAccessToken).toString('base64'),Accept:'application/json'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{throw new SandboxReadError('SANDBOX_READ_FAILED');}
 if(!response.ok)throw new SandboxReadError('SANDBOX_READ_REJECTED',response.status);
 let result;try{result=await response.json();}catch{throw new SandboxReadError('SANDBOX_RESPONSE_INVALID');}
 if(!Array.isArray(result?.data)||result.data.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw new SandboxReadError('SANDBOX_RESPONSE_INVALID');
 return {connection:'sandbox-read-verified',method:'GET',resource:'/cardproducts',returnedProductCount:result.data.length,returnedActiveProductCount:result.data.filter(p=>p.active===true).length,nonJitProductVerified:false,mutationsPerformed:false,credentialsPrinted:false,scope:'Sandbox catalog read only; not card issuance, funding, authorization, settlement or GPU delivery'};
}
export function safeReadError(error){return {connection:'not-verified',error:error instanceof SandboxReadError?error.code:'SANDBOX_READ_FAILED',...(error instanceof SandboxReadError&&Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{}),mutationsPerformed:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await checkSandboxConnection(),null,2));}
 catch(error){console.error(JSON.stringify(safeReadError(error),null,2));process.exitCode=1;}
}
