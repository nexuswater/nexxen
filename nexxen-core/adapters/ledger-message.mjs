/** Transport-neutral lifecycle guard for the official Ethereum Signer Kit's signMessage.
 * This is not connected to the dashboard and does not discover or connect to devices.
 * The host must confirm trusted approver, device firmware/app and readable review first.
 * Never substitute signTypedData, a precomputed hash, a hot key, or a transaction.
 */
export function prepareLedgerMessageAction({signer,path,message,readiness}){
 if(!readiness?.trustedApproverConfirmed||!readiness?.firmwareVerified||!readiness?.ethereumAppVerified||!readiness?.readableAsciiReviewVerified)throw new Error('LEDGER_READINESS_NOT_VERIFIED');
 if(typeof message!=='string'||!message.startsWith('NEXXEN LOCAL FIXTURE POLICY APPROVAL v1\n')||!/^[\x20-\x7e\n]+$/.test(message)||message.length>4096)throw new Error('READABLE_CANONICAL_MESSAGE_REQUIRED');
 if(typeof path!=='string'||!/^44'\/60'\/\d+'\/\d+\/\d+$/.test(path)||typeof signer?.signMessage!=='function')throw new Error('SUPPORTED_SIGNER_REQUIRED');
 let action,subscription,resolve,reject,finished=false;
 const result=new Promise((ok,no)=>{resolve=ok;reject=no;});
 function fail(reason){if(finished)return;finished=true;try{action?.cancel();}finally{subscription?.unsubscribe();reject(new Error(reason));}}
 function start(){if(action||finished)throw new Error('ACTION_ALREADY_STARTED');
  try{action=signer.signMessage(path,message);subscription=action.observable.subscribe({
   next:state=>{if(finished)return;if(state.status==='completed'){const s=state.output;if(!s||!/^0x[0-9a-fA-F]{64}$/.test(s.r)||!/^0x[0-9a-fA-F]{64}$/.test(s.s)||![0,1,27,28].includes(s.v)){fail('INVALID_SIGNATURE_OUTPUT');return;}finished=true;resolve({candidateSignature:s,verified:false,hardwareProven:false});subscription?.unsubscribe();}
    else if(state.status==='error'||state.status==='stopped')fail('DEVICE_ACTION_DID_NOT_COMPLETE');},
   error:()=>fail('DEVICE_ACTION_ERROR'),complete:()=>{if(!finished)fail('DEVICE_ACTION_INCOMPLETE');}
  });if(finished)subscription?.unsubscribe();
  }catch{fail('DEVICE_ACTION_ERROR');}return result;
 }
 return {start,result,cancel:()=>fail('USER_CANCELLED'),disconnect:()=>fail('DEVICE_DISCONNECTED')};
}
