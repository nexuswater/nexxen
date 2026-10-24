# Simulated funding handoff

This demo does not deposit XRPL EVM RLUSD into Marqeta. It adapts the existing core card cycle and local SQLite accounting. No external APIs, credentials, signer or SDK are imported by the server's rehearsal path.

## Show the demo

Open http://127.0.0.1:3001/#cards. Run the successful simulation, inspect its local record, then select the 0.02 RLUSD over-budget example and run it. The latter queues human review without funding or hardware signing. Funding-failure and GPU-decline outcomes remain available.

The normal source reservation is 0.01 fixture RLUSD (one local integer hundredth). The USD fixture separately allocates $0.01; it is not calculated with an exchange rate. Fees, income and borrowing are zero. Source policy usage is counted once, downstream USD spending consumes only the USD fixture. Atomic transactions, capacity checks, durable idempotency and rollback remain in force. The dedicated 0.01 per-request rehearsal cap also applies when shared mandate settings are higher. Existing stored cycle values are not rewritten.

## Historical evidence is not simulation output

`lib/evidence-snapshot.mjs` records the parent task's last independent chain observation: 2026-10-24 22:38:49 UTC, 0.001 RLUSD claim, paid=false, zero settlement digest. The UI labels it blocked/unpaid and does not refresh or turn it green after a rehearsal. It is not a canonical settlement receipt.

The separate Marqeta panel describes the previously verified isolated $1 sandbox hold, response 0000, state PENDING, available USD 0 and ledger USD 1. It was not funded by this AP4M claim. No load, authorization, reversal or clearing is repeated. No GPU is delivered.

## Mac run and validation

Source base: e4894d0d2742e2a519fcc11ec07d1ffb5cd22118, sparse core checkout under the task workspace. Downloads/NEXXEN, its .env.local and its data remain untouched. No teammate UI files were checked out. A fresh local `data/nexxen.sqlite` stores rehearsals only.

The Homebrew Node executable is broken (missing libsimdjson.31.dylib). Existing `/usr/local/bin/node` v22.20.0 runs this demo and all 133 tests successfully; the repository's declared supported target remains Node 24+. No runtime installation or system repair was performed.

```sh
PORT=3001 /usr/local/bin/node server.mjs
/usr/local/bin/node --test test/*.test.mjs adapters/*.test.mjs
/usr/local/bin/node --check server.mjs
/usr/local/bin/node --check lib/store.mjs
/usr/local/bin/node --check public/app.js
```

Full suite: 133 passed, zero failures or cancellations with loopback access. Initial sandbox-only HTTP tests could not bind; rerunning with approved loopback access passed. Browser QA verified successful rehearsal, zero-funded blocked review, unchanged historical panels and readable desktop layout. Real integration adapters were tested only with mocks. Publishing is left to the parent task.
