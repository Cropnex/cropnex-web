import { supabase } from "@/lib/supabase";
import {
  deleteOfflineItem,
  getOfflineItems,
  saveOfflineItem,
} from "@/lib/offline-db";
import {
  getQueuedRestMutations,
  removeQueuedRestMutation,
  updateQueuedRestMutation,
} from "@/lib/offline-platform";
import { supabaseAnonKey } from "@/lib/supabase";

const PHOTO_BUCKET = "scouting-photos";

function photoPath(userId: string, filename: string) {
  const extension =
    filename.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") ||
    "jpg";

  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export async function syncOfflineItems() {
  if (!navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You must be logged in.");

  const items = await getOfflineItems();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    let uploadedPath: string | null = null;

    try {
      const storedPhoto = item.photo_data?.byteLength
        ? new Blob([item.photo_data], {
            type: item.photo_type || "application/octet-stream",
          })
        : item.photo_blob && item.photo_blob.size > 0
          ? item.photo_blob
          : null;

      if (storedPhoto && item.photo_name) {
        uploadedPath = photoPath(
          data.user.id,
          item.photo_name
        );

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(uploadedPath, storedPhoto, {
            contentType:
              item.photo_type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) throw uploadError;
      }

      const { error } = await supabase
        .from("scouting_observations")
        .insert({
          user_id: data.user.id,
          ...item.payload,
          photo_path: uploadedPath,
        });

      if (error) throw error;

      const { data: field } = await supabase
        .from("fields")
        .select("field_name, crop, area_ha")
        .eq("id", item.payload.field_id)
        .maybeSingle();

      await supabase.from("activities").insert({
        user_id: data.user.id,
        activity_type: "Scouting",
        field_name: field?.field_name || "Unknown field",
        crop: field?.crop || null,
        date: item.payload.observation_date,
        area_ha: field?.area_ha || null,
        notes: `${item.payload.category}: ${item.payload.issue_name} (${item.payload.severity}) · Synced from offline mode`,
      });

      await deleteOfflineItem(item.id);
      synced += 1;
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([uploadedPath]);
      }

      await saveOfflineItem({
        ...item,
        status: "failed",
        attempts: item.attempts + 1,
        last_error:
          error instanceof Error
            ? error.message
            : "Unknown sync error",
      });

      failed += 1;
    }
  }

  const genericItems = await getQueuedRestMutations();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  for (const item of genericItems) {
    try {
      const headers = new Headers(item.headers);
      headers.set("apikey", supabaseAnonKey);
      if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
      const response = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
      });
      if (!response.ok) throw new Error(await response.text());
      await removeQueuedRestMutation(item.id);
      synced += 1;
    } catch (error) {
      await updateQueuedRestMutation({
        ...item,
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : "Unknown sync error",
      });
      failed += 1;
    }
  }

  localStorage.setItem(
    "agcore-last-sync",
    new Date().toISOString()
  );

  window.dispatchEvent(
    new CustomEvent("agcore-sync-updated")
  );

  return { synced, failed };
}
