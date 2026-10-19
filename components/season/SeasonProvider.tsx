"use client";

import { createContext,useContext,useEffect,useMemo,useState } from "react";
import { supabase } from "@/lib/supabase";

type SeasonContextValue={currentSeason:string;seasons:string[];loading:boolean;setCurrentSeason:(season:string)=>Promise<void>;refresh:()=>Promise<void>};
const SeasonContext=createContext<SeasonContextValue>({currentSeason:"",seasons:[],loading:true,setCurrentSeason:async()=>{},refresh:async()=>{}});

export function SeasonProvider({children}:{children:React.ReactNode}){
 const[currentSeason,setCurrent]=useState("");const[seasons,setSeasons]=useState<string[]>([]);const[loading,setLoading]=useState(true);
 async function refresh(){setLoading(true);const{data:auth}=await supabase.auth.getUser();if(!auth.user){setLoading(false);return}const[seasonRows,fieldRows,preference]=await Promise.all([supabase.from("farm_seasons").select("name,created_at").order("created_at",{ascending:false}),supabase.from("fields").select("season").not("season","is",null),supabase.from("user_season_preferences").select("current_season").eq("user_id",auth.user.id).maybeSingle()]);const names=Array.from(new Set([...((seasonRows.data||[]) as {name:string}[]).map(row=>String(row.name)),...((fieldRows.data||[]) as {season:string|null}[]).map(row=>String(row.season)).filter(Boolean)]));setSeasons(names);const saved=preference.data?.current_season;const selected=(saved&&names.includes(saved)?saved:names[0])||"";setCurrent(selected);if(selected&&selected!==saved)await supabase.from("user_season_preferences").upsert({user_id:auth.user.id,current_season:selected,updated_at:new Date().toISOString()},{onConflict:"user_id"});setLoading(false)}
 async function choose(season:string){if(!season)return;const{data:auth}=await supabase.auth.getUser();if(!auth.user)return;const{error}=await supabase.from("user_season_preferences").upsert({user_id:auth.user.id,current_season:season,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error){alert(error.message);return}setCurrent(season);window.localStorage.setItem("agcore-current-season",season);window.dispatchEvent(new CustomEvent("agcore-season-change",{detail:season}));}
 useEffect(()=>{void refresh()},[]);
 const value=useMemo(()=>({currentSeason,seasons,loading,setCurrentSeason:choose,refresh}),[currentSeason,seasons,loading]);
 return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
}
export function useSeason(){return useContext(SeasonContext)}
