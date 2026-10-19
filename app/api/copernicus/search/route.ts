import { NextRequest, NextResponse } from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type Point={lat:number;lng:number};
async function authenticated(request:NextRequest){const bearer=request.headers.get("authorization");const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!bearer||!url||!key)return false;const response=await fetch(`${url}/auth/v1/user`,{headers:{authorization:bearer,apikey:key}});return response.ok;}
function polygon(points:Point[]){
  const coordinates=points.map(point=>[point.lng,point.lat]);
  if(coordinates.length&&JSON.stringify(coordinates[0])!==JSON.stringify(coordinates.at(-1)))coordinates.push(coordinates[0]);
  return{type:"Polygon",coordinates:[coordinates]};
}

export function GET(){return NextResponse.json({ok:true,service:"CropNex Copernicus scene search"});}

export async function POST(request:NextRequest){
  try{
    if(!await authenticated(request))return NextResponse.json({error:"Sign in to search satellite imagery."},{status:401});
    const body=await request.json() as{boundary?:Point[];from?:string;to?:string;maxCloud?:number};
    if(!body.boundary||body.boundary.length<3||!body.from||!body.to)return NextResponse.json({error:"A field boundary and date range are required."},{status:400});
    const response=await fetch("https://stac.dataspace.copernicus.eu/v1/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({collections:["sentinel-2-l2a"],datetime:`${body.from}T00:00:00Z/${body.to}T23:59:59Z`,intersects:polygon(body.boundary),query:{"eo:cloud_cover":{lte:Math.min(100,Math.max(0,body.maxCloud??30))}},sortby:[{field:"properties.eo:cloud_cover",direction:"asc"}],limit:12})});
    if(!response.ok)throw new Error(`Copernicus catalogue returned ${response.status}.`);
    const result=await response.json() as{features?:Array<{id:string;properties?:Record<string,unknown>}>};
    const scenes=(result.features||[]).map(item=>({id:item.id,date:String(item.properties?.datetime||"").slice(0,10),cloudCover:Number(item.properties?.["eo:cloud_cover"]??0),platform:String(item.properties?.platform||"Sentinel-2")}));
    return NextResponse.json({scenes});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Scene search failed."},{status:500});}
}
