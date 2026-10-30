const LEGACY_UPLOAD_SOURCE = /Uploaded Hymn Collection|Consolation Hymn/i;
const LEGACY_ORIGINAL_SOURCE = /^(?:Uploaded Hymn Collection|Original Consolation Hymn)$/i;

export function displayHymnalName(hymn) {
  const source = String(hymn && hymn.source_hymnal || "").trim();
  if (LEGACY_ORIGINAL_SOURCE.test(source)) return "C&S Bible Church Hymnal";
  if (LEGACY_UPLOAD_SOURCE.test(source)) return "C&S Bible Church Hymnal";
  return source || "Hymn Book";
}
