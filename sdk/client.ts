import {createClient,abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionHashVariant,transactionsStatusNumberToName} from 'genlayer-js/types';
import type {Address, Plan, PendingWrite, PlanInput, TxHash, TxPhase, VerifiedWrite, WriteIntent} from './types.js';
import {BurstDockError} from './types.js';

export const CHAIN_ID=61999;
export const RPC='https://studio.genlayer.com/api';
export type Client=ReturnType<typeof createClient>;
export type Provider=NonNullable<Parameters<typeof createClient>[0]>['provider'];
function fail(code: ConstructorParameters<typeof BurstDockError>[0], message: string, hash?: TxHash): never {throw new BurstDockError(code,message,hash)}
const obj=(v: unknown): Record<string,unknown>=>v instanceof Map?Object.fromEntries(v):v!==null&&typeof v==='object'?v as Record<string,unknown>:{};
const lower=(v:unknown)=>typeof v==='string'?v.toLowerCase():'';
export function parseJson<T>(value: unknown): T {
  if(typeof value!=='string')return fail('BAD_RESPONSE','Expected the contract JSON string');
  try{return JSON.parse(value) as T}catch{return fail('BAD_RESPONSE','Invalid contract JSON')}
}
export function readClient():Client{return createClient({chain:studionet,endpoint:RPC})}
export async function assertNetwork(client:Client):Promise<void>{
  if(studionet.id!==CHAIN_ID || await client.getChainId()!==CHAIN_ID)fail('WRONG_NETWORK','Stable Studionet 61999 required');
}
/** Stable Studio is free; fail closed if the RPC starts quoting a fee. */
export async function assertZeroCost(client:Client):Promise<void>{
  await assertNetwork(client);
  const gasPrice = await client.request({method:'eth_gasPrice'});
  if(BigInt(gasPrice as string)!==0n)fail('REJECTED','Network requires payment; no transaction sent');
}
export function guardedProvider(provider:NonNullable<Provider>,signer:Address):NonNullable<Provider>{
  return new Proxy(provider, {get(target,property){
    if(property==='request')return async (request:Parameters<typeof provider.request>[0])=>{
      if(['eth_sendTransaction','eth_signTransaction','personal_sign','eth_signTypedData_v4'].includes(request.method)){
        if(Number(await target.request({method:'eth_chainId'}))!==CHAIN_ID)fail('WRONG_NETWORK','Wallet moved off Stable Studionet');
        const tx=(request.params as Record<string,unknown>[]|undefined)?.[0];
        if(request.method==='eth_sendTransaction' && (!tx || BigInt(String(tx.value??0))!==0n || BigInt(String(tx.gasPrice??-1))!==0n))fail('REJECTED','Only explicit zero-cost transactions are permitted');
        const accounts=await target.request({method:'eth_accounts'}) as string[];
        if(lower(accounts[0])!==lower(signer))fail('SIGNER_CHANGED','Wallet account changed before signing');
      }
      return target.request(request);
    };
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
}
export async function connectWallet(provider: NonNullable<Provider>):Promise<{client:Client;signer:Address}>{
  await provider.request({method:'eth_requestAccounts'});
  try {await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]})}
  catch(e){
    if(obj(e).code!==4902)throw e;
    await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0xf22f',chainName:'GenLayer Stable Studionet',
      nativeCurrency:studionet.nativeCurrency,rpcUrls:[RPC],blockExplorerUrls:[studionet.blockExplorers!.default.url]}]});
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]});
  }
  if(Number(await provider.request({method:'eth_chainId'}))!==CHAIN_ID)fail('WRONG_NETWORK','Wallet network differs');
  const accounts=await provider.request({method:'eth_accounts'}) as Address[];
  if(!accounts[0])fail('REJECTED','No wallet account');
  return {client:createClient({chain:studionet,endpoint:RPC,provider:guardedProvider(provider,accounts[0]),account:accounts[0]}),signer:accounts[0]};
}
export async function verifySource(client:Client,contract:Address,expectedSha256:string):Promise<string>{
  await assertNetwork(client);
  if(!/^0x[0-9a-fA-F]{40}$/.test(contract)||/^0x0{40}$/i.test(contract))fail('NOT_DEPLOYED','No deployed contract configured');
  if(!/^[0-9a-f]{64}$/.test(expectedSha256))fail('SOURCE_MISMATCH','Missing release source hash');
  const code=await client.getContractCode(contract);
  // SDK 1.1.8 returns contract source as text. Do not normalize line endings or trim.
  const bytes=new TextEncoder().encode(code);
  const actual=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(actual!==expectedSha256)fail('SOURCE_MISMATCH','Deployed bytes differ from this release');
  return actual;
}
export async function readPlan(client:Client,contract:Address,id:string):Promise<Plan|null>{
 const raw=await client.readContract({address:contract,functionName:'get_plan',args:[id],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
 if(raw==='')return null;
 const plan=parseJson<Plan>(raw);
 if(plan.id!==id||!Number.isInteger(plan.revision)||!Array.isArray(plan.approvals)||!plan.input||!['SEALED','REVIEW','BLOCKED','READY','COMMITTED','CANCELLED'].includes(plan.state))fail('BAD_RESPONSE','Invalid plan envelope');return plan;
}
export async function listPlans(client:Client,contract:Address,owner:Address):Promise<string[]>{
 const ids=parseJson<unknown>(await client.readContract({address:contract,functionName:'list_plans',args:[owner],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}));
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))return fail('BAD_RESPONSE','Invalid catalogue');return ids as string[];
}
export function argsFor(intent:WriteIntent):(string|number)[]{
  switch(intent.method){
    case 'seal':return [intent.tag,JSON.stringify(intent.specification)];
    case 'approve':return [intent.planId,intent.revision,intent.allocationHash];
    default:return [intent.planId,intent.revision];
  }
}
export function receiptStatus(raw:unknown):string{
  const r=obj(raw),named=r.statusName,value=r.status;
  const mapped=transactionsStatusNumberToName[String(value) as keyof typeof transactionsStatusNumberToName];
  if(typeof named==='string'&&mapped&&named!==mapped)fail('UNVERIFIED_RECEIPT','Conflicting receipt statuses');
  return typeof named==='string'?named:mapped??String(value);
}
export function checkFinalReceipt(raw:unknown,hash:TxHash):void{
  const r=obj(raw);
  if(receiptStatus(r)!=='FINALIZED')fail('UNVERIFIED_RECEIPT','Receipt is not FINALIZED',hash);
  if(lower(r.hash??r.txId)!==lower(hash))fail('UNVERIFIED_RECEIPT','Receipt hash differs',hash);
  if('txExecutionResultName' in r){
    if(r.txExecutionResultName!=='FINISHED_WITH_RETURN')fail('TX_FAILED','Execution failed',hash);
    if(r.resultName!=='MAJORITY_AGREE')fail('CONSENSUS_FAILED','Majority agreement missing',hash);
    if(obj(r.txDataDecoded).leaderOnly!==false)fail('UNVERIFIED_RECEIPT','Full consensus missing',hash);
  }else{
    // Stable Studio returns the legacy envelope through SDK 1.1.8.
    const consensus=obj(r.consensus_data);
    const leaders=Array.isArray(consensus.leader_receipt)?consensus.leader_receipt.map(obj).filter(v=>v.mode==='leader'):[];
    const leader=leaders.at(-1);
    if(!leader || leader.execution_result!=='SUCCESS')fail('TX_FAILED','Leader execution failed or absent',hash);
    if((r.result!==undefined && r.result!==6) || (r.resultName!==undefined && r.resultName!=='MAJORITY_AGREE') || (r.result===undefined && r.resultName===undefined))fail('CONSENSUS_FAILED','Majority agreement missing',hash);
    if(r.leader_only!==false || r.execution_mode!=='NORMAL')fail('UNVERIFIED_RECEIPT','Full consensus missing',hash);
  }
}
export function receiptCall(raw:unknown):Record<string,unknown>{
  const r=obj(raw),decoded=obj(r.txDataDecoded);
  if(decoded.callData)return obj(decoded.callData);
  const encoded=obj(obj(r.data).calldata).base64;
  if(typeof encoded!=='string')return {};
  try{return obj(abi.calldata.decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))))}catch{return {}}
}
export function checkReceipt(raw:unknown,pending:PendingWrite):void{
  checkFinalReceipt(raw,pending.hash);checkIntentBinding(raw,pending);
}
export function checkIntentBinding(raw:unknown,pending:PendingWrite):void{
  const r=obj(raw);
  if(lower(r.hash??r.txId)!==lower(pending.hash))fail('UNVERIFIED_RECEIPT','Receipt hash differs',pending.hash);
  if(lower(r.from_address??r.sender)!==lower(pending.signer)||lower(r.to_address??r.recipient)!==lower(pending.contract))
    fail('UNVERIFIED_RECEIPT','Receipt signer or destination differs',pending.hash);
  if(r.value!==undefined && String(r.value)!=='0')fail('UNVERIFIED_RECEIPT','Unexpected attached value',pending.hash);
  const call=receiptCall(raw);
  if(call.method!==pending.intent.method || canonical(call.args)!==canonical(argsFor(pending.intent)))
    fail('UNVERIFIED_RECEIPT','Receipt calldata differs from submitted intent',pending.hash);
}
export function checkReadback(plan:Plan|null,pending:PendingWrite):asserts plan is Plan{
  if(!plan || plan.id!==pending.planId)fail('READBACK_MISMATCH','Plan missing after finality',pending.hash);
  const intent=pending.intent;
  if(intent.method==='seal'){
    const expected:PlanInput=structuredClone(intent.specification);
    expected.members.forEach(m=>m.address=m.address.toLowerCase() as Address);
    if(JSON.stringify(plan.input)!==JSON.stringify(expected)){
      // JSON object key order is irrelevant, including nested dictionaries.
      if(canonical(plan.input)!==canonical(expected))fail('READBACK_MISMATCH','Sealed input differs',pending.hash);
    }
    if(lower(plan.owner)!==lower(pending.signer))fail('READBACK_MISMATCH','Owner differs',pending.hash);
  }else{
    if(plan.revision<intent.revision+1)fail('READBACK_MISMATCH','Revision has not advanced',pending.hash);
    if(intent.method==='assess' && (!plan.observation||!plan.proof||!plan.allocation_hash))fail('READBACK_MISMATCH','Assessment missing',pending.hash);
    if(intent.method==='approve' && (plan.allocation_hash!==intent.allocationHash || !plan.approvals.some(a=>lower(a)===lower(pending.signer))))
      fail('READBACK_MISMATCH','Signed allocation missing',pending.hash);
    if(intent.method==='cancel' && (plan.state!=='CANCELLED'||lower(plan.cancelled_by)!==lower(pending.signer)))
      fail('READBACK_MISMATCH','Cancellation missing',pending.hash);
  }
}
function canonical(value:unknown):string{
  if(typeof value==='bigint')return value.toString();
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(obj(value)[k])).join(',')+'}';
  return JSON.stringify(value);
}
export class BurstDockApi {
  private busy=false;
  constructor(public client:Client,public readonly contract:Address,public readonly sourceSha256:string,public readonly signer:Address){}
  getPlan=(id:string)=>readPlan(this.client,this.contract,id);
  listPlans=(owner:Address)=>listPlans(this.client,this.contract,owner);
  async submit(intent:WriteIntent,onPhase:(phase:TxPhase)=>void=()=>{}):Promise<PendingWrite>{
    if(this.busy)fail('BUSY','One signing operation at a time');
    this.busy=true;
    const frozen=structuredClone(intent);
    try{
      await verifySource(this.client,this.contract,this.sourceSha256);
      await assertZeroCost(this.client);
      const accounts=await this.client.getAddresses();
      if(lower(accounts[0])!==lower(this.signer))fail('SIGNER_CHANGED','Reconnect the selected wallet');
      onPhase('AWAITING_SIGNATURE');
      const hash:unknown=await this.client.writeContract({address:this.contract,functionName:frozen.method,args:argsFor(frozen),value:0n,leaderOnly:false});
      if(typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash))return fail('BAD_RESPONSE','Missing transaction hash; reconcile wallet before retrying');
      const pending:PendingWrite={hash:hash as TxHash,signer:this.signer,contract:this.contract,planId:frozen.method==='seal'?this.signer.toLowerCase()+':'+frozen.tag:frozen.planId,intent:frozen,submittedAt:new Date().toISOString()};
      onPhase('SUBMITTED');return pending;
    }finally{this.busy=false}
  }
  async resume(pending:PendingWrite,onPhase:(phase:TxPhase)=>void=()=>{},timeoutMs=900000,intervalMs=5000):Promise<VerifiedWrite>{
    if(lower(pending.contract)!==lower(this.contract))fail('UNVERIFIED_RECEIPT','Pending operation belongs to another contract',pending.hash);
    await assertNetwork(this.client);
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      // Transport failures bubble up with pending preserved by the caller. Never resubmit here.
      const receipt=await this.client.getTransaction({hash:pending.hash as import('genlayer-js/types').TransactionHash});
      const status=receiptStatus(receipt);
      if(status==='FINALIZED'){
        checkReceipt(receipt,pending);onPhase('READING_BACK');
        const plan=await this.getPlan(pending.planId);checkReadback(plan,pending);
        onPhase('VERIFIED');return {pending,receipt,plan,verifiedAt:new Date().toISOString(),variant:'latest-final'};
      }
      if(['CANCELED','UNDETERMINED','VALIDATORS_TIMEOUT','LEADER_TIMEOUT'].includes(String(status)))fail('CONSENSUS_FAILED',String(status),pending.hash);
      if(typeof status==='string')onPhase(status as TxPhase);
      await new Promise(resolve=>setTimeout(resolve,intervalMs));
    }
    return fail('WAIT_TIMEOUT','Still unverified; retain this hash and resume polling',pending.hash);
  }
}
