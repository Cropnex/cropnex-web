import type {AdvisoryField} from '@/types/advisory';
export const ALL_ADVISORY_SEASONS='__all__';
export function advisorySelection(fields:AdvisoryField[],choice:{clientId:string;season:string;farmName:string;search:string;fieldId:string}){
 const clients=[...new Map(fields.map(f=>[f.owner_id,{id:f.owner_id,name:f.client_name}])).values()];
 const requested=fields.find(f=>f.id===choice.fieldId);
 const clientId=clients.some(c=>c.id===choice.clientId)?choice.clientId:requested?.owner_id||clients[0]?.id||'';
 const clientFields=fields.filter(f=>f.owner_id===clientId);
 const seasons=[...new Set(clientFields.map(f=>f.season||''))].sort().reverse();
 const season=choice.season===ALL_ADVISORY_SEASONS?ALL_ADVISORY_SEASONS:seasons.includes(choice.season)&&choice.season!==''?choice.season:requested?.owner_id===clientId?(requested.season||''):seasons[0]||'';
 const seasonFields=clientFields.filter(f=>season===ALL_ADVISORY_SEASONS||(f.season||'')===season);
 const farms=[...new Set(seasonFields.map(f=>f.farm_name||''))].sort();
 const farmName=farms.includes(choice.farmName)?choice.farmName:'';
 const visible=seasonFields.filter(f=>(!farmName||f.farm_name===farmName)&&`${f.farm_name||''} ${f.field_name} ${f.crop||''}`.toLowerCase().includes(choice.search.trim().toLowerCase()));
 return {clients,clientId,seasons,season,farms,farmName,fields:visible,field:visible.find(f=>f.id===choice.fieldId)||visible[0]};
}
