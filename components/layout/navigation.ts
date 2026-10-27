export type NavigationItem={href:string;label:string;description:string;icon:string};
export type NavigationGroup={label:string;icon:string;items:NavigationItem[]};
export const homeItem:NavigationItem={href:"/dashboard",label:"Farm Overview",description:"Farm command centre",icon:"⌂"};
export const navigationGroups:NavigationGroup[]=[
 {label:"Farm",icon:"◫",items:[{href:"/farm-map",label:"Farm Map",description:"Fields and spatial planning",icon:"⌖"},{href:"/standards",label:"Farm Setup",description:"Farmers, farms and crop lists",icon:"＋"},{href:"/planning/boundary-import",label:"Import Boundaries",description:"Shapefile field wizard",icon:"⇧"},{href:"/fields",label:"Fields",description:"Crops, seasons and cultivars",icon:"▦"},{href:"/activities",label:"Activities & Planning",description:"Plan, actualise and cost field work",icon:"✓"},{href:"/scouting",label:"Scouting",description:"Observations, GPS and photos",icon:"◉"},{href:"/jobs",label:"Job Cards",description:"Assign and complete work",icon:"☑"}]},
 {label:"Resources",icon:"▣",items:[{href:"/inventory",label:"Sheds & Inventory",description:"Locations, transfers, stocktakes and usage",icon:"▣"},{href:"/equipment",label:"Equipment",description:"Machinery, readings and service",icon:"🚜"},{href:"/fuel",label:"Diesel Logbook",description:"Fuel, hours and consumption",icon:"◒"},{href:"/labour",label:"Labour",description:"People, hours and allocation",icon:"♟"}]},
 {label:"Business",icon:"R",items:[{href:"/financials",label:"Business & Finance",description:"Cash flow, costs and margins",icon:"R"},{href:"/harvest",label:"Harvest",description:"Tonnes, moisture and yield",icon:"◆"},{href:"/transport",label:"Transport Log",description:"Loads, deliveries and field completion",icon:"▰"},{href:"/grain-marketing",label:"Grain Market",description:"SAFEX, bids, deals and transport",icon:"↗"}]},
 {label:"Insights",icon:"◩",items:[{href:"/reports",label:"Reports",description:"Performance and management exports",icon:"▥"},{href:"/weather",label:"Weather",description:"Forecast and modelled spray guidance",icon:"☁"},{href:"/rainfall",label:"Rainfall",description:"Rain gauges and seasonal history",icon:"MM"},{href:"/scanner",label:"AI Scanner",description:"Read delivery notes and receipts",icon:"AI"},{href:"/alerts",label:"Alerts",description:"Daily priorities and risks",icon:"!"}]},
 {label:"More",icon:"⋯",items:[{href:"/assistant",label:"CropNex Assistant",description:"Ask about farm data",icon:"AI"},{href:"/whatsapp-inbox",label:"Farm Inbox",description:"Messages and delivery notes",icon:"WA"},{href:"/master-data",label:"Master Data",description:"Products and approval requests",icon:"MD"},{href:"/offline-sync",label:"Offline Sync",description:"Pending field records",icon:"↻"},{href:"/settings",label:"Settings",description:"Profile and preferences",icon:"⋯"}]}
];
export const navigationItems=[homeItem,...navigationGroups.flatMap(group=>group.items)];
export const organizationModules=[
 {key:"dashboard",label:"Farm Overview",group:"Farm"},{key:"farm-map",label:"Farm Map",group:"Farm"},{key:"fields",label:"Fields & Farm Setup",group:"Farm"},{key:"planning",label:"Planning",group:"Farm"},{key:"activities",label:"Activities",group:"Farm"},{key:"scouting",label:"Scouting",group:"Farm"},{key:"jobs",label:"Job Cards",group:"Farm"},
 {key:"inventory",label:"Sheds & Inventory",group:"Resources"},{key:"equipment",label:"Equipment",group:"Resources"},{key:"fuel",label:"Diesel Logbook",group:"Resources"},{key:"labour",label:"Labour",group:"Resources"},
 {key:"financials",label:"Business & Finance",group:"Business"},{key:"harvest",label:"Harvest",group:"Business"},{key:"transport",label:"Transport Log",group:"Business"},{key:"grain-market",label:"Grain Market",group:"Business"},
 {key:"reports",label:"Reports & Analytics",group:"Insights"},{key:"weather",label:"Weather",group:"Insights"},{key:"rainfall",label:"Rainfall",group:"Insights"},{key:"scanner",label:"AI Scanner",group:"Insights"},{key:"alerts",label:"Alerts",group:"Insights"},
 {key:"assistant",label:"CropNex Assistant",group:"More"},{key:"whatsapp-inbox",label:"Farm Inbox",group:"More"},{key:"master-data",label:"Master Data",group:"More"},{key:"offline-sync",label:"Offline Sync",group:"More"},{key:"settings",label:"Settings",group:"More"}
] as const;
export const organizationRolePresets:Record<string,string[]>={
 "Organisation Owner":organizationModules.map(x=>x.key),"Organisation Administrator":organizationModules.map(x=>x.key),Director:organizationModules.map(x=>x.key),
 Accountant:["dashboard","fields","activities","financials","harvest","grain-market","reports"],
 "Farm Operator":["dashboard","farm-map","fields","planning","activities","scouting","jobs","inventory","harvest","transport","weather","rainfall","alerts","whatsapp-inbox"],
 Foreman:["dashboard","farm-map","fields","planning","activities","scouting","jobs","inventory","harvest","transport","weather","rainfall","alerts","whatsapp-inbox"],
 "Office Manager":["dashboard","financials","harvest","transport","grain-market","reports","alerts"],
 Analyst:["dashboard","farm-map","fields","financials","harvest","reports","weather","rainfall","alerts"],
 "Read Only Analyst":["dashboard","farm-map","fields","financials","harvest","reports","weather","rainfall","alerts"],
 "Field Manager":["dashboard","farm-map","fields","planning","activities","scouting","jobs","inventory","harvest","transport","weather","rainfall","alerts","whatsapp-inbox"],
 "Warehouse Manager":["dashboard","inventory","transport","harvest","alerts"]
};
export const organizationRoleEditPresets:Record<string,string[]>={
 "Organisation Owner":organizationModules.map(x=>x.key),"Organisation Administrator":organizationModules.map(x=>x.key),Director:[],
 Accountant:[],"Read Only Analyst":[],Analyst:[],
 "Farm Operator":[],Foreman:[],"Office Manager":[],"Field Manager":[],"Warehouse Manager":[]
};
export function organizationModuleForRoute(href:string){if(href==="/grain-marketing")return "grain-market";if(href==="/standards")return "fields";if(href==="/planning/boundary-import")return "planning";if(href==="/analytics")return "reports";return href.slice(1)}
