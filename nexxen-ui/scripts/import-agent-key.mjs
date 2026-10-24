/**
 * Turn a seed phrase into the Agent wallet's private key, locally.
 *
 *   pnpm ap4m:import-key [expected-address]
 *
 * Asks for the phrase with hidden input, derives the usual wallet accounts
 * (MetaMask-style m/44'/60'/0'/0/i and Ledger Live-style m/44'/60'/i'/0/0),
 * and writes AGENT_PRIVATE_KEY to .env.local only for the account matching the
 * registered Agent wallet. The phrase is never stored, logged or sent anywhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { ethers } from "ethers";

const expected = (process.argv[2] || "0xe3D841aE3Acc8Dc79577092C141205f3d0Bf5183").toLowerCase();

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(text);
      else if (text.includes("\n")) rl.output.write("\n");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const phrase = (await askHidden("Seed phrase (input hidden): ")).trim().toLowerCase().split(/\s+/).join(" ");
if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
  console.error("That is not a valid seed phrase (check spelling and word count).");
  process.exit(1);
}

const paths = [];
for (let i = 0; i < 20; i++) paths.push(`m/44'/60'/0'/0/${i}`, `m/44'/60'/${i}'/0/0`);

let match = null;
for (const path of paths) {
  const w = ethers.HDNodeWallet.fromPhrase(phrase, undefined, path);
  if (w.address.toLowerCase() === expected) {
    match = { path, wallet: w };
    break;
  }
}
if (!match) {
  console.error(`No account in the first 20 of this phrase matches ${expected}. Nothing was written.`);
  process.exit(1);
}

const file = new URL("../.env.local", import.meta.url);
let text = readFileSync(file, "utf8");
if (/^AGENT_PRIVATE_KEY=.*$/m.test(text)) {
  text = text.replace(/^AGENT_PRIVATE_KEY=.*$/m, `AGENT_PRIVATE_KEY=${match.wallet.privateKey}`);
} else {
  text = `${text.trimEnd()}\nAGENT_PRIVATE_KEY=${match.wallet.privateKey}\n`;
}
writeFileSync(file, text, { mode: 0o600 });
console.log(`Found ${match.wallet.address} at ${match.path}. Saved its private key as AGENT_PRIVATE_KEY in .env.local.`);
