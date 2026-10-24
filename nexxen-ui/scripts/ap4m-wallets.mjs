/**
 * Create the AP4M Agent wallet and Merchant payout wallet for this project.
 *
 *   pnpm ap4m:wallets          create missing wallets in .env.local, print addresses
 *   pnpm ap4m:wallets sign "<message>" [agent|merchant]
 *                              sign a portal message locally, print the signature
 *
 * Private keys are written only to .env.local (gitignored) and never printed.
 * The payout wallet also submits redemptions, so both wallets need testnet XRP.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const file = new URL("../.env.local", import.meta.url);
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
const get = (key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();

if (process.argv[2] === "sign") {
  const message = process.argv[3];
  const which = process.argv[4] === "merchant" ? "MERCHANT_SUBMITTER_KEY" : "AGENT_PRIVATE_KEY";
  if (!message || !get(which)) {
    console.error(`usage: pnpm ap4m:wallets sign "<message>" [agent|merchant]  (needs ${which} in .env.local)`);
    process.exit(1);
  }
  const wallet = new ethers.Wallet(get(which));
  console.log(`address:   ${wallet.address}\nsignature: ${await wallet.signMessage(message)}`);
  process.exit(0);
}

const lines = [];
if (!get("AGENT_PRIVATE_KEY")) {
  lines.push(`AGENT_PRIVATE_KEY=${ethers.Wallet.createRandom().privateKey}`);
}
if (!get("MERCHANT_SUBMITTER_KEY")) {
  const payout = ethers.Wallet.createRandom();
  lines.push(`MERCHANT_SUBMITTER_KEY=${payout.privateKey}`, `MERCHANT_PAYOUT=${payout.address}`);
}
if (lines.length) {
  writeFileSync(file, `${text.trimEnd()}\n\n# AP4M wallets (created by pnpm ap4m:wallets; never commit)\n${lines.join("\n")}\n`, { mode: 0o600 });
}

const final = readFileSync(file, "utf8");
const key = (k) => final.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const agent = new ethers.Wallet(key("AGENT_PRIVATE_KEY")).address;
const payout = new ethers.Wallet(key("MERCHANT_SUBMITTER_KEY")).address;

console.log(lines.length ? "Created wallets in .env.local.\n" : "Wallets already exist in .env.local.\n");
console.log(`Agent wallet            ${agent}`);
console.log(`Merchant payout wallet  ${payout}\n`);
console.log("Next:");
console.log("  1. Portal → My setup: add the Agent wallet and the Merchant payout wallet, then fund the budget.");
console.log("     https://hackathon.ap4m.build/participant");
console.log("  2. Faucet: send testnet XRP for gas to both addresses. https://faucet.testevm.ripple.com");
console.log("  3. Put AP4M_TEAM_NAME and MERCHANT_ID (from My setup) in .env.local.");
