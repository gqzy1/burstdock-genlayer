# BurstDock protocol

`seal` fixes the member addresses, operation, quota basis, horizon and strict FIFO workload. Only named wallets may assess, approve or cancel. Writes carry the expected revision. Approvals additionally bind the policy snapshot and schedule digest, and each member may approve once.

For an assessment, the leader fetches Microsoft’s fixed public document URL and extracts the relevant limits with a JSON model prompt. Validators independently fetch and interpret that same document, then check its byte digest, the proposal’s literal source anchors and every policy field needed for scheduling. A final chain receipt records whether a consensus-backed call succeeded. It does not authenticate a private cloud account. Live documents can change between node reads, and different interpretations or unavailable source data can prevent consensus.

The scheduler works in milli-requests. Each millisecond adds the published refill rate in these units, capped by burst capacity. A batch cannot be divided and cannot overtake the preceding batch. Its admitted time is the earliest millisecond at or after its arrival and predecessor at which the entire cost fits. Remainders carry across admissions. An oversized indivisible batch or a schedule beyond the horizon blocks the plan.

| State | Meaning |
| --- | --- |
| SEALED | Workload fixed, awaiting assessment |
| READY | Feasible public-reference schedule, accepting distinct member approvals |
| REVIEW | A usable reference policy could not be established |
| BLOCKED | The exact schedule cannot meet a sealed constraint |
| COMMITTED | Every named member approved the same digest |
| CANCELLED | A named member cancelled before commitment |

The browser checks the deployed source SHA256 and chain 61999. The SDK records the submitted hash and requires FINALIZED, successful execution, majority agreement and intent binding, then verifies a latest-final readback. An ACCEPTED receipt is provisional. There is no fixture fallback in live reads. Unknown broadcast outcomes need reconciliation with wallet history before another write.

`evidence/live.json` records the CLI acceptance. `evidence/receipts` contains individual receipts and `evidence/source-verification.json` contains an independent read-only replay. `evidence/history` preserves the superseded deployment and the unsuccessful HTTP-response attempt. Write-enabled scripts require explicit Stable Studionet opt-in and local signing material. No private keys are needed for the verification scripts.
