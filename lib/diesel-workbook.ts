import ExcelJS from "exceljs";

export type DieselExportRow={date:string;equipment:string;registration?:string|null;activity?:string|null;field?:string|null;operator?:string|null;litres:number;hours?:number|null;meter?:number|null;price:number;reference?:string|null;notes?:string|null};

export async function buildDieselLogbook(rows:DieselExportRow[]){
 const book=new ExcelJS.Workbook();book.creator="CropNex";book.created=new Date();
 const sheet=book.addWorksheet("Diesel Logbook",{views:[{state:"frozen",ySplit:5}]});
 sheet.mergeCells("A1:M1");sheet.getCell("A1").value="CropNex Diesel Logbook";sheet.getCell("A1").font={bold:true,size:16,color:{argb:"FFFFFFFF"}};sheet.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF163A24"}};sheet.getCell("A1").alignment={vertical:"middle"};sheet.getRow(1).height=28;
 sheet.getCell("A3").value="Total litres";sheet.getCell("B3").value={formula:"SUM(G6:G10005)"};sheet.getCell("D3").value="Total cost";sheet.getCell("E3").value={formula:"SUM(K6:K10005)"};sheet.getCell("G3").value="Total hours";sheet.getCell("H3").value={formula:"SUM(H6:H10005)"};sheet.getCell("J3").value="Average L/hour";sheet.getCell("K3").value={formula:'IFERROR(B3/H3,0)'};
 const headers=["Date","Equipment","Registration","Activity","Field","Operator","Litres","Hours worked","Meter reading","Price/L","Cost","Reference","Notes"];
 sheet.addRow([]);sheet.addRow(headers);const head=sheet.getRow(5);head.font={bold:true,color:{argb:"FFFFFFFF"}};head.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF477A2A"}};
 rows.forEach(r=>sheet.addRow([new Date(`${r.date}T12:00:00`),r.equipment,r.registration||"",r.activity||"",r.field||"",r.operator||"",r.litres,r.hours||null,r.meter||null,r.price,{formula:`G${sheet.rowCount+1}*J${sheet.rowCount+1}`},r.reference||"",r.notes||""]));
 sheet.getColumn(1).numFmt="yyyy-mm-dd";[7,8,9,10,11].forEach(i=>sheet.getColumn(i).numFmt=i===11?'R #,##0.00':'#,##0.00');
 sheet.columns.forEach((c,i)=>c.width=[13,24,16,18,22,18,12,14,14,12,15,18,30][i]);sheet.autoFilter={from:"A5",to:"M5"};
 sheet.getRow(3).font={bold:true};sheet.getRow(3).getCell(2).numFmt="#,##0.00";sheet.getRow(3).getCell(5).numFmt='R #,##0.00';sheet.getRow(3).getCell(8).numFmt="#,##0.00";sheet.getRow(3).getCell(11).numFmt="#,##0.00";
 return book.xlsx.writeBuffer();
}
