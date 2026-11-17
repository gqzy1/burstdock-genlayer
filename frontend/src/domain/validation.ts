import type {PlanInput} from '../../../sdk/types';
export const addressValid=(s:string)=>/^0x[0-9a-fA-F]{40}$/.test(s)&&!/^0x0{40}$/i.test(s);
export function validate(tag:string,input:PlanInput,signer?:string|null):string[]{
 const errors:string[]=[];
 if(!/^[a-z0-9-]{3,32}$/.test(tag))errors.push('Tag needs 3–32 lowercase letters, digits or hyphens.');
 if(input.title.trim()!==input.title||input.title.length<3||input.title.length>100)errors.push('Title needs 3–100 characters without edge spaces.');
 if(!['reads','writes','deletes'].includes(input.operation))errors.push('Choose a documented operation.');
 if(!['PUBLIC_DEFAULT','ACCOUNT_CUSTOM','FREE_TRIAL'].includes(input.basis))errors.push('Choose a reference basis.');
 if(!Number.isInteger(input.horizon_ms)||input.horizon_ms<1||input.horizon_ms>60000)errors.push('Window must be an integer between 1 and 60,000 ms.');
 if(input.members.length<2||input.members.length>4)errors.push('Use 2–4 independently controlled member wallets.');
 input.members.forEach((m,i)=>{if(!m.name.trim()||m.name!==m.name.trim()||m.name.length>40)errors.push(`Client ${i+1} needs a short name.`);if(!addressValid(m.address))errors.push(`Client ${i+1} needs a valid nonzero wallet address.`)});
 if(new Set(input.members.map(m=>m.address.toLowerCase())).size!==input.members.length)errors.push('Every member must use a different wallet.');
 if(new Set(input.members.map(m=>m.name.toLowerCase())).size!==input.members.length)errors.push('Member names must be distinct.');
 if(signer&&!input.members.some(m=>m.address.toLowerCase()===signer.toLowerCase()))errors.push('The connected organizer must be in the roster.');
 if(input.jobs.length<input.members.length||input.jobs.length>8)errors.push('Use up to 8 batches, with work for every client.');
 input.jobs.forEach((j,i)=>{if(!j.label.trim()||j.label!==j.label.trim()||j.label.length>60)errors.push(`Batch ${i+1} needs a short label.`);if(!Number.isInteger(j.member)||!input.members[j.member])errors.push(`Batch ${i+1} needs a roster member.`);if(!Number.isInteger(j.units)||j.units<1||j.units>1000000)errors.push(`Batch ${i+1} requests must be an integer from 1 to 1,000,000.`);if(!Number.isInteger(j.arrival_ms)||j.arrival_ms<0||j.arrival_ms>60000)errors.push(`Batch ${i+1} arrival must be an integer from 0 to 60,000 ms.`)});
 if(input.members.some((_,i)=>!input.jobs.some(j=>j.member===i)))errors.push('Each member needs at least one batch.');
 if(/[\u0000-\u001f\u007f]/.test([input.title,...input.members.map(m=>m.name),...input.jobs.map(j=>j.label)].join('')))errors.push('Remove control characters.');
 return errors;
}
export function parseInvitation(value:string):string|null{
 const s=value.trim();const direct=/^(0x[0-9a-fA-F]{40}):([a-z0-9-]{3,32})$/.exec(s);
 if(direct&&addressValid(direct[1]))return direct[1].toLowerCase()+':'+direct[2];
 try{const url=new URL(s);const m=/^#\/plans\/(0x[0-9a-fA-F]{40})\/([a-z0-9-]{3,32})$/.exec(url.hash);if(m&&addressValid(m[1]))return m[1].toLowerCase()+':'+m[2]}catch{}
 return null;
}
export const seconds=(ms:number)=>`${(ms/1000).toFixed(ms%1000===0?1:3)}s`;
