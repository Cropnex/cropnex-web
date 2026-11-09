"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {trialRequest} from '@/lib/trial-request';
type Client={owner_id:string;client_name:string;field_count:number;shared_ha:number};
export default function AdviserClientNav({onClose}:{onClose:()=>void}){
 const [clients,setClients]=useState<Client[]>([]),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{const abort=new AbortController();let active=true;
 void trialRequest(signal=>supabase.rpc('get_advisory_clients').abortSignal(signal),abort.signal).then(result=>{if(result.error)throw result.error;if(active){setClients(result.data||[]);setError(false)}}).catch(()=>{if(active)setError(true)});
 return()=>{active=false;abort.abort()};},[revision]);
 return <section aria-label="Adviser clients" className="mb-4 rounded-xl border border-white/15 p-3"><p className="mb-2 font-bold text-[#b5df83]">My clients</p>{clients.map(client=><Link key={client.owner_id} href={'/advisory?client='+encodeURIComponent(client.owner_id)} onClick={onClose} className="mb-2 block rounded-lg px-2 py-2 text-white hover:bg-white/10"><span className="block font-semibold">{client.client_name}</span><span className="text-xs text-[#c5d4ca]">{client.field_count} shared fields · {Number(client.shared_ha).toFixed(1)} ha</span></Link>)}{error?<button onClick={()=>setRevision(n=>n+1)} className="text-sm text-[#ffe0b3]">Reload clients</button>:!clients.length&&<p className="text-xs text-[#c5d4ca]">Accepted field invitations appear here.</p>}</section>;
}
