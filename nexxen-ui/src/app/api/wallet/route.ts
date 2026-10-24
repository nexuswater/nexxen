import { balance, readJournal, wallet } from "@/lib/ap4m/agent";

export const runtime = "nodejs";

/** Wallet bar + transaction history: agent wallet, XRP gas, RLUSD budget, purchases. */
export async function GET() {
  try {
    const [w, b] = await Promise.all([wallet(), balance()]);
    const j = readJournal();
    const settled = new Set(j.settlements.flatMap((s) => s.receipts.map((r) => r.claim_id)));
    return Response.json({
      wallet: w,
      balance: b,
      history: j.purchases
        .filter((p) => p.mode === w.mode)
        .map((p) => ({
          at: p.at,
          service: p.service,
          seller: p.seller,
          amountRlusd: p.amountRlusd,
          txHash: p.txHash,
          explorerUrl: p.explorerUrl,
          status: settled.has(p.claimId) ? "settled" : "paid",
          input: p.job?.input,
          ok: p.job ? !p.job.error : undefined,
        })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
