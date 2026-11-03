import { applyAvailableUpdate, initializeUpdates } from "./updates.js";

const dialog = document.getElementById("update-dialog");
const message = document.getElementById("update-message");
const version = document.getElementById("update-version");
const status = document.getElementById("update-status");
const installButton = document.getElementById("update-install");

function showUpdateNotice(update) {
  if (!dialog || !message || !version || !installButton || !status) return;
  dialog.dataset.updateKind = update.kind;
  dialog.dataset.releaseUrl = update.releaseUrl || "";
  version.textContent = update.version ? `Version ${update.version}` : "";
  message.textContent = update.message || (update.kind === "android"
    ? "Download the Android update now. Android will ask you to confirm installation before replacing this app."
    : "A newer offline-ready version of Lightbearer is ready to install.");
  installButton.textContent = update.kind === "android" ? "Download & install" : "Install update";
  installButton.disabled = false;
  status.hidden = true;
  status.textContent = "";
  if (!dialog.open) dialog.showModal();
}

async function installAvailableUpdate() {
  installButton.disabled = true;
  status.hidden = false;
  status.textContent = "Preparing the update…";
  try {
    const result = await applyAvailableUpdate(messageText => { status.textContent = messageText; });
    if (result && result.releaseUrl) {
      window.open(result.releaseUrl, "_blank", "noopener,noreferrer");
      dialog.close();
    } else if (result && result.reload) {
      status.textContent = "Restarting with the new version…";
    } else {
      status.textContent = "The installer is ready. Follow the Android prompts to finish.";
    }
  } catch (error) {
    installButton.disabled = false;
    status.textContent = error && error.message
      ? error.message
      : "The update could not be downloaded. Check your connection and try again.";
  }
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "dismiss-update") dialog.close();
  if (target.dataset.action === "install-update") void installAvailableUpdate();
});

initializeUpdates({ onAvailable: showUpdateNotice });
