import assert from 'node:assert/strict';
import test from 'node:test';
import { validate, parseInvitation } from '../src/domain/validation.ts';
import { loadLiveEntries, saveLiveEntry, outstanding } from '../src/domain/liveJournal.ts';

const owner = '0x' + '1'.repeat(40);
const member = '0x' + '2'.repeat(40);
const contract = '0x' + '3'.repeat(40);
const input = {
  title: 'Shared inventory', operation: 'reads', basis: 'PUBLIC_DEFAULT', horizon_ms: 10000,
  members: [{name: 'Console', address: owner}, {name: 'Indexer', address: member}],
  jobs: [{label: 'Inventory', member: 0, units: 180, arrival_ms: 0},
         {label: 'Index', member: 1, units: 170, arrival_ms: 0}]
};

test('one batch per distinct signer yields a valid seal draft', () => {
  assert.deepEqual(validate('inventory-read', input, owner), []);
  assert.match(validate('inventory-read', input, contract).join(' '), /organizer/);
});

test('duplicates, missing work and fractional requests are caught before signing', () => {
  const changed = structuredClone(input);
  changed.members[1].address = owner;
  changed.jobs[1].member = 0;
  changed.jobs[0].units = 0.5;
  assert.match(validate('inventory-read', changed).join(' '), /different wallet.*integer.*at least one batch/);
});

test('owner-qualified invitations parse only exact plan routes', () => {
  const id = owner + ':inventory-read';
  assert.equal(parseInvitation(id), id);
  assert.equal(parseInvitation('https://example.org/#/plans/' + owner + '/inventory-read'), id);
  assert.equal(parseInvitation('https://example.org/#/transactions/inventory-read'), null);
});

test('a timed-out operation retains its hash and blocks another write on the same deployment', () => {
  let raw;
  globalThis.localStorage = {getItem: () => raw, setItem: (_, value) => { raw = value; }};
  const planId = owner + ':inventory-read';
  const hash = '0x' + 'a'.repeat(64);
  const entry = {id: 'first', contract, intent: {method:'assess', planId, revision:0}, signer:owner,
    phase:'UNVERIFIED', pending:{hash}};
  saveLiveEntry(entry);
  assert.equal(loadLiveEntries(true)[0].pending.hash, hash);
  assert.equal(outstanding(loadLiveEntries(true), planId, contract), true);
  assert.equal(outstanding(loadLiveEntries(true), planId, member), false);
  saveLiveEntry({...entry, phase:'FAILED'});
  assert.equal(outstanding(loadLiveEntries(true), planId, contract), false);
  raw = '{';
  assert.throws(() => loadLiveEntries(true), /Reconcile original hashes/);
});
