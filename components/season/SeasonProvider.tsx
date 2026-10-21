"use client";

import { createContext,useCallback,useContext,useEffect,useMemo,useState } from "react";
import { supabase } from "@/lib/supabase";

type SeasonContextValue={currentSeason:string;seasons:string[];loading:boolean;error:string|null;setCurrentSeason:(season:string)=>Promise<void>;refresh:()=>Promise<void>};
const SeasonContext=createContext<SeasonContextValue>({currentSeason:"",seasons:[],loading:true,error:null,setCurrentSeason:async()=>{},refresh:async()=>{}});
function withTimeout<T>(promise:Promise<T>,milliseconds:number,message:string){return new Promise<T>((resolve,reject)=>{const timeout=window.setTimeout(()=>reject(new Error(message)),milliseconds);promise.then(value=>{window.clearTimeout(timeout);resolve(value)},reason=>{window.clearTimeout(timeout);reject(reason)})})}

export function SeasonProvider({children}:{children:React.ReactNode}){
 const[currentSeason,setCurrent]=useState("");const[seasons,setSeasons]=useState<string[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  setLoading(true);setError(null);const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),15000);
  try{
   const{data:auth,error:authError}=await withTimeout(supabase.auth.getSession(),15000,"CropNex could not check your sign-in session. Check your connection and try again.");if(authError)throw authError;
   const user=auth.session?.user;if(!user){setCurrent("");setSeasons([]);return}
   const[seasonRows,fieldRows,preference]=await Promise.all([
    supabase.from("farm_seasons").select("name,created_at").order("created_at",{ascending:false}).abortSignal(controller.signal),
    supabase.from("fields").select("season").not("season","is",null).abortSignal(controller.signal),
    supabase.from("user_season_preferences").select("current_season").eq("user_id",user.id).abortSignal(controller.signal).maybeSingle(),
   ]);
   const queryError=seasonRows.error||fieldRows.error||preference.error;if(queryError)throw queryError;
   const names=Array.from(new Set([...((seasonRows.data||[]) as {name:string}[]).map(row=>String(row.name)),...((fieldRows.data||[]) as {season:string|null}[]).map(row=>String(row.season)).filter(Boolean)]));
   setSeasons(names);const saved=preference.data?.current_season;const selected=(saved&&names.includes(saved)?saved:names[0])||"";setCurrent(selected);
   if(selected&&selected!==saved){const{error:saveError}=await supabase.from("user_season_preferences").upsert({user_id:user.id,current_season:selected,updated_at:new Date().toISOString()},{onConflict:"user_id"}).abortSignal(controller.signal);if(saveError)throw saveError}
  }catch(reason){setError(controller.signal.aborted?"Season data did not respond within 15 seconds. Check your connection and try again.":reason instanceof Error?reason.message:"CropNex could not load your farm season.")}
  finally{window.clearTimeout(timeout);setLoading(false)}
 },[]);
 const choose=useCallback(async(season:string)=>{if(!season)return;const{data:auth}=await supabase.auth.getSession();const user=auth.session?.user;if(!user)return;const{error:saveError}=await supabase.from("user_season_preferences").upsert({user_id:user.id,current_season:season,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(saveError){alert(saveError.message);return}setCurrent(season);window.localStorage.setItem("agcore-current-season",season);window.dispatchEvent(new CustomEvent("agcore-season-change",{detail:season}));},[]);
 useEffect(()=>{void refresh()},[refresh]);
 const value=useMemo(()=>({currentSeason,seasons,loading,error,setCurrentSeason:choose,refresh}),[currentSeason,seasons,loading,error,choose,refresh]);
 return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
}
export function useSeason(){return useContext(SeasonContext)}
