"use client";
type Operation={id:string;name:string};
type Farm={id:string;name:string;farmer_id:string};
export type MapFieldNames={farmer_id:string;farm_id:string;new_farm_name:string;field_name:string};
export default function MapFieldIdentity({operations,farms,value,onChange,operationName}:{operations:Operation[];farms:Farm[];value:MapFieldNames;onChange:(patch:Partial<MapFieldNames>)=>void;operationName:string}){
 const choices=farms.filter(farm=>farm.farmer_id===value.farmer_id);
 return <>
 {operations.length>1?<label className="field-label">Farming operation<select className="field-input" value={value.farmer_id} onChange={e=>onChange({farmer_id:e.target.value,farm_id:farms.find(f=>f.farmer_id===e.target.value)?.id||'__new__',new_farm_name:''})}>{operations.map(op=><option key={op.id} value={op.id}>{op.name}</option>)}</select></label>:<p className="mt-4 text-sm text-[#d9e9dd]">Operation: <b>{operations[0]?.name||operationName}</b></p>}
 {choices.length>0&&<label className="field-label">Farm<select required className="field-input" value={value.farm_id} onChange={e=>onChange({farm_id:e.target.value,new_farm_name:e.target.value==='__new__'?value.new_farm_name:''})}><option value="">Select farm</option>{choices.map(farm=><option key={farm.id} value={farm.id}>{farm.name}</option>)}<option value="__new__">+ Add a new farm</option></select></label>}
 {(value.farm_id==='__new__'||!choices.length)&&<label className="field-label">Farm name<input required maxLength={200} className="field-input" value={value.new_farm_name} onChange={e=>onChange({farm_id:'__new__',new_farm_name:e.target.value})} placeholder="For example, Preston"/></label>}
 <label className="field-label">Field name<input required maxLength={150} className="field-input" value={value.field_name} onChange={e=>onChange({field_name:e.target.value})} placeholder="For example, WO1"/></label>
 </>;
}
