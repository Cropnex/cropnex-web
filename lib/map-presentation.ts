import {boundaryPolygonPaths} from './field-boundary';
import type {FieldBoundary,Point} from '@/types/field';
export type CropColour={user_id:string;crop_key:string;colour:string};
export const cropKey=(crop:string|null)=>crop?.trim().replace(/\s+/g,' ').toLowerCase()||'__unassigned__';
export const validCropColour=(colour:string)=>/^#[0-9a-f]{6}$/i.test(colour);
export function defaultCropColour(crop:string|null){const value=cropKey(crop);if(value.includes('white maize'))return '#e8eee8';if(value.includes('yellow maize')||value.includes('corn'))return '#f3cf3f';if(value.includes('maize'))return '#789B58';if(value.includes('sunflower'))return '#f28c28';if(value.includes('wheat'))return '#d9a441';if(value.includes('teff'))return '#b2cf52';if(value.includes('soy'))return '#42b99a';return '#67a7d8'}
export function cropColour(crop:string|null,ownerId:string|undefined,colours:CropColour[]){const saved=colours.find(row=>row.user_id===ownerId&&row.crop_key===cropKey(crop));return saved&&validCropColour(saved.colour)?saved.colour:defaultCropColour(crop)}
const ringArea=(ring:Point[])=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.lng*q.lat-q.lng*p.lat},0))/2;
/** Place labels inside the largest polygon, avoiding interior holes and exterior concavities. */
export function fieldLabelPosition(boundary:FieldBoundary|null):Point|null{
 const polygons=boundaryPolygonPaths(boundary);if(!polygons.length)return null;
 const rings=[...polygons].sort((a,b)=>ringArea(b[0])-ringArea(a[0]))[0];
 const lats=rings[0].map(p=>p.lat),min=Math.min(...lats),max=Math.max(...lats);let best:Point|null=null,bestWidth=-1;
 for(const fraction of [.5,.35,.65,.2,.8,.1,.9]){
  const lat=min+(max-min)*fraction,intersections:number[]=[];
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i];if((a.lat>lat)!==(b.lat>lat))intersections.push(a.lng+(lat-a.lat)*(b.lng-a.lng)/(b.lat-a.lat));
  }
  intersections.sort((a,b)=>a-b);
  for(let i=0;i+1<intersections.length;i+=2){const width=intersections[i+1]-intersections[i];if(width>bestWidth){bestWidth=width;best={lat,lng:(intersections[i]+intersections[i+1])/2}}}
 }
 return best||rings[0][0]||null;
}
