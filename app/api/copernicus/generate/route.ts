import { NextRequest, NextResponse } from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type Point={lat:number;lng:number};
const tokenUrl="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const processUrl="https://sh.dataspace.copernicus.eu/api/v1/process";
const statisticsUrl="https://sh.dataspace.copernicus.eu/api/v1/statistics";
async function authenticated(request:NextRequest){const bearer=request.headers.get("authorization");const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!bearer||!url||!key)return false;const response=await fetch(`${url}/auth/v1/user`,{headers:{authorization:bearer,apikey:key}});return response.ok;}

const imageEvalscript=`//VERSION=3
function setup(){return{input:["B04","B08","dataMask"],output:{bands:4}}}
function evaluatePixel(s){
  if(!s.dataMask)return[0,0,0,0];
  const n=(s.B08-s.B04)/(s.B08+s.B04);
  if(n<0)return[0.35,0.22,0.12,1];
  if(n<0.2)return[0.82,0.25,0.12,1];
  if(n<0.4)return[0.96,0.72,0.16,1];
  if(n<0.6)return[0.62,0.82,0.2,1];
  if(n<0.75)return[0.18,0.65,0.22,1];
  return[0.02,0.35,0.12,1];
}`;
const statsEvalscript=`//VERSION=3
function setup(){return{input:["B04","B08","dataMask"],output:[{id:"ndvi",bands:1,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){return{ndvi:[(s.B08-s.B04)/(s.B08+s.B04)],dataMask:[s.dataMask]}}`;

function geometry(points:Point[]){const ring=points.map(point=>[point.lng,point.lat]);if(JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))ring.push(ring[0]);return{type:"Polygon",coordinates:[ring]};}
async function token(){
  const clientId=process.env.COPERNICUS_CLIENT_ID,secret=process.env.COPERNICUS_CLIENT_SECRET;
  if(!clientId||!secret)throw new Error("Copernicus credentials are not configured in Vercel.");
  const response=await fetch(tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:secret})});
  const data=await response.json() as{access_token?:string;error_description?:string};if(!response.ok||!data.access_token)throw new Error(data.error_description||"Copernicus authentication failed.");return data.access_token;
}

export function GET(){return NextResponse.json({ok:true,service:"CropNex Copernicus NDVI processor",configured:Boolean(process.env.COPERNICUS_CLIENT_ID&&process.env.COPERNICUS_CLIENT_SECRET)});}

export async function POST(request:NextRequest){
  try{
    if(!await authenticated(request))return NextResponse.json({error:"Sign in to generate satellite imagery."},{status:401});
    const body=await request.json() as{boundary?:Point[];date?:string;sceneId?:string};
    if(!body.boundary||body.boundary.length<3||!body.date)return NextResponse.json({error:"A field boundary and scene date are required."},{status:400});
    const accessToken=await token(),shape=geometry(body.boundary),from=`${body.date}T00:00:00Z`,to=`${body.date}T23:59:59Z`;
    const input={bounds:{geometry:shape,properties:{crs:"http://www.opengis.net/def/crs/OGC/1.3/CRS84"}},data:[{type:"sentinel-2-l2a",dataFilter:{timeRange:{from,to},mosaickingOrder:"leastCC"},processing:{harmonizeValues:true}}]};
    const [imageResponse,statisticsResponse]=await Promise.all([
      fetch(processUrl,{method:"POST",headers:{authorization:`Bearer ${accessToken}`,"content-type":"application/json",accept:"image/png"},body:JSON.stringify({input,output:{width:768,height:768,responses:[{identifier:"default",format:{type:"image/png"}}]},evalscript:imageEvalscript})}),
      fetch(statisticsUrl,{method:"POST",headers:{authorization:`Bearer ${accessToken}`,"content-type":"application/json"},body:JSON.stringify({input:{...input,data:input.data.map(item=>({...item,processing:{...item.processing,upsampling:"BILINEAR",downsampling:"BILINEAR"}}))},aggregation:{timeRange:{from,to},aggregationInterval:{of:"P1D"},evalscript:statsEvalscript,resx:0.0001,resy:0.0001},calculations:{default:{}}})}),
    ]);
    if(!imageResponse.ok)throw new Error(`Copernicus image processing returned ${imageResponse.status}: ${(await imageResponse.text()).slice(0,180)}`);
    const image=Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    let stats:{mean:number|null;min:number|null;max:number|null}={mean:null,min:null,max:null};
    if(statisticsResponse.ok){const data=await statisticsResponse.json() as{data?:Array<{outputs?:{ndvi?:{bands?:{B0?:{stats?:{mean?:number;min?:number;max?:number}}}}}}>};const value=data.data?.[0]?.outputs?.ndvi?.bands?.B0?.stats;stats={mean:value?.mean??null,min:value?.min??null,max:value?.max??null};}
    return NextResponse.json({image,contentType:"image/png",stats,sceneId:body.sceneId||null});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"NDVI generation failed."},{status:500});}
}
