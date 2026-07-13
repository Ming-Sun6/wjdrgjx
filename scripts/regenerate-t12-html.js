/**
 * Regenerates public/function/T12Calculator.html and T12DataOverview.html
 * from the T12 xlsx source (same logic as generate-t12-pages.py).
 * Run: node scripts/regenerate-t12-html.js
 */
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "参考", "（T12）煌耀系列科技需求表(4).xlsx");
const OUT_DIR = path.join(ROOT, "public", "function");
const TROOPS = ["煌耀盾兵", "煌耀矛兵", "煌耀射手"];

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Number.isInteger(num) ? num : num;
}

function readRowsFromXlsx(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false, dense: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  return matrix.map((row) => {
    const out = new Array(11).fill("");
    for (let i = 0; i < Math.min(11, row.length); i++) out[i] = row[i] ?? "";
    return out;
  });
}

function buildDataset(rows) {
  const dataRows = rows.slice(2);
  if (dataRows.length % TROOPS.length !== 0) {
    throw new Error(
      `T12 source row count ${dataRows.length} cannot be split across ${TROOPS.length} troops`,
    );
  }
  const blockSize = dataRows.length / TROOPS.length;
  /** @type {Map<string, object>} */
  const groups = new Map();
  const records = [];

  dataRows.forEach((row, index) => {
    const troop = TROOPS[Math.min(Math.floor(index / blockSize), TROOPS.length - 1)];
    const name = String(row[0] ?? "").trim();
    if (!name) return;

    const key = `${troop}\0${name}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: `g${groups.size + 1}`,
        troop,
        name,
        max: 0,
        firstDesc: String(row[2] ?? "").trim(),
      });
    }
    const group = groups.get(key);
    const level = Math.floor(toNumber(row[1]));
    group.max = Math.max(group.max, level);
    const seconds = toNumber(row[10]);
    records.push({
      groupId: group.id,
      troop,
      name,
      level,
      desc: String(row[2] ?? "").trim(),
      meat: toNumber(row[3]),
      wood: toNumber(row[4]),
      coal: toNumber(row[5]),
      iron: toNumber(row[6]),
      steel: toNumber(row[7]),
      refinedCrystal: toNumber(row[8]),
      microCrystal: toNumber(row[9]),
      seconds,
      days: seconds / 86400,
    });
  });

  return { records, groups: [...groups.values()] };
}

function buildUnlockTargets(groups) {
  const targets = {};
  for (const troop of TROOPS) {
    const troopGroups = groups.filter((g) => g.troop === troop);
    targets[troop] = troopGroups.slice(0, 6).map((g) => ({ name: g.name, target: g.max }));
  }
  return targets;
}

function jsJson(value) {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

function readPythonTemplate() {
  return fs.readFileSync(path.join(ROOT, "scripts", "generate-t12-pages.py"), "utf8")
    .replace(/\r\n?/g, "\n");
}

function readCalculatorScriptTail() {
  const py = readPythonTemplate();
  const marker = '    script = f"""';
  const calcStart = py.indexOf(marker, py.indexOf("def calculator_page"));
  if (calcStart === -1) throw new Error("calculator script block not found in .py");
  const innerStart = calcStart + marker.length;
  const innerEnd = py.indexOf('"""\n    return shell("T12', innerStart);
  if (innerEnd === -1) throw new Error("calculator script block end not found");
  let script = py.slice(innerStart, innerEnd);
  if (!script.includes("const t12Data = {data_json}")) {
    throw new Error("unexpected calculator script template");
  }
  return script;
}

function readOverviewScriptTail() {
  const py = readPythonTemplate();
  const marker = '    script = f"""';
  const ovStart = py.indexOf(marker, py.indexOf("def overview_page"));
  if (ovStart === -1) throw new Error("overview script block not found");
  const innerStart = ovStart + marker.length;
  const innerEnd = py.indexOf('"""\n    return shell("T12', innerStart);
  if (innerEnd === -1) throw new Error("overview script block end not found");
  return py.slice(innerStart, innerEnd);
}

function extractPythonTripleAssign(varName) {
  const py = readPythonTemplate();
  const needle = `${varName} = """`;
  const start = py.indexOf(needle);
  if (start === -1) throw new Error(`missing ${varName} in generate-t12-pages.py`);
  const contentStart = start + needle.length;
  const end = py.indexOf('\n"""', contentStart);
  if (end === -1) throw new Error(`unclosed ${varName} triple string`);
  return py.slice(contentStart, end).replace(/\r\n/g, "\n");
}

function fillTemplate(template, dataJson, groupsJson, unlockJson) {
  let s = template.replace(/\r\n/g, "\n");
  s = s.split("{data_json}").join(dataJson);
  s = s.split("{groups_json}").join(groupsJson);
  if (unlockJson != null) s = s.split("{unlock_targets_json}").join(unlockJson);
  s = s.split("{THEME_JS}").join(extractPythonTripleAssign("THEME_JS"));
  if (s.includes("{data_json}") || s.includes("{groups_json}") || s.includes("{unlock_targets_json}")) {
    throw new Error("unfilled template placeholders");
  }
  if (s.includes("{THEME_JS}")) throw new Error("THEME_JS not substituted");
  s = s.split("{{").join("{").split("}}").join("}");
  // Python f-string template uses "\\"" for a JS object key "; after {{}} unescape this must be one backslash.
  s = s.replace(/        "\\\\"": "&quot;",/g, '        "\\"": "&quot;",');
  return s;
}

function mergeShellHtml(existingPath, title, bodyHtml, scriptContent) {
  let html = fs.readFileSync(existingPath, "utf8");
  const titleRe = /<title>[^<]*<\/title>/i;
  html = html.replace(titleRe, `<title>${title}</title>`);

  const mainStart = html.indexOf("<main");
  if (mainStart === -1) throw new Error("main not found");
  const headAndOpenBody = html.slice(0, mainStart);
  return `${headAndOpenBody}${bodyHtml.trim()}

  <script>
    "use strict";
${scriptContent}
  </script>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`missing source: ${SOURCE}`);
  const matrix = readRowsFromXlsx(SOURCE);
  const { records, groups } = buildDataset(matrix);
  const unlockTargets = buildUnlockTargets(groups);
  const dataJson = jsJson(records);
  const groupsJson = jsJson(groups);
  const unlockJson = jsJson(unlockTargets);

  const calcTpl = readCalculatorScriptTail();
  const calcScript = fillTemplate(calcTpl, dataJson, groupsJson, unlockJson);
  const ovTpl = readOverviewScriptTail();
  const ovScript = fillTemplate(ovTpl, dataJson, groupsJson, null);

  const py = readPythonTemplate();

  function extractBody(fnName) {
    const fn = `def ${fnName}`;
    const i = py.indexOf(fn);
    const bodyStart = py.indexOf('body = """', i);
    const bodyInner = bodyStart + 'body = """'.length;
    const bodyEnd = py.indexOf('"""\n', bodyInner);
    return py.slice(bodyInner, bodyEnd);
  }

  const calcBody = extractBody("calculator_page");
  const ovBody = extractBody("overview_page");

  const calcPath = path.join(OUT_DIR, "T12Calculator.html");
  const ovPath = path.join(OUT_DIR, "T12DataOverview.html");

  const calcHtml = mergeShellHtml(calcPath, "T12 煌耀系列科技计算器-冬日工具箱", calcBody, calcScript);
  const ovHtml = mergeShellHtml(ovPath, "T12 煌耀系列数据总览-冬日工具箱", ovBody, ovScript);

  fs.writeFileSync(calcPath, calcHtml, "utf8");
  fs.writeFileSync(ovPath, ovHtml, "utf8");
  console.log(`Wrote ${records.length} rows, ${groups.length} groups -> ${calcPath}, ${ovPath}`);
}

main();
