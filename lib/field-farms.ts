import type {Field} from '@/types/field';
export type FarmerRecord={id:string;name:string;user_id:string};
export type FarmRecord={id:string;name:string;farmer_id:string;user_id:string};
export const farmNameKey=(name:string)=>name.trim().replace(/\s+/g,' ').toLowerCase();
export function validateFarmName(name:string,farmerId:string,farms:FarmRecord[]){
 const cleaned=name.trim().replace(/\s+/g,' ');
 if(!cleaned)throw new Error('Enter a farm name.');
 if(!farmerId)throw new Error('Choose the farming business that owns this farm.');
 if(farms.some(farm=>farm.farmer_id===farmerId&&farmNameKey(farm.name)===farmNameKey(cleaned)))throw new Error('This farm already exists under that business. Choose it from the dropdown.');
 return cleaned;
}
export function farmsForField(field:Field|undefined,farms:FarmRecord[]){return field?farms.filter(farm=>farm.user_id===field.user_id&&(!field.farmer_id||farm.farmer_id===field.farmer_id)):[]}
export function fieldFarmId(field:Field,farms:FarmRecord[]){
 const allowed=farmsForField(field,farms);
 if(field.farm_id&&allowed.some(farm=>farm.id===field.farm_id))return field.farm_id;
 const matches=allowed.filter(farm=>farmNameKey(farm.name)===farmNameKey(field.farm_name||''));
 return matches.length===1?matches[0].id:null;
}
export function groupFieldsByFarm(fields:Field[],farms:FarmRecord[],farmers:FarmerRecord[]){
 const groups=farms.map(farm=>({id:farm.id,name:farm.name,businessName:farmers.find(farmer=>farmer.id===farm.farmer_id)?.name||'Farming business',fields:fields.filter(field=>fieldFarmId(field,farms)===farm.id),unassigned:false}));
 const unassigned=fields.filter(field=>!fieldFarmId(field,farms));
 if(unassigned.length)groups.push({id:'unassigned',name:'Fields needing farm assignment',businessName:'Choose the correct farm in Edit Field',fields:unassigned,unassigned:true});
 return groups;
}
