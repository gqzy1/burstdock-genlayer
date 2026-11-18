/** Read-only replay of transaction intents captured from the public application. */
import { readFile, writeFile } from 'node:fs/promises';
import { readClient, verifySource, checkReceipt, checkReadback, readPlan } from '../sdk/client.js';
import { publicReceipt } from './receipts.js';
import type { Address, PendingWrite } from '../sdk/types.js';
import type { TransactionHash } from 'genlayer-js/types';

const path = process.argv[2];
if (!path) throw Error('Run with a JSON file containing the original browser journal entries');
const manifest = JSON.parse(await readFile('deployment.json', 'utf8'));
if (manifest.protocol !== 'burstdock-1' || manifest.status !== 'DEPLOYED' || manifest.chainId !== 61999 ||
    manifest.rpc !== 'https://studio.genlayer.com/api' || manifest.sdk !== 'genlayer-js@1.1.8')
    throw Error('Incorrect release');
const observed: { site: string; operations: PendingWrite[] } = JSON.parse(await readFile(path, 'utf8'));
const client = readClient();
const address = manifest.address as Address;
const sourceSha256 = await verifySource(client, address, manifest.sourceSha256);
const operations = [];
const plans = new Map();
for (const pending of observed.operations) {
    if (pending.contract.toLowerCase() !== address.toLowerCase()) throw Error('Unexpected contract');
    const receipt = await client.getTransaction({ hash: pending.hash as TransactionHash });
    checkReceipt(receipt, pending);
    if (!plans.has(pending.planId)) plans.set(pending.planId, await readPlan(client, address, pending.planId));
    const plan = plans.get(pending.planId);
    checkReadback(plan, pending);
    operations.push({ pending, receipt: publicReceipt(receipt), plan, variant: 'latest-final' });
}
if (!operations.length) throw Error('No browser transaction to verify');
await writeFile('evidence/browser-live.json', JSON.stringify({
    kind: 'real-browser-chain-acceptance', site: observed.site, chainId: 61999, address, sourceSha256,
    observedAt: new Date().toISOString(), operations, finalPlans: Object.fromEntries(plans)
}, null, 2) + '\n');
console.log('Browser intents, finalized consensus-backed receipts and final states verified.');
