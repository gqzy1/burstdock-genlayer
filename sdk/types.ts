export type Address=`0x${string}`;
export type TxHash=`0x${string}`;
export type Operation='reads'|'writes'|'deletes';
export interface Member{name:string;address:Address}
export interface Job{label:string;member:number;units:number;arrival_ms:number}
export interface PlanInput{title:string;operation:Operation;basis:'PUBLIC_DEFAULT'|'ACCOUNT_CUSTOM'|'FREE_TRIAL';horizon_ms:number;members:Member[];jobs:Job[]}
export interface Policy{status:'KNOWN'|'UNKNOWN';rate:number|null;burst:number|null;algorithm:'TOKEN_BUCKET'|null;scope:'SUBSCRIPTION_PRINCIPAL_OPERATION_REGION'|null;qualified:boolean|null;evidence:Record<string,string>;reason:string}
export interface Row{job:number;member:number;arrival_ms:number;admit_ms:number;wait_ms:number;refill_wait_ms:number;before_milli:number;after_milli:number;consumed_milli:number}
export interface Proof{status:'REVIEW'|'BLOCKED'|'READY';rows:Row[];reason?:string;job?:number;requested?:number;capacity?:number;blockers?:{job:number;earliest_ms:number;excess_ms:number}[];finish_ms?:number;total_requests?:number;capacity_milli?:number;remaining_milli?:number;rate_per_second?:number}
export interface Plan{id:string;owner:Address;input:PlanInput;input_hash:string;state:'SEALED'|'REVIEW'|'BLOCKED'|'READY'|'COMMITTED'|'CANCELLED';revision:number;approvals:Address[];observation?:{policy:Policy;source_sha256:string};proof?:Proof;allocation_hash?:string;cancelled_by?:Address}
export type WriteIntent={method:'seal';tag:string;specification:PlanInput}|{method:'assess'|'cancel';planId:string;revision:number}|{method:'approve';planId:string;revision:number;allocationHash:string};
export type TxPhase='AWAITING_SIGNATURE'|'SUBMITTED'|'PENDING'|'PROPOSING'|'COMMITTING'|'REVEALING'|'ACCEPTED'|'READY_TO_FINALIZE'|'APPEAL_COMMITTING'|'APPEAL_REVEALING'|'FINALIZED'|'READING_BACK'|'VERIFIED';
export interface PendingWrite{hash:TxHash;signer:Address;contract:Address;planId:string;intent:WriteIntent;submittedAt:string}
export interface VerifiedWrite{pending:PendingWrite;receipt:unknown;plan:Plan;verifiedAt:string;variant:'latest-final'}
export type ErrorCode='WRONG_NETWORK'|'NOT_DEPLOYED'|'SOURCE_MISMATCH'|'BAD_RESPONSE'|'BUSY'|'SIGNER_CHANGED'|'REJECTED'|'TX_FAILED'|'CONSENSUS_FAILED'|'WAIT_TIMEOUT'|'READBACK_MISMATCH'|'UNVERIFIED_RECEIPT';
export class BurstDockError extends Error{constructor(public code:ErrorCode,message:string,public hash?:TxHash){super(message);this.name='BurstDockError'}}
