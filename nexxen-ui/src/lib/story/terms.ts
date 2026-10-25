/**
 * Demo financing quote for hours/days terms. Same convention as nexxen-core's
 * TERM_POLICY (simple ACT/365, 12% nominal, no fee), but interest is kept to
 * 1e-6 RLUSD so short, small terms don't round to zero. A quote creates no
 * funds, debt or agreement.
 */
export const TERM_POLICY = {
  version: "demo-hours-days-v1",
  minAmount: 0.01,
  maxAmount: 10,
  maxHours: 168,
  annualRateBps: 1200,
  quoteValiditySeconds: 600,
} as const;

export type TermInput = { amount: string; duration: number; unit: "hours" | "days" };

export type TermQuote = {
  amount: string;
  duration: number;
  unit: "hours" | "days";
  hours: number;
  annualRateBps: number;
  interest: string;
  total: string;
  createdAt: string;
  dueAt: string;
  expiresAt: string;
  convention: string;
  policyVersion: string;
};

const MICRO = BigInt(1_000_000);

/** "5.00" -> 5000000 micro-RLUSD; at most two decimals, like the core quote. */
function toMicro(amount: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)) throw new Error("Enter an amount with at most two decimals.");
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * MICRO + BigInt(frac.padEnd(6, "0"));
}

const fromMicro = (v: bigint, digits = 6) => (Number(v) / 1e6).toFixed(digits);

export function calculateTermQuote(input: TermInput, now = new Date()): TermQuote {
  const principal = toMicro(input.amount);
  const amount = Number(input.amount);
  if (amount < TERM_POLICY.minAmount || amount > TERM_POLICY.maxAmount) {
    throw new Error(`Amount must be between ${TERM_POLICY.minAmount} and ${TERM_POLICY.maxAmount} RLUSD.`);
  }
  if (!Number.isSafeInteger(input.duration) || input.duration < 1 || !["hours", "days"].includes(input.unit)) {
    throw new Error("Use whole hours or days.");
  }
  const hours = input.duration * (input.unit === "days" ? 24 : 1);
  if (hours > TERM_POLICY.maxHours) throw new Error(`Terms are limited to ${TERM_POLICY.maxHours} hours (7 days).`);

  const seconds = BigInt(hours * 3600);
  const denominator = BigInt(10000 * 365 * 86400);
  // Round once, half up, to 1e-6 RLUSD.
  const interest = (principal * BigInt(TERM_POLICY.annualRateBps) * seconds + denominator / BigInt(2)) / denominator;
  return {
    amount: fromMicro(principal, 2),
    duration: input.duration,
    unit: input.unit,
    hours,
    annualRateBps: TERM_POLICY.annualRateBps,
    interest: fromMicro(interest),
    total: fromMicro(principal + interest),
    createdAt: now.toISOString(),
    dueAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
    expiresAt: new Date(now.getTime() + TERM_POLICY.quoteValiditySeconds * 1000).toISOString(),
    convention: "Simple ACT/365, 12% nominal annual, no fee, interest rounded half up to 0.000001",
    policyVersion: TERM_POLICY.version,
  };
}
