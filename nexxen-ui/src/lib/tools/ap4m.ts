import { tool } from "ai";
import { z } from "zod";
import { runJob, validateJob } from "@/lib/ap4m/ai-tools";
import { balance, buyService, listServices, settleAll } from "@/lib/ap4m/agent";
import { attachJob } from "@/lib/ap4m/store";

/**
 * Agent-side AP4M tools. The user picks what to buy; the agent pays without
 * further approval, inside the business policy enforced in src/lib/ap4m/agent.ts
 * (max price per purchase, max Channel cap).
 */
export const ap4mTools = {
  list_services: tool({
    description:
      "List the paid AI tools the user can buy, with id, name, seller, description, the input each needs and the " +
      "price in RLUSD (live from each seller's HTTP 402 challenge when available).",
    inputSchema: z.object({}),
    execute: () => listServices(),
  }),

  get_balance: tool({
    description:
      "Show the user's AP4M balance in RLUSD: team budget, spent so far, available, the open payment Channel " +
      "(cap, spent, left) and the per-purchase limit. 'mode' is 'live' (XRPL EVM Testnet) or 'demo' (simulated).",
    inputSchema: z.object({}),
    execute: () => balance(),
  }),

  buy_service: tool({
    description:
      "Buy one AI tool the user picked and run it on their input. Pays the seller with a signed AP4M voucher over " +
      "HTTP 402; the seller runs the job only after the payment is redeemed. Returns the job result, the receipt " +
      "(price, transaction hash, explorer link in live mode) and the balance afterwards. Takes ~15-40 s.",
    inputSchema: z.object({
      service_id: z.string(),
      input: z.string().describe("URL for summarize-url, text for translate/sentiment, prompt for generate-image"),
      target_language: z.string().optional().describe("translate only; defaults to Hindi"),
    }),
    execute: async ({ service_id, input, target_language }) => {
      const job = { input, targetLanguage: target_language };
      validateJob(service_id, job);
      const receipt = await buyService(service_id);
      let result: Record<string, unknown> | undefined;
      let error: string | undefined;
      try {
        result = await runJob(service_id, job);
      } catch (e) {
        error = `Paid, but the job failed: ${(e as Error).message}`;
      }
      attachJob(receipt.claimId, { input, result, error });
      const paid = { ...receipt, resource: undefined };
      return { result, error, receipt: paid, balanceAfter: await balance() };
    },
  }),

  settle_payments: tool({
    description:
      "Settle unsettled purchases now so RLUSD reaches the seller's payout wallet (AP4M also settles " +
      "automatically). Returns payout transactions and receipts.",
    inputSchema: z.object({}),
    execute: () => settleAll(),
  }),
};
