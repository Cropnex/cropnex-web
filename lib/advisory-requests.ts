import type {AdvisoryRequest} from '../types/advisory';
/** Aggregate only requests the signed-in user is permitted to read. */
export function groupAdvisoryRequests(requests:AdvisoryRequest[]){
 const groups=new Map<string,AdvisoryRequest[]>();
 for(const request of requests){const key=request.group_id||request.id;const rows=groups.get(key)||[];if(!rows.some(row=>row.field_id===request.field_id))rows.push(request);groups.set(key,rows);}
 return [...groups].map(([id,rows])=>({id,requests:rows,service:rows[0].service_type,notes:rows[0].notes,date:rows[0].requested_date,hectares:rows.reduce((sum,row)=>sum+Number(row.field_snapshot.area_ha||0),0),status:new Set(rows.map(row=>row.status)).size===1?rows[0].status:'Mixed progress',open:rows.some(row=>!['Completed','Cancelled'].includes(row.status))}));
}
