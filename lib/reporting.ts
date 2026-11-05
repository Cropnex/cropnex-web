import type {Field} from '@/types/field';
import type {FinancialTransaction} from '@/types/financial';

export type CommitmentRow={source_id?:string;user_id?:string;source:string;category:string;name:string;season:string|null;seasonal_amount:number;finance_start_date?:string|null;finance_term_seasons?:number|null;start_date?:string|null;end_date?:string|null};
export type PerformanceRow={field_id:string;planning_cost:number;remaining_planned_cost:number;actualised_cost:number;additional_expenses:number;total_cost:number;harvested_tonnes:number;projected_income:number;projected_margin:number};
export const amount=(value:unknown)=>{const n=Number(value??0);if(!Number.isFinite(n))throw new Error('A report contains an invalid numeric value. Correct the source record before exporting.');return n;};
export async function allReportRows<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]>{
 const rows:T[]=[];
 for(let from=0;;from+=500){const result=await page(from,from+499);if(result.error)throw result.error;const batch=result.data||[];rows.push(...batch);if(batch.length<500)return rows;}
}
export function transactionSeason(row:FinancialTransaction,fields:Field[]){return row.season||fields.find(f=>f.id===row.field_id&&(!row.user_id||!f.user_id||f.user_id===row.user_id))?.season||null;}
export function seasonalTransactions(rows:FinancialTransaction[],fields:Field[],season:string){return rows.filter(row=>transactionSeason(row,fields)===season);}
export function applicableCommitments(rows:CommitmentRow[],season:string){
 const year=/^(\d{4})(?:[/-]\d{2,4})?$/.exec(season)?.[1];
 return rows.filter(row=>{
  if(row.source!=='Equipment finance')return !row.season||row.season===season;
  const start=(row.finance_start_date||row.season||'').match(/^(\d{4})-/)?.[1];
  if(!year||!start)return true;
  const elapsed=Number(year)-Number(start),term=amount(row.finance_term_seasons);
  return elapsed>=0&&(term<=0||elapsed<term);
 });
}
export function reportEconomics(fields:Field[],performance:PerformanceRow[],transactions:FinancialTransaction[],commitments:CommitmentRow[],season:string){
 const uniqueFields=[...new Map(fields.map(f=>[f.id,f])).values()];
 const byId=new Map<string,PerformanceRow>();
 for(const row of performance){if(byId.has(row.field_id))throw new Error('Duplicate field performance rows returned. The report was stopped to prevent double counting.');byId.set(row.field_id,row);}
 for(const field of uniqueFields)if(!byId.has(field.id))throw new Error(`Performance data is missing for ${field.field_name}. Check report permissions and database migrations.`);
 const totals=uniqueFields.reduce((t,f)=>{const r=byId.get(f.id)!;t.income+=amount(r.projected_income);t.fieldCosts+=amount(r.total_cost);t.actualCosts+=amount(r.actualised_cost);t.remainingCosts+=amount(r.remaining_planned_cost);t.additionalCosts+=amount(r.additional_expenses);return t;},{income:0,fieldCosts:0,actualCosts:0,remainingCosts:0,additionalCosts:0});
 const scoped=seasonalTransactions(transactions,fields,season);
 const overheads=scoped.filter(t=>!t.field_id&&t.transaction_type==='Expense').reduce((s,t)=>s+amount(t.amount),0);
 const otherIncome=scoped.filter(t=>!t.field_id&&t.transaction_type==='Income').reduce((s,t)=>s+amount(t.amount),0);
 const commitmentTotal=applicableCommitments(commitments,season).reduce((s,c)=>{
  const paid=c.source_id?scoped.filter(t=>t.transaction_type==='Expense'&&t.commitment_source_id===c.source_id&&t.commitment_source_type===c.source&&(!c.user_id||t.user_id===c.user_id)).reduce((total,t)=>total+amount(t.amount),0):0;
  return s+Math.max(0,amount(c.seasonal_amount)-paid);
 },0);
 return {...totals,fieldMargin:totals.income-totals.fieldCosts,overheads,otherIncome,commitmentTotal,businessMargin:totals.income+otherIncome-totals.fieldCosts-overheads-commitmentTotal,unassignedTransactions:transactions.filter(t=>!t.field_id&&!t.season)};
}
export type PlanReportRow={user_id?:string;field_id?:string|null;plan_id:string;farmer_name:string;farm_name:string;field_name:string;activity_type:string;crop:string|null;cultivar:string|null;season:string;planned_date:string;actual_date:string|null;planned_area_ha:number;status:string;planned_cost:number;actual_cost:number;variance:number;product_count:number};
export function groupFieldCosts(rows:PlanReportRow[]){
 const groups=new Map<string,PlanReportRow&{activity_count:number;activities:string[]}>();
 for(const row of rows){if(row.status==='Cancelled')continue;
  const key=row.field_id?`${row.user_id||''}:${row.field_id}`:JSON.stringify([row.user_id||'',row.farmer_name,row.farm_name,row.field_name,row.season]);
  const current=groups.get(key);
  if(!current){groups.set(key,{...row,plan_id:key,planned_cost:amount(row.planned_cost),actual_cost:amount(row.actual_cost),variance:amount(row.variance),planned_area_ha:amount(row.planned_area_ha),product_count:amount(row.product_count),activity_count:1,activities:[row.activity_type]});continue;}
  current.planned_cost+=amount(row.planned_cost);current.actual_cost+=amount(row.actual_cost);current.variance+=amount(row.variance);current.product_count+=amount(row.product_count);current.activity_count++;current.activities.push(row.activity_type);current.planned_area_ha=Math.max(current.planned_area_ha,amount(row.planned_area_ha));
  if(row.planned_date>current.planned_date)current.planned_date=row.planned_date;
  if(row.actual_date&&(!current.actual_date||row.actual_date>current.actual_date))current.actual_date=row.actual_date;
  if(row.status!=='Actualised')current.status=row.status;
 }
 return [...groups.values()];
}

export const stockNeedsAttention=(item:{quantity:number;minimum_quantity:number|null})=>amount(item.quantity)<0||(item.minimum_quantity!==null&&amount(item.quantity)<=amount(item.minimum_quantity));
