export function prayerRequestListEntry(row) {
  return {
    id: String(row?.id ?? ""),
    contact: String(row?.contact ?? "Contact not provided"),
    received: formatPrayerRequestDate(row?.created_at)
  };
}

export function prayerRequestDetail(row) {
  return {
    id: String(row?.id ?? ""),
    contact: String(row?.contact ?? "Contact not provided"),
    request: String(row?.request ?? ""),
    received: formatPrayerRequestDate(row?.created_at)
  };
}

export function prayerRequestDeletePath(id) {
  if (id == null || String(id).trim() === "") throw new TypeError("A prayer request id is required.");
  return "rest/v1/prayer_requests?id=eq." + encodeURIComponent(String(id));
}

function formatPrayerRequestDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
