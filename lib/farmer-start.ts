export function cleanSeasonName(value:string){return value.trim().replace(/\s*\/\s*/g,'/');}
export function seasonProblem(value:string){const season=cleanSeasonName(value);if(!/^\d{4}\/\d{4}$/.test(season)||Number(season.slice(5))!==Number(season.slice(0,4))+1)return 'Enter consecutive years, for example 2026/2027.';return '';}
export function needsFarmerStart(access:{isAdmin:boolean;roles:string[];organizationRoles:string[]},path:string){return !access.isAdmin&&access.roles.includes('Farmer')&&!access.organizationRoles.length&&!path.startsWith('/admin')&&!['/settings','/help'].includes(path);}
export function shouldOpenFirstMap(start:{has_season:boolean;has_boundary:boolean}|null,path:string){return Boolean(start?.has_season&&!start.has_boundary&&path==='/dashboard');}
