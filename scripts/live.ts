import {publicReceipt} from './receipts.js';
/** Zero-cost acceptance against the verified Stable release. Local keys never enter evidence. */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAccount, createClient, generatePrivateKey } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { BurstDockApi, checkReceipt, checkIntentBinding, receiptStatus, verifySource } from '../sdk/client.js';
import type { Address, Plan, PendingWrite, WriteIntent } from '../sdk/types.js';
if (process.env.ENABLE_WRITE !== 'STABLE_STUDIONET_61999')
    throw Error('Explicit Stable acceptance opt-in required');
const stringify = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2) + '\n';
const load = async (p: string, fallback: any = null) => { try {
    return JSON.parse(await readFile(p, 'utf8'));
}
catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return fallback;
    throw e;
} };
const save = async (p: string, v: unknown) => { await writeFile(p + '.tmp', stringify(v)); await rename(p + '.tmp', p); };
await mkdir('.local', { recursive: true, mode: 0o700 });
await mkdir('evidence/receipts', { recursive: true });
let keys = await load('.local/actors.json');
if (!keys) {
    keys = Object.fromEntries(['owner', 'member', 'outsider'].map(x => [x, generatePrivateKey()]));
    await writeFile('.local/actors.json', stringify(keys), { mode: 0o600, flag: 'wx' });
}
const deployment = await load('artifacts/deployment.json');
if (!deployment || deployment.status !== 'DEPLOYED' || deployment.chainId !== 61999 || deployment.rpc !== 'https://studio.genlayer.com/api')
    throw Error('Run deploy and verify first');
const actors = Object.fromEntries(Object.entries(keys).map(([name, key]) => { const account = createAccount(key as `0x${string}`); return [name, { address: account.address.toLowerCase() as Address, client: createClient({ chain: studionet, endpoint: deployment.rpc, account }) }]; }));
const owner = actors.owner.address, member = actors.member.address;
const api = (actor: string) => new BurstDockApi(actors[actor].client, deployment.address, deployment.sourceSha256, actors[actor].address);
await verifySource(actors.owner.client, deployment.address, deployment.sourceSha256);
const localHash = createHash('sha256').update(await readFile('contracts/burstdock.py')).digest('hex');
if (localHash !== deployment.sourceSha256)
    throw Error('Local source mismatch');
const evidence = await load('evidence/live.json', { kind: 'real-stable-studionet-acceptance', deployment, actors: Object.fromEntries(Object.entries(actors).map(([n, a]) => [n, a.address])), operations: [] });
if (evidence.deployment.address !== deployment.address || evidence.actors.owner !== owner)
    throw Error('Existing acceptance belongs to another release or signer');
async function step(name: string, actor: string, intent: WriteIntent, expectedError?: string): Promise<Plan> {
    let entry = evidence.operations.find((x: any) => x.name === name);
    if (entry?.verified)
        return entry.plan;
    const clientApi = api(actor);
    if (!entry) {
        entry = { name, intent, signer: actors[actor].address, phase: 'SUBMITTING', expectedError, before: intent.method === 'seal' ? null : await clientApi.getPlan(intent.planId) };
        evidence.operations.push(entry);
        await save('evidence/live.json', evidence);
        entry.pending = await clientApi.submit(intent);
        entry.phase = 'SUBMITTED';
        await save('evidence/live.json', evidence);
    }
    if (!entry.pending)
        throw Error('Unknown broadcast outcome; reconcile original signer');
    const pending = entry.pending as PendingWrite;
    if (expectedError) {
        let r: any;
        for (let i = 0; i < 180; i++) {
            r = await actors[actor].client.getTransaction({ hash: pending.hash as import('genlayer-js/types').TransactionHash });
            if (receiptStatus(r) === 'FINALIZED')
                break;
            console.log(name, receiptStatus(r));
            await new Promise(r => setTimeout(r, 5000));
        }
        if (receiptStatus(r) !== 'FINALIZED')
            throw Error('Negative call not finalized; resume original hash');
        let rejected = false;
        try {
            checkReceipt(r, pending);
        }
        catch (e) {
            rejected = (e as {
                code?: string;
            }).code === 'TX_FAILED';
        }
        checkIntentBinding(r, pending);
        if (!rejected || !stringify(r).includes(expectedError) || r.result !== 6 || r.leader_only !== false || r.execution_mode !== 'NORMAL')
            throw Error('Failure did not match expected consensus-backed rejection');
        const plan = await clientApi.getPlan(pending.planId);
        if (stringify(plan) !== stringify(entry.before))
            throw Error('Rejected operation changed state');
        entry.receipt = publicReceipt(r);
        entry.plan = plan;
        entry.rejectionVerified = true;
    }
    else {
        // Exercise timeout recovery once, without a second broadcast.
        if (name === 'seal-main' && !entry.timeoutChecked) {
            try {
                await clientApi.resume(pending, () => { }, 0);
            }
            catch (e) {
                if ((e as {
                    code?: string;
                }).code !== 'WAIT_TIMEOUT')
                    throw e;
                entry.timeoutChecked = { hash: pending.hash, code: 'WAIT_TIMEOUT', resubmitted: false };
                await save('evidence/live.json', evidence);
            }
        }
        const verified = await clientApi.resume(pending, p => console.log(name, p));
        entry.receipt = publicReceipt(verified.receipt);
        entry.plan = verified.plan;
        entry.variant = verified.variant;
        entry.verifiedAt = verified.verifiedAt;
    }
    entry.phase = expectedError ? 'EXPECTED_REJECTION' : 'VERIFIED';
    entry.verified = true;
    await save(`evidence/receipts/${name}.json`, entry.receipt);
    await save('evidence/live.json', evidence);
    return entry.plan;
}
const specification={title:'Shared inventory refresh',operation:'reads' as const,basis:'PUBLIC_DEFAULT' as const,horizon_ms:10000,members:[{name:'Console',address:owner},{name:'Indexer',address:member}],jobs:[{label:'Inventory refresh',member:0,units:180,arrival_ms:0},{label:'Index synchronization',member:1,units:170,arrival_ms:0}]};
const id=owner+':inventory-read';
await step('seal-main','owner',{method:'seal',tag:'inventory-read',specification});
let plan=await step('assess-main','owner',{method:'assess',planId:id,revision:0});
if(plan.state!=='READY'||plan.observation?.policy.rate!==25||plan.observation.policy.burst!==250||JSON.stringify(plan.proof?.rows.map(r=>r.admit_ms))!==JSON.stringify([0,4000]))throw Error('Unexpected reference model or schedule; inspect real accepted source before continuing');
await step('reject-outsider','outsider',{method:'approve',planId:id,revision:1,allocationHash:plan.allocation_hash!},'MEMBER_ONLY');
await step('approve-owner','owner',{method:'approve',planId:id,revision:1,allocationHash:plan.allocation_hash!});
await step('reject-duplicate','owner',{method:'approve',planId:id,revision:2,allocationHash:plan.allocation_hash!},'ALREADY_APPROVED');
plan=await step('approve-member','member',{method:'approve',planId:id,revision:2,allocationHash:plan.allocation_hash!});
if(plan.state!=='COMMITTED'||plan.approvals.length!==2)throw Error('Independent commitment missing');
await step('reject-terminal','member',{method:'cancel',planId:id,revision:3},'TERMINAL');
await step('seal-cancel','owner',{method:'seal',tag:'cancel-example',specification:{...specification,title:'Cancelled launch'}});
const cancelled=await step('cancel','member',{method:'cancel',planId:owner+':cancel-example',revision:0});if(cancelled.state!=='CANCELLED')throw Error('Cancellation missing');
await step('seal-blocked','owner',{method:'seal',tag:'oversized-batch',specification:{...specification,title:'Indivisible burst overflow',jobs:[{...specification.jobs[0],units:251},specification.jobs[1]]}});
const blocked=await step('assess-blocked','owner',{method:'assess',planId:owner+':oversized-batch',revision:0});
if(blocked.state!=='BLOCKED'||blocked.proof?.reason!=='INDIVISIBLE_BATCH_EXCEEDS_BURST')throw Error('Missing real capacity witness');
await step('seal-review','owner',{method:'seal',tag:'trial-review',specification:{...specification,title:'Free trial entitlement review',basis:'FREE_TRIAL'}});
const review=await step('assess-review','owner',{method:'assess',planId:owner+':trial-review',revision:0});if(review.state!=='REVIEW')throw Error('Unverifiable entitlement must stay in REVIEW');
const deploymentReceipt=await load('artifacts/deployment-receipt.json');await save('evidence/receipts/deploy.json',publicReceipt(deploymentReceipt));
evidence.completedAt=new Date().toISOString();evidence.finalPlan=await api('owner').getPlan(id);
evidence.sourceVerification={localSha256:localHash,onchainSha256:deployment.sourceSha256,match:true,verifiedAt:new Date().toISOString()};
await save('evidence/live.json',evidence);
const manifest={...deployment,examplePlan:id,cancelledPlan:cancelled.id,blockedPlan:blocked.id,reviewPlan:review.id,recordedWrites:evidence.operations.map((op:any)=>({name:op.name,pending:op.pending,expectedError:op.expectedError??null}))};
await save('deployment.json',manifest);console.log('Real official-source acceptance complete',deployment.address);
