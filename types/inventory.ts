export type InventoryItem = {
  id: string;
  master_product_id?: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minimum_quantity: number | null;
  unit_cost: number | null;
  supplier: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  location: string | null;
  location_id?: string | null;
  owner_type?: string;
  owner_name?: string | null;
  stock_status?: string;
  status: string;
  notes: string | null;
  season?: string | null;
};

export type InventoryLocation = {
  id: string; name: string; location_type: string; farm_name: string | null;
  town: string | null; province: string | null; owner_type: string;
  owner_name: string | null; active: boolean; notes: string | null;
};

export type InventoryTransfer = {
  id: string; from_location_id: string; to_location_id: string; status: string;
  requested_date: string; dispatched_at: string | null; received_at: string | null;
  reference: string | null; notes: string | null;
  season?: string | null;
};

export type InventoryTransaction = {
  id: string;
  inventory_item_id: string;
  transaction_date: string;
  transaction_type: string;
  quantity: number;
  unit_cost: number | null;
  reference: string | null;
  notes: string | null;
};
