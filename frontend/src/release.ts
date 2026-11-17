import manifest from '../../deployment.json';
import type {Address} from '../../sdk/types';
export interface Release{protocol:string;status:'NOT_DEPLOYED'|'DEPLOYED';chainId:number;rpc:string;sdk:string;address:Address|null;sourceSha256:string;deployTransaction:string|null;examplePlan?:string;cancelledPlan?:string}
export const RELEASE_MANIFEST=manifest as Release;
export const isDeployedRelease=(m:Release)=>m.protocol==='burstdock-1'&&m.status==='DEPLOYED'&&m.chainId===61999&&m.rpc==='https://studio.genlayer.com/api'&&m.sdk==='genlayer-js@1.1.8'&&/^0x[0-9a-fA-F]{40}$/.test(m.address??'')&&!/^0x0{40}$/i.test(m.address??'')&&/^[a-f0-9]{64}$/.test(m.sourceSha256)&&/^0x[0-9a-fA-F]{64}$/.test(m.deployTransaction??'');
export const SOURCE_URL='https://raw.githubusercontent.com/MicrosoftDocs/azure-docs/main/articles/azure-resource-manager/management/request-limits-and-throttling.md';
export const SOURCE_PAGE='https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling';
