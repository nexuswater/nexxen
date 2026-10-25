# Read-only RPC provider selection

The default remains the public XRPL EVM testnet RPC. No `.env` file is automatically read. The operator may use the existing secure local environment mechanism to supply `AP4M_RPC_PROVIDER=quicknode` and a private `AP4M_RPC_URL`. Never paste that URL into chat, command arguments, screenshots, source or artifacts. This change does not install credentials or configure an endpoint.

Quicknode selection requires an HTTPS `*.quiknode.pro` endpoint with no userinfo, query, fragment or custom port. The private path stays in process memory. Unsupported custom domains require separate review. No silent fallback: missing/invalid Quicknode configuration fails, and a supplied URL without explicit Quicknode mode fails. To deliberately return to public mode, unset the private URL and select `public`.

Before reading receipt context, the verifier asks the selected node for chain ID and requires 1449000. It reuses the pinned AP4M SDK 0.10.1 full receipt verification and existing exact expected-order fence. The provider exposes only chain reads; no signer or broadcast method is used. Private RPC requests prohibit redirects and have a 15-second transport timeout. SDK verification has a 90-second deadline. Failure output is an allowlisted code, never the underlying provider error or URL. Provenance reports only public/Quicknode provider class, chain ID, redacted endpoint and `fallbackUsed:false`.

Tests use fabricated endpoints and mocked transports. An actual Quicknode endpoint, archive availability, successful Quicknode verification and hackathon-track registration are not yet verified. No credentials, signup, subscription or new payment is created by this implementation.
