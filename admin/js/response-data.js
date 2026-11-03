export function getResponseAnswers(fields, data) {
  const rows = [];
  const consumedKeys = new Set();
  const usedLabels = new Map();
  const add = (label, value) => {
    const count = (usedLabels.get(label) || 0) + 1;
    usedLabels.set(label, count);
    rows.push({ label: count > 1 ? `${label} (${count})` : label, value });
  };
  for (const field of Array.isArray(fields) ? fields : []) {
    const key = "f_" + String(field.id);
    const label = field.label || "Untitled field";
    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
      consumedKeys.add(key);
      add(label, data[key]);
    }
    for (const [suffix, detail] of [["_country", "Country"], ["_state", "State / region"], ["_lga", "Local government / district"]]) {
      const subkey = key + suffix;
      if (!data || !Object.prototype.hasOwnProperty.call(data, subkey)) continue;
      consumedKeys.add(subkey);
      add(label + " (" + detail + ")", data[subkey]);
    }
  }
  for (const [key, value] of Object.entries(data || {})) {
    if (!/^f_/.test(key) || consumedKeys.has(key) || /_(?:search|code)$/.test(key)) continue;
    const oldLabel = "Previous answer (field changed)";
    const customLabel = key.replace(/^f_/, "").replace(/_(country|state|lga)$/, "").replace(/[_-]+/g, " ").trim();
    const suffix = /_country$/.test(key) ? "Country" : /_state$/.test(key) ? "State / region" : /_lga$/.test(key) ? "Local government / district" : "";
    const label = customLabel ? `${oldLabel}: ${customLabel}${suffix ? " (" + suffix + ")" : ""}` : oldLabel;
    add(label, value);
  }
  return rows;
}

export function responseValueText(value) {
  return Array.isArray(value)
    ? value.map(item => String(item ?? "")).join(", ")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
}
