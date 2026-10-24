/** Separate issuer interface. Does not issue a card or move funds. */
export class VirtualCardAdapter {
 constructor({provider='marqeta',credentialConfigured=false,programApproved=false,verifiedApiContract=false}={}){this.config={provider,credentialConfigured,programApproved,verifiedApiContract};}
 status(){return {mode:'unavailable',provider:this.config.provider,blockers:[...(!this.config.credentialConfigured?['Authorized sandbox credential unavailable']:[]),...(!this.config.programApproved?['Issuer/bank/network program capability unverified']:[]),...(!this.config.verifiedApiContract?['Current endpoint and program contract unverified']:[]),'Live card implementation and issuer evidence verification not implemented'],ledgerScope:'Ledger approval cannot force issuer authorization or card acceptance',funding:'No RLUSD-to-card conversion or automatic funding bridge'};}
 async requestVirtualCard(){throw new Error('Unavailable: no verified issuer program, credentials, API contract or implemented issuance flow.');}
 async authorizePurchase(){throw new Error('Unavailable: issuer authorization and merchant acceptance have not been verified.');}
 async reconcile(){throw new Error('Unavailable: live issuer event reconciliation is not implemented.');}
}
