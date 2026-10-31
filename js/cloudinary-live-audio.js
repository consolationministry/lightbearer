const CLOUDINARY_REFERENCE_PATTERN = /^cloudinary:video:authenticated:live-audio\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(recording|segments\/([0-9]{6})):(webm|ogg|m4a)$/i;

export function parseCloudinaryLiveAudioReference(reference) {
  const match = String(reference || "").trim().match(CLOUDINARY_REFERENCE_PATTERN);
  if (!match) return null;
  const isSegment = Boolean(match[4]);
  return {
    publicId: "live-audio/" + match[1] + "/" + match[2] + "/" + (isSegment ? "segments/" + match[4] : "recording"),
    programId: match[1],
    sessionId: match[2],
    kind: isSegment ? "segment" : "recording",
    segmentIndex: isSegment ? Number(match[4]) : null,
    format: match[5].toLowerCase()
  };
}

export function isCloudinaryPublicUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch (error) {
    return false;
  }
}

export function createCloudinaryLiveAudioPlaybackUrl(reference) {
  const value = String(reference || "").trim();
  return isCloudinaryPublicUrl(value) ? value : "";
}
