import type { Field } from "@/types/field";
import type { ActivityPlan, ActivityPlanProduct } from "@/types/planning";

export type WorkbookOperation = { id:string; name:string; unit:string; unit_cost:number };
export type WorkbookProduct = { id:string; name:string; category:string; product_class?:string|null; crop_type?:string|null; pack_unit:string|null; inventory_price?:number|null };
export type WorkbookPlanOperation = { id:string; plan_id:string; operation_id:string|null; operation_name:string; unit:string; planned_rate_per_ha:number; planned_unit_price:number };
export type CustomWorkbookProduct = { name:string; manufacturer:string; category:string; cropType:string; unit:string; registrationNumber:string; notes:string };
export type PlanningImportRow = {
  row:number; sheet:string; action:"Keep"|"Add"|"Update"|"Delete"; planId:string; inputId:string;
  fieldLabel:string; activity:string; plannedDate:string; detectedCrop:string;
  inputType:"Product"|"Operation"|"None"; item:string; rate:number; unit:string; notes:string;
  customProduct:CustomWorkbookProduct|null; errors:string[];
};
type ExportArgs = { season:string; fields:Field[]; plans:ActivityPlan[]; products:ActivityPlanProduct[]; planOperations:WorkbookPlanOperation[]; catalogue:WorkbookProduct[]; operations:WorkbookOperation[]; activities:string[] };

const CUSTOM_ITEM = "+ Custom product - enter details on New Products tab";
const isSeed = (p?:WorkbookProduct) => /seed|cultivar|hybrid/i.test(`${p?.product_class||""} ${p?.category||""}`);
const cellText = (s:import("exceljs").Worksheet,r:number,c:number) => String(s.getCell(r,c).text||"").trim();
const cellNumber = (s:import("exceljs").Worksheet,r:number,c:number) => Number(s.getCell(r,c).value||0);
function columnLetter(column:number){let result="";while(column>0){const remainder=(column-1)%26;result=String.fromCharCode(65+remainder)+result;column=Math.floor((column-1)/26);}return result;}
function uniqueSheetName(value:string,used:Set<string>){const base=(value.replace(/[\\/?*\[\]:]/g,"-").slice(0,31)||"Farm");let name=base,suffix=2;while(used.has(name)){const marker=` ${suffix++}`;name=`${base.slice(0,31-marker.length)}${marker}`;}used.add(name);return name;}

export async function downloadPlanningWorkbook(args:ExportArgs){
  const ExcelJS=(await import("exceljs")).default, workbook=new ExcelJS.Workbook(); workbook.creator="CropNex"; workbook.created=new Date();
  const start=workbook.addWorksheet("Start Here"), summary=workbook.addWorksheet("Plan Summary"), custom=workbook.addWorksheet("New Products",{views:[{state:"frozen",ySplit:5}]}), lists=workbook.addWorksheet("Lists"); lists.state="veryHidden";
  start.addRows([
    ["CropNex Excel Farm Planning",`Season ${args.season}`],["Three simple steps"],
    ["1","Open a farm tab. Existing plans are already included as Keep."],
    ["2",`Use the dropdowns. If a product is missing, select '${CUSTOM_ITEM}' and complete New Products.`],
    ["3","Upload the workbook to CropNex and review every change before confirming."],
    ["Prices","Do not enter prices. CropNex uses your current Shed price and marks products without a price for follow-up."],
    ["Crops","Selecting a classified seed or cultivar automatically assigns its cultivar and crop type to the field."],
  ]);
  start.mergeCells("A1:B1"); start.getColumn(1).width=22; start.getColumn(2).width=105; start.getCell("A1").font={bold:true,size:16,color:{argb:"FF315D22"}}; start.getRow(2).font={bold:true,color:{argb:"FF315D22"}}; start.eachRow(r=>r.alignment={vertical:"middle",wrapText:true}); [3,5].forEach(r=>start.getRow(r).height=34); [4,6,7].forEach(r=>start.getRow(r).height=42);
  custom.addRow(["New or custom products"]); custom.mergeCells("A1:G1"); custom.addRow(["Only complete this when a product is missing. CropNex sends it for approval and keeps its plan unpriced until a Shed price exists."]); custom.mergeCells("A2:G2"); custom.addRow([]);custom.addRow([]);custom.addRow(["Product name","Manufacturer","Category","Crop type (seed only)","Unit","Registration number","Notes"]);
  for(let r=6;r<=105;r++)custom.addRow(["","","Chemical","","L","",""]);
  custom.getRow(1).font={bold:true,size:16,color:{argb:"FFFFFFFF"}};custom.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};custom.getRow(5).font={bold:true,color:{argb:"FFFFFFFF"}};custom.getRow(5).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};[26,22,18,24,12,22,42].forEach((w,i)=>custom.getColumn(i+1).width=w);
  const actions=["Keep","Add","Update","Delete"],activities=Array.from(new Set(args.activities)),inputTypes=["None","Product","Operation"],items=[...args.catalogue.map(x=>x.name),...args.operations.map(x=>x.name),CUSTOM_ITEM],units=["L","kg","g","mL","bag","seed","ha","hour","km","tonne","load","each"],categories=["Chemical","Seed","Fertiliser","Herbicide","Insecticide","Fungicide","Biological","Adjuvant","Other"],cropTypes=["White Maize","Yellow Maize","Sunflower","Soybean","Wheat","Sorghum","Groundnuts","Canola","Barley","Pasture","Other"];
  const listColumns:[string,string[]][]=[["Actions",actions],["Activities",activities],["InputTypes",inputTypes],["Items",items],["Units",units],["Categories",categories],["CropTypes",cropTypes]];
  listColumns.forEach(([name,values],c)=>{lists.getCell(1,c+1).value=name;values.forEach((v,r)=>lists.getCell(r+2,c+1).value=v);});
  for(let r=6;r<=105;r++){for(let c=1;c<=7;c++)custom.getCell(r,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"}};custom.getCell(r,3).dataValidation={type:"list",allowBlank:false,formulae:[`Lists!$F$2:$F$${categories.length+1}`]};custom.getCell(r,4).dataValidation={type:"list",allowBlank:true,formulae:[`Lists!$G$2:$G$${cropTypes.length+1}`]};custom.getCell(r,5).dataValidation={type:"list",allowBlank:false,formulae:[`Lists!$E$2:$E$${units.length+1}`]};}
  lists.getCell("J1").value="ProductName";lists.getCell("K1").value="CropType";lists.getCell("L1").value="InventoryPrice";args.catalogue.forEach((product,index)=>{lists.getCell(index+2,10).value=product.name;lists.getCell(index+2,11).value=isSeed(product)?product.crop_type||"":"";lists.getCell(index+2,12).value=Number(product.inventory_price||0);});
  const headers=["Action","Field","Activity","Planned date","Input type","Product / operation","Custom product name","Rate","Unit","Detected crop","Price source","Calculated cost","Instructions","Plan ID","Input ID"];
  const farms=Array.from(new Set(args.fields.map(f=>f.farm_name||"Unassigned"))),used=new Set(["Start Here","Plan Summary","New Products","Lists"]),summaryRows:(string|number)[][]=[["Farm","Fields","Planned rows","Unpriced rows"]];
  for(const [farmIndex,farmName] of farms.entries()){
    const name=uniqueSheetName(farmName,used),sheet=workbook.addWorksheet(name,{views:[{state:"frozen",ySplit:5,xSplit:2}]}); sheet.addRow([`${farmName} Farm Plan`,`Season ${args.season}`]);sheet.mergeCells("A1:D1");sheet.addRow(["Green cells are dropdowns. Yellow cells are typed by you. Grey cells are calculated by CropNex."]);sheet.addRow([]);sheet.addRow([]);sheet.addRow(headers);
    const farmFields=args.fields.filter(f=>(f.farm_name||"Unassigned")===farmName);let plannedRows=0,unpricedRows=0;
    for(const field of farmFields){
      const fieldPlans=args.plans.filter(p=>p.field_id===field.id&&p.season===args.season&&p.status==="Planned");
      if(!fieldPlans.length)sheet.addRow(["Keep",field.field_name,"","","None","","","","",field.crop||"","","","","",""]);
      for(const plan of fieldPlans){
        const inputs=[...args.products.filter(x=>x.plan_id===plan.id).map(x=>({type:"Product",id:x.id,name:x.product_name,rate:x.planned_rate_per_ha,unit:x.unit,price:Number(x.planned_unit_price||0),cost:Number(x.planned_cost||0)})),...args.planOperations.filter(x=>x.plan_id===plan.id).map(x=>({type:"Operation",id:x.id,name:x.operation_name,rate:x.planned_rate_per_ha,unit:x.unit,price:Number(x.planned_unit_price||0),cost:Number(x.planned_rate_per_ha)*Number(plan.planned_area_ha)*Number(x.planned_unit_price)}))];
        if(!inputs.length)inputs.push({type:"None",id:"",name:"",rate:0,unit:"",price:0,cost:0});
        for(const input of inputs){const product=args.catalogue.find(x=>x.name===input.name),crop=input.type==="Product"&&isSeed(product)?product?.crop_type||plan.crop||"":plan.crop||"",source=input.type==="Product"?(input.price>0?"Shed price":"Price needed"):input.type==="Operation"?"Operation price":"";if(source==="Price needed")unpricedRows++;plannedRows++;sheet.addRow(["Keep",field.field_name,plan.activity_type,plan.planned_date,input.type,input.name,"",input.rate||"",input.unit,crop,source,input.cost||"",plan.notes||"",plan.id,input.id]);}
      }
    }
    for(let i=0;i<Math.max(150,plannedRows*2);i++)sheet.addRow(["Add","","","","None","","","","","","","","","",""]);
    const last=sheet.rowCount;sheet.getRow(1).font={bold:true,size:16,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};sheet.getRow(5).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(5).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};
    const fieldNames=farmFields.map(f=>f.field_name),fieldListColumn=14+farmIndex,letter=columnLetter(fieldListColumn);lists.getCell(1,fieldListColumn).value=`${farmName}Fields`;fieldNames.forEach((v,r)=>lists.getCell(r+2,fieldListColumn).value=v);
    const validation=(c:number,listColumn:string,count:number)=>{for(let r=6;r<=last;r++)sheet.getCell(r,c).dataValidation={type:"list",allowBlank:true,formulae:[`Lists!$${listColumn}$2:$${listColumn}$${Math.max(2,count+1)}`]};};validation(1,"A",actions.length);validation(2,letter,fieldNames.length);validation(3,"B",activities.length);validation(5,"C",inputTypes.length);validation(6,"D",items.length);validation(9,"E",units.length);
    for(let r=6;r<=last;r++){[1,2,3,5,6,9].forEach(c=>sheet.getCell(r,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE2F0D9"}});[4,7,8,13].forEach(c=>sheet.getCell(r,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"}});[10,11,12,14,15].forEach(c=>sheet.getCell(r,c).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE7E6E6"}});sheet.getCell(r,10).value={formula:`IFERROR(INDEX(Lists!$K$2:$K$${args.catalogue.length+1},MATCH(F${r},Lists!$J$2:$J$${args.catalogue.length+1},0)),"")`,result:String(sheet.getCell(r,10).value||"")};sheet.getCell(r,11).value={formula:`IF(F${r}="","",IF(E${r}="Operation","Operation price",IF(F${r}="${CUSTOM_ITEM}","Price needed",IFERROR(IF(INDEX(Lists!$L$2:$L$${args.catalogue.length+1},MATCH(F${r},Lists!$J$2:$J$${args.catalogue.length+1},0))>0,"Shed price","Price needed"),"Price needed"))))`,result:String(sheet.getCell(r,11).value||"")};sheet.getCell(r,4).numFmt="yyyy-mm-dd";sheet.getCell(r,8).numFmt="0.000";sheet.getCell(r,12).numFmt='R #,##0.00';}
    [14,15].forEach(c=>sheet.getColumn(c).hidden=true);[12,22,27,15,14,38,26,12,12,18,18,18,36,16,16].forEach((w,i)=>sheet.getColumn(i+1).width=w);sheet.autoFilter={from:"A5",to:`M${last}`};summaryRows.push([farmName,farmFields.length,plannedRows,unpricedRows]);
  }
  summary.addRow(["Plan Summary",`Season ${args.season}`]);summary.mergeCells("A1:D1");summary.addRow([]);summary.addRows(summaryRows);summary.getRow(1).font={bold:true,size:16,color:{argb:"FF315D22"}};summary.getRow(3).font={bold:true,color:{argb:"FFFFFFFF"}};summary.getRow(3).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};[28,14,18,20].forEach((w,i)=>summary.getColumn(i+1).width=w);
  const buffer=await workbook.xlsx.writeBuffer(),blob=new Blob([buffer as ArrayBuffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`CropNex-${args.season.replace("/","-")}-Simple-Farm-Plan.xlsx`;a.click();URL.revokeObjectURL(url);
}

export async function readPlanningWorkbook(file:File):Promise<PlanningImportRow[]>{
  const ExcelJS=(await import("exceljs")).default,workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const customSheet=workbook.getWorksheet("New Products"),customProducts=new Map<string,CustomWorkbookProduct>();
  if(customSheet)for(let r=6;r<=customSheet.rowCount;r++){const name=cellText(customSheet,r,1);if(name)customProducts.set(name.toLowerCase(),{name,manufacturer:cellText(customSheet,r,2),category:cellText(customSheet,r,3)||"Other",cropType:cellText(customSheet,r,4),unit:cellText(customSheet,r,5)||"unit",registrationNumber:cellText(customSheet,r,6),notes:cellText(customSheet,r,7)});}
  const ignored=new Set(["Start Here","Plan Summary","New Products","Lists"]),sheets=workbook.worksheets.filter(s=>!ignored.has(s.name));if(!sheets.length)throw new Error("This is not an CropNex Farm Plan workbook.");const rows:PlanningImportRow[]=[];
  for(const sheet of sheets)for(let r=6;r<=sheet.rowCount;r++){const action=cellText(sheet,r,1) as PlanningImportRow["action"],field=cellText(sheet,r,2),activity=cellText(sheet,r,3),selectedItem=cellText(sheet,r,6),customName=cellText(sheet,r,7),planId=cellText(sheet,r,14),inputId=cellText(sheet,r,15);if(!field&&!activity&&!selectedItem&&!customName&&!planId)continue;const errors:string[]=[];if(!["Keep","Add","Update","Delete"].includes(action))errors.push("Choose a valid Action.");if(action!=="Keep"&&!field)errors.push("Field is required.");if(["Add","Update"].includes(action)&&!activity)errors.push("Activity is required.");const inputType=(cellText(sheet,r,5)||"None") as PlanningImportRow["inputType"],item=selectedItem===CUSTOM_ITEM?customName:selectedItem,customProduct=selectedItem===CUSTOM_ITEM?customProducts.get(customName.toLowerCase())||null:null;if(inputType!=="None"&&!item)errors.push("Choose a product or operation.");if(selectedItem===CUSTOM_ITEM&&!customProduct)errors.push("Add this custom product to New Products using exactly the same name.");const title=cellText(sheet,1,1),farmName=title.endsWith(" Farm Plan")?title.slice(0,-10):sheet.name;rows.push({row:r,sheet:sheet.name,action,planId,inputId,fieldLabel:`${farmName} · ${field}`,activity,plannedDate:cellText(sheet,r,4),detectedCrop:cellText(sheet,r,10),inputType,item,rate:cellNumber(sheet,r,8),unit:cellText(sheet,r,9),notes:cellText(sheet,r,13),customProduct,errors:errors.map(e=>`${sheet.name}: ${e}`)});}
  return rows;
}
