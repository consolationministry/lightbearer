export const SERAPH_MEDIA_EMBED_ORIGIN = "https://www.seraphmedia.com.ng";

export function seraphMediaHymn(language, printedNumber) {
  const normalizedLanguage = language === "yoruba" ? "yoruba" : language === "english" ? "english" : null;
  const number = String(printedNumber == null ? "" : printedNumber).trim();
  if (!normalizedLanguage || !/^\d{1,5}$/.test(number) || Number(number) < 1) return null;
  return {
    url: SERAPH_MEDIA_EMBED_ORIGIN + "/embed/hymn/" + normalizedLanguage + "/" + number,
    height: 460,
    attributionUrl: SERAPH_MEDIA_EMBED_ORIGIN
  };
}

export const UPLOADED_HYMN_SOURCE = "Uploaded Hymn Collection";
export const UPLOADED_YORUBA_HYMN_SOURCE = "Uploaded Yorùbá Hymn Collection";

export function isManagedHymnSource(source) {
  return source === UPLOADED_HYMN_SOURCE || source === UPLOADED_YORUBA_HYMN_SOURCE;
}
