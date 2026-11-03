"use client";
import {useState} from 'react';
import {actionClass,secondaryClass} from '@/components/trials/TrialForms';
import type {AdvisoryField,AdvisoryLink} from '@/types/advisory';

export function groupAdviserLinks(links:AdvisoryLink[]){
 const groups=new Map<string,AdvisoryLink[]>();
 for(const link of links){const key=`${link.owner_id}:${link.advisor_id}`;groups.set(key,[...(groups.get(key)||[]),link]);}
 return [...groups.values()];
}
export default function AdviserConnectionGroups({links,fields,userId,onDecision}:{links:AdvisoryLink[];fields:AdvisoryField[];userId:string|null;onDecision:(ids:string[],status:string)=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=groupAdviserLinks(links.filter(l=>l.advisor_id===userId&&l.status==='Pending'));
 const managed=groupAdviserLinks(links.filter(l=>fields.some(f=>f.id===l.field_id&&f.can_manage)&&['Pending','Active'].includes(l.status)));
 async function decide(list:AdvisoryLink[],status:string){setBusy(true);setError('');try{await onDecision(list.map(l=>l.id),status)}catch(e){setError(e instanceof Error?e.message:'Could not update connections.')}finally{setBusy(false)}}
 if(!pending.length&&!managed.length)return null;
 return <section aria-label="Adviser field connections" className="mb-5 space-y-3">
 {error&&<p role="alert" className="rounded-lg bg-[#482b26] p-3 text-[#ffe1d8]">{error}</p>}
 {pending.map(list=><article key={`pending:${list[0].id}`} className="rounded-xl border border-white/20 bg-[#10271e] p-4"><h2 className="font-bold">Invitation from {list[0].client_name} · {list.length} fields</h2><p className="my-2 text-sm text-[#c0d1c6]">Accept the listed fields together, or open the individual invitations below.</p><details className="mb-3 text-sm"><summary>Review invited fields and shared history</summary>{list.map(l=><p key={l.id}>{l.field_name} — {[l.share_plans&&'plans / input costs',l.share_scouting&&'scouting',l.share_yield&&'yield'].filter(Boolean).join(', ')||'advisory records only'}</p>)}</details><button disabled={busy} className={actionClass} onClick={()=>void decide(list,'Active')}>Accept these {list.length} fields</button> <button disabled={busy} className={secondaryClass} onClick={()=>void decide(list,'Declined')}>Decline these invitations</button></article>)}
 {managed.length>0&&<details className="rounded-xl border border-white/20 bg-[#10271e] p-4"><summary className="cursor-pointer font-semibold">Manage adviser connections across fields</summary><p className="my-2 text-sm text-[#c0d1c6]">Revoke all of an adviser’s listed connections for a client here, or revoke one field under Connections.</p>{managed.map(list=><div key={list[0].id} className="mt-3 border-t border-white/20 pt-3"><b>{list[0].client_name} · {list[0].advisor_name}</b><p className="text-sm">{list[0].advisor_email} · {list.filter(l=>l.status==='Active').length} active · {list.filter(l=>l.status==='Pending').length} pending</p><details className="my-2 text-sm"><summary>Review fields</summary>{list.map(l=><p key={l.id}>{l.field_name} · {l.status}</p>)}</details><button disabled={busy} className={secondaryClass} onClick={()=>{if(window.confirm(`Revoke access to all ${list.length} listed fields for ${list[0].advisor_email}?`))void decide(list,'Revoked')}}>Revoke all {list.length} listed fields</button></div>)}</details>}
 </section>;
}
