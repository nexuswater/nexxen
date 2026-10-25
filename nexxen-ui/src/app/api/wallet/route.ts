import { balance, readJournal, wallet } from "@/lib/ap4m/agent";

export const runtime = "nodejs";

/** Wallet header, live feed and agent report. Every number here is real (journal + chain); no score until VEREV. */
export async function GET() {
  try {
    const [w, b] = await Promise.all([wallet(), balance()]);
    const j = readJournal();
    const mine = <T extends { mode: string }>(xs: T[]) => xs.filter((x) => x.mode === w.mode);
    const purchases = mine(j.purchases);
    const blocks = mine(j.blocks);
    const settledClaims = new Set(j.settlements.flatMap((s) => s.receipts.map((r) => r.claim_id)));
    const blockChannels = new Set(blocks.map((x) => x.channelId));
    const events = mine(j.events);
    const sum = (xs: { amountRlusd: string }[]) => xs.reduce((t, x) => t + Number(x.amountRlusd), 0);

    return Response.json({
      wallet: w,
      balance: b,
      report: {
        score: null,
        fundedLimitRlusd: b.budgetRlusd,
        settledPayments: purchases.length,
        settledRlusd: sum(purchases).toFixed(6),
        withinBudget: purchases.filter((p) => blockChannels.has(p.channelId)).length,
        declines: events.filter((e) => e.kind === "DECLINE").length,
        blocksApproved: blocks.length,
        blockDecider: blocks[0]?.decidedBy ?? "POLICY",
        paidOutToSellers: purchases.filter((p) => settledClaims.has(p.claimId)).length,
        lastTx: purchases[0]?.txHash ?? null,
        lastTxUrl: purchases[0]?.explorerUrl ?? null,
      },
      events: events.slice(0, 60),
      history: purchases.map((p) => ({
        at: p.at,
        service: p.service,
        seller: p.seller,
        amountRlusd: p.amountRlusd,
        txHash: p.txHash,
        explorerUrl: p.explorerUrl,
        status: settledClaims.has(p.claimId) ? "settled" : "paid",
        input: p.job?.input,
        ok: p.job ? !p.job.error : undefined,
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
