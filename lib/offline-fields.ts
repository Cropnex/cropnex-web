import type { Field } from "@/types/field";

const CACHE_PREFIX = "agcore-fields";

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}-${userId}`;
}

export function saveFieldsOffline(
  userId: string,
  fields: Field[]
) {
  localStorage.setItem(
    cacheKey(userId),
    JSON.stringify({
      saved_at: new Date().toISOString(),
      fields,
    })
  );
}

export function getOfflineFields(
  userId: string
): Field[] {
  try {
    const stored = localStorage.getItem(cacheKey(userId));

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as {
      saved_at: string;
      fields: Field[];
    };

    return Array.isArray(parsed.fields)
      ? parsed.fields
      : [];
  } catch (error) {
    console.error("Could not read cached fields:", error);
    return [];
  }
}