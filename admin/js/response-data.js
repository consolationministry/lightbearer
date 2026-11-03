export function getResponseAnswers(fields, data) {
  const rows = [];
  const consumedKeys = new Set();
  for (const field of Array.isArray(fields) ? fields : []) {
    const key = "f_" + String(field.id);
    const label = field.label || "Untitled field";
    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
      consumedKeys.add(key);
      rows.push({ label, value: data[key] });
    }
    for (const [suffix, detail] of [["_country", "Country"], ["_state", "State / region"], ["_lga", "Local government / district"]]) {
      const subkey = key + suffix;
      if (!data || !Object.prototype.hasOwnProperty.call(data, subkey)) continue;
      consumedKeys.add(subkey);
      rows.push({ label: label + " (" + detail + ")", value: data[subkey] });
    }
  }
  for (const [key, value] of Object.entries(data || {})) {
    if (!/^f_/.test(key) || consumedKeys.has(key) || /_(?:search|code)$/.test(key)) continue;
    rows.push({ label: "Previous answer (field changed)", value });
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
