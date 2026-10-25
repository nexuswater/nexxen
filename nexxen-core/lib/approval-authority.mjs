import {getAddress} from 'ethers';
export const AUTHORITY_KEY='local-fixture-approval-authority-v1';
export function validateAuthority(value){
 if(!value||value.scope!=='LOCAL_SIMULATION_PER_REQUEST_EXCEPTION'||value.business!=='NEXXEN local fixture business'||value.chainId!==1449000||value.maximumMinor!==2||value.currency!=='RLUSD fixture hundredths'||value.approvedBy!=='Josh'||!Number.isFinite(Date.parse(value.approvedAt)))throw Error('Invalid trusted fixture authority configuration');
 return {...value,address:getAddress(value.address)};
}
export function readAuthority(store){
 const row=store.db.prepare('SELECT value FROM config WHERE id=?').get(AUTHORITY_KEY);
 return row?validateAuthority(JSON.parse(row.value)):null;
}
