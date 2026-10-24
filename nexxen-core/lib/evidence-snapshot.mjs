// Historical observations supplied by the verified session; never updated by rehearsals.
// This is a status snapshot, not a settlement receipt or a fresh network verification.
export const EVIDENCE_SNAPSHOT = Object.freeze({
 ap4m: Object.freeze({chainId:1449000, checkedAt:'2026-10-24T22:38:49Z', status:'blocked_unpaid', paid:false, settlementDigest:'0x'+'0'.repeat(64), amountRlusd:'0.001', claimId:'0x2f742af45bca038820ae8787b6802035e64c1ede840e427d24f886e5902c2d2f', channelId:'0xf7b6ba9131acea68430fe757d40dbbd9a6650f90ecebc4ad8ddf71a005104a6e', source:'Independent chain check reported by parent task; portal showed needs staff attention'}),
 marqeta: Object.freeze({status:'historical_sandbox_hold', amountUsd:'1.00', responseCode:'0000', authorizationState:'PENDING', network:'MASTERCARD', availableUsd:'0.00', ledgerUsd:'1.00', source:'Previously verified isolated sandbox test; no fresh API check', fundedByAp4mClaim:false})
});
