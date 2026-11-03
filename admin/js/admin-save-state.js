export function beginAdminSave(form, button) {
  if (!form || form.dataset.saving === "true") return null;
  form.dataset.saving = "true";
  const target = button || form.querySelector('button[type="submit"]');
  if (target) {
    target.disabled = true;
    target.setAttribute("aria-busy", "true");
    const spinner = typeof document === "undefined" ? { className: "admin-save-spinner", setAttribute() {}, remove() {} } : document.createElement("span");
    spinner.className = "admin-save-spinner";
    spinner.setAttribute("aria-hidden", "true");
    target.prepend(spinner);
  }
  return () => {
    delete form.dataset.saving;
    if (target?.isConnected) {
      target.disabled = false;
      target.removeAttribute("aria-busy");
      target.querySelector(".admin-save-spinner")?.remove();
    }
  };
}
