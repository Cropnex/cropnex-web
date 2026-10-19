declare module "shpjs" {
  type GeoFeature={type:"Feature";properties:Record<string,unknown>|null;geometry:{type:string;coordinates:unknown}|null};
  type GeoCollection={type:"FeatureCollection";features:GeoFeature[];fileName?:string};
  export default function shp(data:ArrayBuffer):Promise<GeoCollection|GeoCollection[]>;
}
