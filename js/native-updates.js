import { App } from "@capacitor/app";
import { FileTransfer } from "@capacitor/file-transfer";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileOpener } from "@capawesome-team/capacitor-file-opener";
import { ANDROID_RELEASES_API, ANDROID_APK_ASSET as MEMBER_APK_ASSET, APP_VERSION, getAndroidApkRelease } from "./version.js";
const ADMIN_APK_ASSET = "cns-lightbearer-admin.apk";

let availableUpdate = null;
let onUpdateAvailable = null;

async function checkAndroidRelease() {
  if (!navigator.onLine) return;
  try {
    const response = await fetch(ANDROID_RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store"
    });
    if (!response.ok) {
      // rate-limited or transient GitHub failure: retry sooner instead of waiting the full 5 minutes
      if (response.status === 403 || response.status === 429) {
        window.setTimeout(checkAndroidRelease, 45 * 1000);
      }
      return;
    }
    const release = await response.json();
    const appInfo = await App.getInfo();
    const apkAsset = (window.__LIGHTBEARER_ADMIN__ === true || window.location.pathname.indexOf("/admin") >= 0) ? ADMIN_APK_ASSET : MEMBER_APK_ASSET;
    const update = getAndroidApkRelease(release, appInfo.version || APP_VERSION, apkAsset);
    if (!update) return;
    availableUpdate = update;
    if (onUpdateAvailable) {
      onUpdateAvailable({ kind: "android", version: availableUpdate.version, releaseUrl: availableUpdate.releaseUrl });
    }
  } catch (error) {
    // Offline launches are expected. A later online event retries the check.
  }
}

export async function initializeNativeUpdates(onAvailable) {
  onUpdateAvailable = onAvailable;
  checkAndroidRelease();
  window.addEventListener("online", checkAndroidRelease);
  // Keep checking so the popup can appear on any screen, even minutes after launch.
  window.setInterval(checkAndroidRelease, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkAndroidRelease();
  });
}

export async function applyNativeUpdate(onProgress) {
  if (!availableUpdate) throw new Error("There is no update ready to install.");
  const filename = "cns-lightbearer-update-" + availableUpdate.version + ".apk";
  const destination = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
  const progressListener = await FileTransfer.addListener("progress", function (progress) {
    if (onProgress && progress.contentLength > 0) {
      const percent = Math.min(100, Math.round((progress.bytes / progress.contentLength) * 100));
      onProgress("Downloading update… " + percent + "%");
    } else if (onProgress) {
      onProgress("Downloading the update…");
    }
  });

  try {
    await FileTransfer.downloadFile({
      url: availableUpdate.apkUrl,
      path: destination.uri,
      progress: true,
      connectTimeout: 30000,
      readTimeout: 120000
    });
  } finally {
    await progressListener.remove();
  }

  if (onProgress) onProgress("Opening Android's installer…");
  await FileOpener.openFile({
    path: destination.uri,
    mimeType: "application/vnd.android.package-archive"
  });
  return { installerOpened: true };
}
