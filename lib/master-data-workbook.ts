export type MasterDataWorkbookRow={catalogue_code:string;name:string;manufacturer:string|null;product_class:string;crop_type:string;formulation:string|null;pack_size:number|null;pack_unit:string|null;status:string};

export async function downloadMasterDataWorkbook(products:MasterDataWorkbookRow[]){
 const ExcelJS=(await import("exceljs")).default,book=new ExcelJS.Workbook(),sheet=book.addWorksheet("Master Data");
 book.creator="CropNex";sheet.views=[{state:"frozen",ySplit:3}];sheet.addRow(["CropNex MASTER DATA MAINTENANCE"]);sheet.mergeCells("A1:I1");sheet.getCell("A1").font={bold:true,size:16,color:{argb:"FFFFFFFF"}};sheet.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315D22"}};
 sheet.addRow(["Do not change Catalogue Code. Edit the other columns and import the file in Master Data."]);
 sheet.addRow(["Catalogue Code","Product Name","Manufacturer","Product Class","Crop Association","Formulation","Pack Size","Pack Unit","Status"]);
 products.forEach(p=>sheet.addRow([p.catalogue_code,p.name,p.manufacturer||"",p.product_class,p.crop_type,p.formulation||"",p.pack_size??"",p.pack_unit||"",p.status]));
 sheet.columns=[{width:18},{width:36},{width:24},{width:20},{width:20},{width:18},{width:12},{width:12},{width:14}];sheet.autoFilter="A3:I3";
 const classList=["Unclassified","Seed","Herbicide","Insecticide","Fungicide","Fertiliser","Adjuvant","Biological","Growth regulator","Fuel","Animal health","Packaging","Other"],cropList=["Not applicable","Multi-crop","White Maize","Yellow Maize","Sunflower","Soybean","Wheat","Sorghum","Groundnuts","Dry Beans","Pasture","Other"],units=["L","ml","kg","g","tonne","bag","unit","MK"];
 for(let row=4;row<=Math.max(503,products.length+3);row++){sheet.getCell(`D${row}`).dataValidation={type:"list",allowBlank:false,formulae:[`"${classList.join(",")}"`]};sheet.getCell(`E${row}`).dataValidation={type:"list",allowBlank:false,formulae:[`"${cropList.join(",")}"`]};sheet.getCell(`H${row}`).dataValidation={type:"list",allowBlank:true,formulae:[`"${units.join(",")}"`]};sheet.getCell(`I${row}`).dataValidation={type:"list",allowBlank:false,formulae:['"Approved,Inactive"']};}
 const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer as ArrayBuffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),link=document.createElement("a");link.href=url;link.download=`CropNex-Master-Data-${new Date().toISOString().slice(0,10)}.xlsx`;link.click();URL.revokeObjectURL(url);
}

export async function readMasterDataWorkbook(file:File){
 const ExcelJS=(await import("exceljs")).default,book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());const sheet=book.getWorksheet("Master Data");if(!sheet)throw new Error("This is not an CropNex Master Data workbook.");const value=(row:number,column:number)=>String(sheet.getRow(row).getCell(column).value??"").trim(),rows:MasterDataWorkbookRow[]=[];
 for(let row=4;row<=sheet.rowCount;row++){const code=value(row,1);if(!code)continue;const pack=value(row,7);rows.push({catalogue_code:code,name:value(row,2),manufacturer:value(row,3)||null,product_class:value(row,4)||"Unclassified",crop_type:value(row,5)||"Not applicable",formulation:value(row,6)||null,pack_size:pack?Number(pack):null,pack_unit:value(row,8)||null,status:value(row,9)||"Approved"});}
 return rows;
}
