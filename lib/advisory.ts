import { boundaryPolygonPaths } from "@/lib/field-boundary";
import type { FieldBoundary, Point } from "@/types/field";
import type { RecommendationLine, GridPoint } from "@/types/advisory";
export const advisoryServices = ["Chemical soil grids","Soil classification","Leaf analysis","Soil sampling","Field inspection","Crop scouting","Other"];
export const requestStatuses = ["Submitted","Accepted","Scheduled","Sampling","Results ready","Completed","Cancelled"];
export function recommendationEstimate(lines:RecommendationLine[], hectares:number) {
  return lines.map(line=>({ ...line, quantity:Number(line.rate)*hectares, costPerHa:Number(line.rate)*Number(line.price), total:Number(line.rate)*Number(line.price)*hectares }));
}
function csvRows(source:string):string[][] {
  const rows:string[][]=[]; let row:string[]=[],cell="",quoted=false;
  const text=source.replace(/^\uFEFF/,"");
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}
    else if(c===","&&!quoted){row.push(cell.trim());cell=""}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=""}
    else cell+=c;
  }
  if(quoted)throw new Error("The CSV contains an unclosed quoted value.");
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export function parseAdvisoryGridCsv(text:string):GridPoint[] {
  const rows=csvRows(text),headers=rows.shift()?.map(h=>h.toLowerCase())||[];
  const required=["sample_id","latitude","longitude","parameter","value","unit","depth_cm","sample_date"];
  if(required.some(name=>!headers.includes(name)))throw new Error(`CSV headers must include: ${required.join(", ")}`);
  if(new Set(headers).size!==headers.length)throw new Error("CSV column names must be unique.");
  if(!rows.length||rows.length>10000)throw new Error("Import between 1 and 10,000 grid-result rows.");
  return rows.map((values,index)=>{
    if(values.length!==headers.length)throw new Error(`CSV row ${index+2} has a different number of columns from the header.`);
    const row=Object.fromEntries(headers.map((name,column)=>[name,values[column]||""]));
    const latitude=Number(row.latitude),longitude=Number(row.longitude),value=Number(row.value),depth_cm=Number(row.depth_cm);
    if(required.some(name=>row[name]==="")||![latitude,longitude,value,depth_cm].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||depth_cm<0||!/^\d{4}-\d{2}-\d{2}$/.test(row.sample_date)||Number.isNaN(Date.parse(row.sample_date))||new Date(row.sample_date).toISOString().slice(0,10)!==row.sample_date)throw new Error(`Check sample ID, coordinates, value, units, depth and YYYY-MM-DD date on CSV row ${index+2}.`);
    return {sample_id:row.sample_id,latitude,longitude,parameter:row.parameter,value,unit:row.unit,depth_cm,sample_date:row.sample_date};
  });
}
function inRing(point:Point,ring:Point[]) {
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];
 const cross=(point.lng-a.lng)*(b.lat-a.lat)-(point.lat-a.lat)*(b.lng-a.lng);
 if(Math.abs(cross)<1e-10&&point.lng>=Math.min(a.lng,b.lng)&&point.lng<=Math.max(a.lng,b.lng)&&point.lat>=Math.min(a.lat,b.lat)&&point.lat<=Math.max(a.lat,b.lat))return true;
 if((a.lat>point.lat)!==(b.lat>point.lat)&&point.lng<(b.lng-a.lng)*(point.lat-a.lat)/(b.lat-a.lat)+a.lng)inside=!inside;
 }return inside;
}
export function sampleInsideBoundary(sample:GridPoint,boundary:FieldBoundary|null) {
 const polygons=boundaryPolygonPaths(boundary);if(!polygons.length)return null;
 return polygons.some(rings=>inRing({lat:sample.latitude,lng:sample.longitude},rings[0])&&!rings.slice(1).some(ring=>inRing({lat:sample.latitude,lng:sample.longitude},ring)));
}
export function gridSeries(point:GridPoint){return `${point.parameter} · ${point.unit} · ${point.depth_cm} cm · ${point.sample_date}`;}
