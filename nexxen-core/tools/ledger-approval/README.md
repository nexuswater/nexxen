# Local fixture Ledger approval panel

This separate panel is served by the fixture dashboard at `/approval` (currently http://127.0.0.1:3001/approval). It does not change the independently published read-only readiness tool on port 3002.

The server defaults to **disabled**. Only an explicitly approved local authority record with `signingUiEnabled: true` enables this reviewed fixture UI. No HTTP enrollment or enablement endpoint exists. Both the signing coordinator and HTTP submission route reject when disabled. No physical message signature has been tested or requested.

Build using `node tools/ledger-approval/build.mjs` after installing the pinned official dependencies in `tools/ledger-browser` with its lockfile and `npm ci --ignore-scripts`. The generated `dist/` is ignored. No additional SDK or runtime external service is required. CSP restricts network traffic to this local server.

After review and a separately coordinated enablement, the user prepares a single blocked request in the dashboard, opens this panel, selects and reviews the server-held challenge, clicks Connect Ledger, verifies the enrolled public address on Flex, checks the review acknowledgement, and clicks Sign this one local exception on Flex. No device operation starts on page load. Reject unreadable or hash-only prompts. Only the stored canonical ASCII EIP-191 message reaches `signMessage`; no transaction, typed-data or generic signer endpoint exists.

The trust root is a local SQLite config record, entered by the operator only after Josh's explicit enrollment approval. It records actor, time, address and scope. It is not committed and has no HTTP enrollment endpoint. Scope is NEXXEN local fixture business, chain context 1449000, PER_REQUEST_LIMIT_ONLY, maximum 0.02 fixture RLUSD. This creates no real/testnet authority, funds or channel cap. Public firmware/app observations are recorded as user-observed readiness, not cryptographic device attestation. Browser-supplied addresses never establish authority.

The server rechecks the exact stored message, trusted signer, nonce, request revision, policy, expiry and fresh capacity inside its transaction. Original blocked requests remain unchanged. One separately linked fixture reservation consumes capacity once. Denial/disconnect fences later signing or submission; an already-sent HTTP submission cannot be rolled back by browser cancellation. Refresh challenge status after an uncertain response before any retry. No automatic retry or hot-key fallback exists. Signature evidence is never labelled proof of physical hardware provenance.
