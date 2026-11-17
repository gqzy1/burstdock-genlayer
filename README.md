# BurstDock

BurstDock helps teams agree on when to launch shared API batches. GenLayer independently retrieves and interprets Microsoft’s published Azure Resource Manager limits, then the contract computes the earliest feasible FIFO schedule for that reference bucket. Each named member signs the exact plan with a separate wallet.

The model uses the public regional subscription and service-principal bucket for one operation. It starts full and accounts for the sealed workload. Tenant, global and resource-provider limits, concurrent traffic and account-specific entitlements can affect actual capacity. Custom and free/trial cases enter REVIEW. BurstDock sends no Azure traffic and requests no cloud credentials.

## Use it

[Open BurstDock](https://gqzy1.github.io/burstdock-genlayer/). Inspect the published plan, its source and the timing proof, or connect an EIP-1193 wallet on Stable Studionet 61999 to create a plan. Free Studio session wallets can also sign, but their keys disappear when the tab reloads or closes. Use a wallet you control for durable membership.

1. Seal the roster, ordered batches and maximum window.
2. Ask GenLayer consensus to assess the documented policy. A feasible result is READY; an impossible workload is BLOCKED; an unsupported policy is REVIEW.
3. Share the owner-qualified plan link. Each member approves the verified proof digest; the final distinct approval moves it to COMMITTED. A named member can cancel before commitment.
4. If polling times out, open Transactions and resume the original hash.

## Verify and build

Required locally: Node 22.13+ and Python 3.12.

```sh
npm ci
npm ci --prefix frontend
npm test
npm run typecheck
npm test --prefix frontend
npm run build --prefix frontend
npm run check:schema
npm run verify:live
```

The last two commands use the Stable Studionet RPC for read-only verification. See [deployment.json](deployment.json) for the release identity and [evidence](evidence/) for finalized receipts, provenance and readbacks. [Protocol and evidence guide](docs/PROTOCOL.md).
