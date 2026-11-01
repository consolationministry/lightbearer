const escXml = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const formulaSafe = value => {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(item => item == null ? "" : String(item)).join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
};
const colName = index => { let name = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; };
export function buildResponseTable(fields, responses) {
  const ordered = [...(fields || [])].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  const headers = ["Respondent", "Email", "Phone", "Registration ID", "Submitted at", ...ordered.map(field => field.label || "Untitled field")];
  const rows = (responses || []).map(response => [response.respondent_name, response.respondent_email, response.respondent_phone, response.registration_code, response.created_at, ...ordered.map(field => response.data?.["f_" + String(field.id)] ?? "")].map(formulaSafe));
  return { headers: headers.map(formulaSafe), rows };
}
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), local = [], central = []; let offset = 0;
  for (const [path, content] of files) {
    const name = enc.encode(path), data = typeof content === "string" ? enc.encode(content) : content, crc = crc32(data);
    const head = new Uint8Array(30 + name.length), view = new DataView(head.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); head.set(name, 30);
    local.push(head, data);
    const dir = new Uint8Array(46 + name.length), dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true); dv.setUint32(16, crc, true); dv.setUint32(20, data.length, true); dv.setUint32(24, data.length, true); dv.setUint16(28, name.length, true); dv.setUint32(42, offset, true); dir.set(name, 46); central.push(dir); offset += head.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}
const xmlCell = (value, ref) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
export function responseWorkbookBlob(table) {
  const all = [table.headers, ...table.rows];
  const sheetRows = all.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => xmlCell(value, colName(ci) + (ri + 1))).join("")}</row>`).join("");
  const last = colName(Math.max(0, table.headers.length - 1));
  const files = [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Responses" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${all.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${last}${all.length}"/></worksheet>`]
  ];
  return zipStore(files);
}
function xmlText(value) { return escXml(value).replace(/\n/g, "<w:br/>"); }
export function responseDocumentBlob(table, title = "Form responses") {
  const cell = value => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${xmlText(value)}</w:t></w:r></w:p></w:tc>`;
  const row = values => `<w:tr>${values.map(cell).join("")}</w:tr>`;
  const tableXml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${table.headers.map(() => '<w:gridCol w:w="2400"/>').join("")}</w:tblGrid>${row(table.headers)}${table.rows.map(row).join("")}</w:tbl>`;
  return zipStore([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlText(title)}</w:t></w:r></w:p>${tableXml}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`]
  ]);
}
export function downloadResponseFile(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
