import AdvisoryWorkspace from '@/components/advisory/AdvisoryWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,value=(key:string)=>typeof params[key]==='string'?params[key] as string:'';
 return <AdvisoryWorkspace key={value('client')+value('field')+value('request')} initialClient={value('client')} initialField={value('field')} requestOnOpen={value('request')==='1'}/>;
}
