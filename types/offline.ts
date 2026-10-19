export type OfflineQueueItem = {
  id: string;
  status: "pending" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  payload: {
    field_id: string;
    source_layer_id?: string | null;
    observation_date: string;
    observation_time: string | null;
    category: string;
    issue_name: string;
    severity: string;
    latitude: number | null;
    longitude: number | null;
    crop_stage: string | null;
    affected_area_ha: number | null;
    recommendation: string | null;
    follow_up_date: string | null;
    status: string;
    photo_url: string | null;
    notes: string | null;
  };
  photo_blob: Blob | null;
  photo_data?: ArrayBuffer | null;
  photo_name: string | null;
  photo_type: string | null;
};
