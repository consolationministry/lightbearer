export const APP_VERSION = "1.17.1";
export const ANDROID_RELEASES_API = "https://api.github.com/repos/consolationministry/lightbearer/releases";
export const ANDROID_LATEST_APK_URL = "https://github.com/consolationministry/lightbearer/releases/latest/download/lightbearer.apk";
// Member Android build asset name as published by the release workflow.
// Keep in step with .github/workflows/android-release.yml asset naming.
export const ANDROID_APK_ASSET = "cns-lightbearer-android.apk";

function parseVersion(value) {
  const normalized = String(value == null ? "" : value).trim().replace(/^v/i, "");
  const parts = normalized.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map(Number);
}

export function isNewerVersion(candidate, current) {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);
  if (!candidateParts || !currentParts) return false;
  for (let i = 0; i < 3; i += 1) {
    if (candidateParts[i] !== currentParts[i]) return candidateParts[i] > currentParts[i];
  }
  return false;
}

export function getAndroidApkRelease(release, currentVersion, assetName = ANDROID_APK_ASSET) {
  if (!release || release.draft || release.prerelease) return null;
  if (!isNewerVersion(release.tag_name, currentVersion)) return null;
  const asset = Array.isArray(release.assets) ? release.assets.find((entry) => entry && entry.name === assetName) : null;
  if (!asset || !asset.browser_download_url) return null;
  // Only accept browser_download_url served from this project's GitHub releases.
  // Any other host (e.g. attacker.example) is rejected.
  if (!String(asset.browser_download_url).startsWith("https://github.com/consolationministry/lightbearer/")) return null;
  return {
    version: String(release.tag_name).trim().replace(/^v/i, ""),
    apkUrl: asset.browser_download_url,
    releaseUrl: release.html_url || ""
  };
}
