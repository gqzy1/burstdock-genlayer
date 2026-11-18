/** Read-only replay of public evidence against the exact source and current finalized chain. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readClient, verifySource, checkReceipt, checkFinalReceipt, checkIntentBinding, checkReadback, readPlan, receiptStatus } from '../sdk/client.js';
import type { Address, PendingWrite } from '../sdk/types.js';
import type { TransactionHash } from 'genlayer-js/types';
const manifest = JSON.parse(await readFile('deployment.json', 'utf8'));
if (manifest.status !== 'DEPLOYED' || manifest.chainId !== 61999 || manifest.rpc !== 'https://studio.genlayer.com/api' || manifest.sdk !== 'genlayer-js@1.1.8')
    throw Error('Incorrect release');
const sha = createHash('sha256').update(await readFile('contracts/burstdock.py')).digest('hex');
if (sha !== manifest.sourceSha256)
    throw Error('Local source digest mismatch');
const client = readClient();
const onchainSha256 = await verifySource(client, manifest.address as Address, sha);
const receipt = await client.getTransaction({ hash: manifest.deployTransaction as TransactionHash });
checkFinalReceipt(receipt, manifest.deployTransaction);
const live = JSON.parse(await readFile('evidence/live.json', 'utf8'));
if (live.deployment.address !== manifest.address)
    throw Error('Evidence address mismatch');
const operations = [];
const plans = new Map();
for (const op of live.operations) {
    const p = op.pending as PendingWrite;
    const r = await client.getTransaction({ hash: p.hash as TransactionHash });
    if (op.expectedError) {
        checkIntentBinding(r, p);
        if (receiptStatus(r) !== 'FINALIZED' || (r as any).result !== 6 || (r as any).leader_only !== false || (r as any).execution_mode !== 'NORMAL')
            throw Error('Negative finality/consensus missing');
        let code = '';
        try {
            checkReceipt(r, p);
        }
        catch (e) {
            code = (e as {
                code: string;
            }).code;
        }
        if (code !== 'TX_FAILED' || !JSON.stringify(r, (_, value) => typeof value === 'bigint' ? value.toString() : value).includes(op.expectedError))
            throw Error('Missing expected execution failure');
    }
    else {
        checkReceipt(r, p);
        if (!plans.has(p.planId))
            plans.set(p.planId, await readPlan(client, manifest.address, p.planId));
        checkReadback(plans.get(p.planId), p);
    }
    if (!op.verified)
        throw Error('Incomplete evidence operation');
    operations.push({ name: op.name, hash: p.hash, status: 'FINALIZED', expectedError: op.expectedError ?? null, verified: true });
}
for (const [id, state] of [[manifest.cancelledPlan, 'CANCELLED'], [manifest.blockedPlan, 'BLOCKED'], [manifest.reviewPlan, 'REVIEW']]) {
    if (plans.get(id)?.state !== state)
        throw Error('Final readback does not match ' + state);
}
const finalPlan = plans.get(live.finalPlan.id);
if (finalPlan?.state !== 'COMMITTED' ||
    finalPlan.approvals.length !== finalPlan.input.members.length ||
    new Set(finalPlan.approvals).size !== finalPlan.approvals.length ||
    !finalPlan.input.members.every((member: {address: string}) => finalPlan.approvals.includes(member.address)))
    throw Error('Missing final independent approvals');
if (finalPlan.observation?.policy.rate !== 25 || finalPlan.observation.policy.burst !== 250 ||
    JSON.stringify(finalPlan.proof?.rows.map((row: {admit_ms: number}) => row.admit_ms)) !== '[0,4000]')
    throw Error('The finalized reference schedule differs from the demonstrated workload');
const result = { kind: 'read-only-live-evidence-reverification', chainId: 61999, sourceSha256: sha, onchainSha256, sourceMatch: sha === onchainSha256, observedAt: new Date().toISOString(), deployment: manifest.deployTransaction, operations, finalPlan, finalPlans: Object.fromEntries(plans), variant: 'latest-final' };
await writeFile('evidence/source-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log('Verified source, deployment, all recorded operations, and latest-final COMMITTED state. No transactions sent.');
