"use client";
import {useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {useAccess} from '@/components/auth/AccessProvider';
import {supabase} from '@/lib/supabase';
import {trialRequest} from '@/lib/trial-request';
import {cleanSeasonName,seasonProblem,needsFarmerStart,shouldOpenFirstMap} from '@/lib/farmer-start';
import {useSeason} from './SeasonProvider';
type Start={operation_name:string;has_season:boolean;has_boundary:boolean};
export default function FarmerStartGate({children}:{children:React.ReactNode}){
 const access=useAccess(),path=usePathname(),router=useRouter(),season=useSeason(),enabled=needsFarmerStart(access,path);
 const [state,setState]=useState<Start|null>(null),[error,setError]=useState(''),[formError,setFormError]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!enabled)return;const abort=new AbortController();let active=true;void trialRequest(signal=>supabase.rpc('get_farmer_start').abortSignal(signal),abort.signal).then(result=>{if(result.error)throw result.error;if(typeof result.data?.has_season!=='boolean'||typeof result.data?.has_boundary!=='boolean')throw new Error('Could not read your farm setup. Please retry.');if(active){setState(result.data as Start);setError('')}}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e.message||'Could not check your farm setup.'))});return()=>{active=false;abort.abort()};},[enabled,access.userId,revision]);
 useEffect(()=>{if(enabled&&shouldOpenFirstMap(state,path))router.replace('/farm-map');},[enabled,state,path,router]);
 if(!enabled)return children;
 async function retry(){setError('');setRevision(n=>n+1);await season.refresh();}
 const failure=error||(state?.has_season?season.error:'');
 if(failure)return <main className="grid min-h-dvh place-items-center bg-[#edf1ee] p-5 text-[#17251c]"><section className="max-w-lg rounded-2xl bg-white p-7"><h1 className="text-2xl font-bold">Couldn’t open your farm</h1><p role="alert" className="my-4">{failure}</p><button className="primary" onClick={()=>void retry()}>Try again</button></section></main>;
 if(!state)return <main className="grid min-h-dvh place-items-center bg-[#edf1ee] text-[#17251c]" role="status">Preparing your farm…</main>;
 if(!state.has_season)return <main className="grid min-h-dvh place-items-center bg-[#edf1ee] p-5 text-[#17251c]"><form className="w-full max-w-lg space-y-5 rounded-2xl border border-[#c4cdd0] bg-white p-6 sm:p-8" onSubmit={async event=>{event.preventDefault();const problem=seasonProblem(name);if(problem){setFormError(problem);return;}setFormError('');setBusy(true);try{const result=await trialRequest(signal=>supabase.rpc('start_farmer_season',{p_name:cleanSeasonName(name)}).abortSignal(signal));if(result.error)throw result.error;await season.refresh();setState({...state,has_season:true});router.replace('/farm-map');}catch(e){setFormError(e instanceof Error?e.message:String((e as {message?:string}).message||'Could not create the season.'));}finally{setBusy(false)}}}>
 <p className="text-sm font-bold text-[#45642b]">Welcome to CropNex</p><h1 className="text-3xl font-bold">Start your first season</h1><p><b>{state.operation_name}</b> is your farming operation. Add a season, then draw your first field on the map.</p>
 <label className="block font-semibold">Season<input autoFocus required placeholder="2026/2027" maxLength={20} value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#86988d] bg-white p-3 text-[#17251c]"/></label><p className="text-sm text-[#42554a]">Next: draw a boundary, name the farm and field, and confirm its hectares. Your farm is saved on the map.</p>{formError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{formError}</p>}<button disabled={busy} className="primary w-full">{busy?'Saving season…':'Save season & draw first field'}</button>
 </form></main>;
 if(shouldOpenFirstMap(state,path))return <main className="grid min-h-dvh place-items-center bg-[#edf1ee] text-[#17251c]" role="status">Opening Farm Map to draw your first field…</main>;
 return children;
}
