export type AuthEntryQuery=Record<string,string|string[]|undefined>;
export function parseAuthEntry(query:AuthEntryQuery){
 const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
 return {initialMode:first(query.mode)==='register'?'register' as const:'login' as const,preSubscribe:first(query.presubscribe)==='1'};
}
