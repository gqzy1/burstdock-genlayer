import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { connectWallet, readClient, verifySource, BurstDockApi, type Client, type Provider } from '../../../sdk/client';
import type { Address, WriteIntent, VerifiedWrite } from '../../../sdk/types';
import { RELEASE_MANIFEST as release, isDeployedRelease } from '../release';
import { loadLiveEntries, saveLiveEntry, intentPlan, outstanding, type LiveEntry } from '../domain/liveJournal';
const reader = readClient();
interface WalletState {
    signer: Address | null;
    sourceReady: boolean;
    error: string;
    busy: boolean;
    entries: LiveEntry[];
    client: Client;
    connect: () => Promise<void>;
    session: () => Promise<void>;
    disconnect: () => void;
    send: (i: WriteIntent) => Promise<VerifiedWrite>;
    resume: (e: LiveEntry) => Promise<VerifiedWrite>;
    checkSource: () => Promise<void>;
}
const Context = createContext<WalletState>(null!);
export const useWallet = () => useContext(Context);
export function WalletProvider({ children }: {
    children: React.ReactNode;
}) {
    const [wallet, setWallet] = useState<{
        signer: Address;
        client: Client;
    } | null>(null), [sourceReady, setSourceReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [entries, setEntries] = useState(loadLiveEntries);
    const lock = useRef(false);
    const checkSource = async () => { setSourceReady(false); try {
        if (!isDeployedRelease(release))
            throw Error('No verified deployment configured');
        await verifySource(reader, release.address!, release.sourceSha256);
        setSourceReady(true);
        setError('');
    }
    catch (e) {
        setError(String(e));
        throw e;
    } };
    useEffect(() => { void checkSource().catch(() => { }); }, []);
    const refresh = () => setEntries(loadLiveEntries());
    useEffect(() => { window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh); }, []);
    useEffect(() => {
        const p = (window as unknown as {
            ethereum?: {
                on?: (name: string, fn: () => void) => void;
                removeListener?: (name: string, fn: () => void) => void;
            };
        }).ethereum;
        const invalidate = () => { setWallet(null); setError('Wallet changed or disconnected. Reconnect before signing; existing hashes are retained.'); };
        for (const n of ['chainChanged', 'accountsChanged', 'disconnect'])
            p?.on?.(n, invalidate);
        return () => { for (const n of ['chainChanged', 'accountsChanged', 'disconnect'])
            p?.removeListener?.(n, invalidate); };
    }, []);
    const connect = async () => { try {
        const p = (window as unknown as {
            ethereum?: Provider;
        }).ethereum;
        if (!p)
            throw Error('Install an EIP-1193 wallet, or use a free Studio session wallet');
        const w = await connectWallet(p);
        await checkSource();
        setWallet(w);
        setError('');
    }
    catch (e) {
        setError(String(e));
    } };
    const session = async () => { try {
        await checkSource();
        const account = createAccount();
        setWallet({ signer: account.address as Address, client: createClient({ chain: studionet, endpoint: release.rpc, account }) });
        setError('');
    }
    catch (e) {
        setError(String(e));
    } };
    const store = (e: LiveEntry) => { saveLiveEntry(e); refresh(); };
    const poll = async (entry: LiveEntry) => {
        if (!entry.pending)
            throw Error('No hash recorded. Reconcile this wallet’s chain history before retrying.');
        const pending=entry.pending;
        entry = {...entry, verified: undefined, error: undefined, phase: 'RECHECKING'};
        store(entry);
        const api = new BurstDockApi(reader, release.address!, release.sourceSha256, pending.signer);
        try {
            await checkSource();
            const verified = await api.resume(pending, p => { entry = { ...entry, phase: p, error: undefined }; store(entry); });
            store({ ...entry, verified, phase: 'VERIFIED', error: undefined });
            return verified;
        }
        catch (e) {
            const code = (e as {
                code?: string;
            }).code;
            store({ ...entry, phase: ['TX_FAILED', 'CONSENSUS_FAILED'].includes(code ?? '') ? 'FAILED' : 'UNVERIFIED', error: String(e) });
            throw e;
        }
    };
    const resume = async (e: LiveEntry) => { if (lock.current)
        throw Error('One operation at a time'); lock.current = true; setBusy(true); try {
        return await poll(e);
    }
    finally {
        lock.current = false;
        setBusy(false);
    } };
    const send = async (intent: WriteIntent) => {
        if (lock.current || !wallet || !sourceReady)
            throw Error('Connect a wallet and verify the source before submitting');
        if (outstanding(loadLiveEntries(true), intentPlan(intent, wallet.signer), release.address!))
            throw Error('An unresolved operation exists for this plan. Resume its original hash; do not submit again.');
        lock.current = true;
        setBusy(true);
        setError('');
        let entry: LiveEntry = { id: crypto.randomUUID(), contract: release.address!, signer: wallet.signer, intent: structuredClone(intent), phase: 'SUBMITTING' };
        try {
            store(entry);
            const api = new BurstDockApi(wallet.client, release.address!, release.sourceSha256, wallet.signer);
            entry = { ...entry, pending: await api.submit(intent), phase: 'SUBMITTED' };
            store(entry);
            return await poll(entry);
        }
        catch (e) {
            if (!entry.pending) {
                const rejected = (e as {
                    code?: number | string;
                }).code;
                entry = { ...entry, phase: rejected === 4001 || ['REJECTED', 'WRONG_NETWORK', 'SIGNER_CHANGED', 'SOURCE_MISMATCH'].includes(String(rejected)) ? 'REJECTED' : 'SUBMISSION_UNKNOWN', error: String(e) };
                store(entry);
            }
            setError(String(e));
            throw e;
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return <Context.Provider value={{ signer: wallet?.signer ?? null, client: reader, sourceReady, error, busy, entries, connect, session, disconnect: () => setWallet(null), send, resume, checkSource }}>{children}</Context.Provider>;
}
