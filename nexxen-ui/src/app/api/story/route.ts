import { wallet } from "@/lib/ap4m/agent";
import {
  accept,
  buyOnCard,
  CARD_ITEMS,
  denyApproval,
  financing,
  JOB,
  policy,
  prepareApproval,
  quote,
  readStory,
  redeliver,
  resetStory,
  submitApproval,
  type Story,
} from "@/lib/story/state";

export const runtime = "nodejs";
export const maxDuration = 120;

async function view(s: Story) {
  const w = await wallet().catch(() => null);
  return {
    ...s,
    policy: policy(),
    financing: financing(s),
    items: CARD_ITEMS,
    job: JOB,
    agent: w?.address ?? null,
  };
}

/** Read model for the hackathon walkthrough at /demo. */
export async function GET() {
  return Response.json(await view(readStory()));
}

type Body = {
  action?: string;
  amount?: string;
  duration?: number;
  unit?: "hours" | "days";
  quoteId?: string;
  itemId?: string;
  orderId?: string;
  approvalId?: string;
  signature?: string;
  via?: "wallet" | "pasted" | "ledger";
};

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  try {
    let s: Story;
    switch (b.action) {
      case "quote":
        s = quote({ amount: String(b.amount), duration: Number(b.duration), unit: b.unit ?? "hours" });
        break;
      case "accept":
        s = accept(String(b.quoteId));
        break;
      case "card":
        s = await buyOnCard(String(b.itemId));
        break;
      case "redeliver":
        s = await redeliver(String(b.orderId));
        break;
      case "prepare": {
        const w = await wallet();
        s = prepareApproval(String(b.orderId), w.address);
        break;
      }
      case "submit":
        // The signature is verified against OWNER_APPROVER_ADDRESS inside submitApproval,
        // so an untrusted `via` label cannot widen what a signature is allowed to do.
        s = submitApproval(String(b.approvalId), String(b.signature).trim(), b.via === "wallet" ? "wallet" : b.via === "ledger" ? "ledger" : "pasted");
        break;
      case "deny":
        s = denyApproval(String(b.approvalId));
        break;
      case "reset":
        s = resetStory();
        break;
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
    return Response.json(await view(s));
  } catch (error) {
    return Response.json({ error: (error as Error).message, ...(await view(readStory())) }, { status: 409 });
  }
}
