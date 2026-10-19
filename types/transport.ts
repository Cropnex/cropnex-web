export type TransportLoad = {
  id:string; user_id:string; load_number:string; load_date:string; destination_name:string|null;
  truck_registration:string|null; trailer_registration:string|null; driver_name:string|null;
  transporter:string|null; ticket_number:string|null; gross_tonnes:number|null; tare_tonnes:number|null;
  net_tonnes:number; accepted_tonnes:number|null; rejected_tonnes:number|null; moisture_percent:number|null;
  grade:string|null; status:"Planned"|"Loaded"|"Dispatched"|"Delivered"|"Weighed"|"Reconciled"|"Exception";
  notes:string|null; source:string; created_at?:string;
};

export type TransportAllocation = {
  id:string; user_id:string; load_id:string; field_id:string; allocated_tonnes:number;
  crop_snapshot:string|null; cultivar_snapshot:string|null; season_snapshot:string|null;
  field_harvest_complete:boolean; completion_date:string|null; notes:string|null;
};

export type TransportWorkbookRow = {
  row:number; action:"Keep"|"Add"|"Update"|"Delete"; loadId:string; allocationId:string;
  loadNumber:string; loadDate:string; fieldId:string; fieldLabel:string; crop:string; cultivar:string;
  destination:string; truck:string; trailer:string; driver:string; transporter:string; ticket:string;
  gross:number; tare:number; net:number; allocated:number; accepted:number; rejected:number;
  moisture:number|null; grade:string; status:TransportLoad["status"];
  harvestComplete:boolean; completionDate:string; notes:string; errors:string[];
};
