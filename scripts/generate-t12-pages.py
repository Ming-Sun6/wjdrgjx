import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "参考" / "（T12）煌耀系列科技需求表(4).xlsx"
OUT_DIR = ROOT / "public" / "function"
NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
TROOPS = ["煌耀盾兵", "煌耀矛兵", "煌耀射手"]


def column_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref).group(1)
    index = 0
    for char in letters:
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def to_number(value):
    if value is None or str(value).strip() == "":
        return 0
    num = float(value)
    return int(num) if num.is_integer() else num


def read_xlsx_rows(path):
    with zipfile.ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared_strings = [
            "".join(t.text or "" for t in item.iter(f"{MAIN_NS}t"))
            for item in shared_root.findall("a:si", NS)
        ]

        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in sheet_root.findall("a:sheetData/a:row", NS):
            values = [""] * 11
            for cell in row.findall("a:c", NS):
                value_node = cell.find("a:v", NS)
                if value_node is None:
                    value = ""
                elif cell.get("t") == "s":
                    value = shared_strings[int(value_node.text)]
                else:
                    value = value_node.text or ""
                idx = column_index(cell.get("r"))
                if idx < len(values):
                    values[idx] = value
            rows.append(values)
        return rows


def build_dataset(rows):
    data_rows = rows[2:]
    if len(data_rows) % len(TROOPS) != 0:
        raise ValueError(f"T12 source row count {len(data_rows)} cannot be split across {len(TROOPS)} troops")
    block_size = len(data_rows) // len(TROOPS)
    groups = OrderedDict()
    records = []

    for index, row in enumerate(data_rows):
        troop = TROOPS[min(index // block_size, len(TROOPS) - 1)]
        name = row[0].strip()
        if not name:
            continue

        key = (troop, name)
        if key not in groups:
            group_id = f"g{len(groups) + 1}"
            groups[key] = {
                "id": group_id,
                "troop": troop,
                "name": name,
                "max": 0,
                "firstDesc": row[2].strip(),
            }

        group = groups[key]
        level = int(to_number(row[1]))
        group["max"] = max(group["max"], level)
        seconds = to_number(row[10])
        records.append({
            "groupId": group["id"],
            "troop": troop,
            "name": name,
            "level": level,
            "desc": row[2].strip(),
            "meat": to_number(row[3]),
            "wood": to_number(row[4]),
            "coal": to_number(row[5]),
            "iron": to_number(row[6]),
            "steel": to_number(row[7]),
            "refinedCrystal": to_number(row[8]),
            "microCrystal": to_number(row[9]),
            "seconds": seconds,
            "days": seconds / 86400,
        })

    return records, list(groups.values())


def build_unlock_targets(groups):
    targets = OrderedDict()
    for troop in TROOPS:
        troop_groups = [group for group in groups if group["troop"] == troop]
        targets[troop] = [
            {"name": group["name"], "target": group["max"]}
            for group in troop_groups[:6]
        ]
    return targets


def js_json(value):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


COMMON_CSS = """
    :root {
      --bg0: #07111f;
      --bg1: #10172a;
      --line: rgba(148, 163, 184, .24);
      --txt: #e2e8f0;
      --muted: #94a3b8;
      --panel: rgba(9, 17, 32, .82);
      --surface: rgba(15, 23, 42, .84);
      --surface-soft: rgba(15, 23, 42, .58);
      --acc1: #facc15;
      --acc2: #38bdf8;
      --acc3: #4ade80;
      --danger: #fb7185;
      --shadow: 0 24px 56px rgba(2, 6, 23, .34);
      --radius-xl: 26px;
      --radius-lg: 20px;
      --radius-md: 14px;
    }

    body.theme-day {
      --bg0: #eef5ff;
      --bg1: #f8fbff;
      --line: rgba(15, 23, 42, .13);
      --txt: #0f172a;
      --muted: #475569;
      --panel: rgba(255, 255, 255, .93);
      --surface: rgba(255, 255, 255, .96);
      --surface-soft: rgba(241, 245, 249, .95);
      --acc1: #ca8a04;
      --acc2: #0284c7;
      --acc3: #16a34a;
      --shadow: 0 18px 42px rgba(15, 23, 42, .14);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      overflow-x: hidden;
      font-family: "Source Han Sans SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;
      color: var(--txt);
      background:
        radial-gradient(980px 540px at -10% -10%, rgba(250,204,21,.22), transparent 62%),
        radial-gradient(860px 500px at 108% 0%, rgba(56,189,248,.2), transparent 64%),
        linear-gradient(145deg, var(--bg0), var(--bg1));
      padding: 16px;
      transition: background .2s ease, color .2s ease;
    }

    .home-btn,
    .theme-toggle,
    .nav-link {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--txt);
      border-radius: 999px;
      padding: 9px 14px;
      font-size: 12px;
      font-weight: 800;
      text-decoration: none;
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .home-btn,
    .theme-toggle {
      position: fixed;
      top: 12px;
      z-index: 20;
    }

    .home-btn { left: 12px; }
    .theme-toggle { right: 12px; cursor: pointer; }

    .app-shell {
      width: min(1360px, calc(100vw - 32px));
      margin: 68px auto 28px;
      display: grid;
      gap: clamp(14px, 2vw, 24px);
    }

    .shell-card {
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .hero-shell {
      padding: clamp(20px, 3vw, 34px);
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, .9fr);
      gap: clamp(18px, 3vw, 32px);
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(56, 189, 248, .13);
      color: var(--acc2);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .hero-title {
      font-size: clamp(30px, 4.7vw, 52px);
      line-height: 1.04;
      letter-spacing: -.03em;
      margin-bottom: 12px;
    }

    .hero-copy,
    .section-copy,
    .hint,
    .empty-state {
      color: var(--muted);
      line-height: 1.7;
      font-size: 13px;
    }

    .hero-copy {
      font-size: clamp(14px, 1.8vw, 17px);
      max-width: 68ch;
    }

    .hero-notes,
    .controls-grid,
    .input-stack,
    .field {
      display: grid;
      gap: 12px;
    }

    .note-card,
    .control-card,
    .stat,
    .tech-card,
    .result-card,
    .data-card {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .note-card,
    .control-card,
    .tech-card,
    .result-card,
    .data-card { padding: 16px; }

    .note-label,
    .label,
    label {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: .04em;
      font-weight: 700;
    }

    .note-value,
    .value {
      font-weight: 800;
      line-height: 1.5;
    }

    .section {
      padding: clamp(18px, 2.5vw, 28px);
      display: grid;
      gap: 18px;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      flex-wrap: wrap;
    }

    .nav-row,
    .btn-row,
    .filter-row,
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }

    .controls-grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    input,
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 13px;
      background: var(--surface-soft);
      color: var(--txt);
      padding: 11px 12px;
      font: inherit;
      outline: none;
    }

    .btn {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface-soft);
      color: var(--txt);
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 800;
    }

    .btn.primary {
      color: #082f49;
      border-color: transparent;
      background: linear-gradient(135deg, var(--acc1), #f97316);
    }

    .btn.accent {
      color: #052e16;
      border-color: transparent;
      background: linear-gradient(135deg, var(--acc3), #22c55e);
    }

    .stats,
    .tech-grid,
    .results-grid,
    .resource-grid,
    .tech-detail-grid,
    .card-grid {
      display: grid;
      gap: 12px;
    }

    .stats {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }

    .stat {
      min-width: 0;
      padding: 14px;
      overflow: visible;
    }

    .stat .value {
      margin-top: 8px;
      font-size: clamp(15px, 1.65vw, 22px);
      line-height: 1.12;
      color: var(--acc1);
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .tech-grid {
      grid-template-columns: repeat(auto-fit, minmax(236px, 1fr));
    }

    .results-grid,
    .card-grid {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }

    .tech-card h3,
    .result-card h3,
    .data-card h3 {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .card-subtitle,
    .result-progress {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .level-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }

    .result-card-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
    }

    .result-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .result-kpi,
    .resource-item {
      border-radius: var(--radius-md);
      background: var(--surface-soft);
      padding: 10px;
      min-width: 0;
    }

    .result-kpi span,
    .resource-item span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }

    .result-kpi strong,
    .resource-item strong {
      display: block;
      overflow-wrap: anywhere;
    }

    .resource-grid {
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    }

    .tech-detail-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .resource-sub {
      color: var(--muted);
      font-size: 11px;
      margin-top: 4px;
    }

    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .mobile-overview-list {
      display: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      color: var(--muted);
      background: var(--surface);
    }

    td.desc {
      max-width: 440px;
      line-height: 1.55;
    }

    .group-row td {
      background: var(--surface-soft);
    }

    .group-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .group-title {
      display: grid;
      gap: 4px;
      min-width: 220px;
    }

    .group-title strong {
      font-size: 15px;
    }

    .group-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .group-toggle {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--txt);
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 800;
      white-space: nowrap;
    }

    .mobile-group-card,
    .mobile-detail-card {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      padding: 14px;
      min-width: 0;
    }

    .mobile-group-card {
      display: grid;
      gap: 12px;
    }

    .mobile-card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .mobile-card-title {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .mobile-card-title strong {
      font-size: 16px;
      overflow-wrap: anywhere;
    }

    .mobile-kpis,
    .mobile-detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .mobile-kpi,
    .mobile-detail-item {
      border-radius: var(--radius-md);
      background: var(--surface-soft);
      padding: 9px;
      min-width: 0;
    }

    .mobile-kpi span,
    .mobile-detail-item span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
      margin-bottom: 4px;
    }

    .mobile-kpi strong,
    .mobile-detail-item strong {
      display: block;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .mobile-detail-list {
      display: grid;
      gap: 10px;
    }

    .mobile-detail-card {
      background: var(--surface-soft);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 9px;
      background: rgba(56, 189, 248, .12);
      color: var(--acc2);
      font-size: 12px;
      font-weight: 800;
    }

    @media (max-width: 1082px) {
      body { padding: 10px; }
      .app-shell {
        width: min(100%, calc(100vw - 20px));
        margin-top: 58px;
      }
      .hero-shell { grid-template-columns: 1fr; }
      .section-head { align-items: start; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .result-kpis { grid-template-columns: 1fr; }
      .filter-row > * { flex: 1 1 180px; }
      .level-row { grid-template-columns: 1fr; }
    }

    @media (max-width: 768px) {
      html:root { --wjdr-fab-size: 44px; }

      html,
      body {
        max-width: 100%;
        overflow-x: hidden;
      }

      body {
        padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
      }

      .app-shell {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        margin: 60px auto 18px;
        gap: 12px;
      }

      .shell-card {
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        border-radius: 18px;
      }

      .hero-title {
        margin-bottom: 10px;
        font-size: clamp(26px, 8vw, 34px);
        line-height: 1.12;
        letter-spacing: 0;
      }

      .section,
      .hero-shell {
        padding: 12px;
        gap: 12px;
      }

      .hero-shell { grid-template-columns: 1fr; }

      .section-head {
        display: grid;
        align-items: start;
        gap: 8px;
      }

      .nav-row,
      .btn-row {
        display: grid;
        grid-template-columns: 1fr;
        align-items: stretch;
      }

      .controls-grid,
      .stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .controls-grid { gap: 8px; }
      .stats { gap: 6px; }

      .tech-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        min-width: 0;
      }

      .results-grid {
        grid-template-columns: 1fr;
        min-width: 0;
      }

      .note-card,
      .control-card,
      .tech-card,
      .result-card,
      .data-card,
      .stat {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        padding: 10px;
        border-radius: 14px;
      }

      .control-card,
      .stat { min-width: 0; }

      .level-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }

      input,
      select,
      .btn,
      .nav-link,
      .home-btn {
        min-width: 0;
        min-height: 44px;
      }

      input,
      select {
        padding: 9px 8px;
        font-size: 13px;
      }

      .btn-row .btn {
        width: 100%;
        justify-content: center;
      }

      .overview-table-wrap { display: none; }

      .mobile-overview-list {
        display: grid;
        gap: 8px;
      }

      .mobile-group-card,
      .mobile-detail-card {
        max-width: 100%;
        overflow: hidden;
      }

      .mobile-group-card {
        display: grid;
        gap: 8px;
        padding: 10px;
        border-radius: 14px;
      }

      .mobile-card-head,
      .group-summary {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
      }

      .mobile-card-title strong {
        font-size: 13px;
        line-height: 1.25;
      }

      .mobile-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px;
      }

      .mobile-detail-list { gap: 6px; }

      .mobile-detail-card {
        padding: 8px;
        border-radius: 12px;
      }

      .mobile-detail-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        margin-top: 6px !important;
      }

      .tech-detail-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
      }

      .mobile-kpi,
      .mobile-detail-item {
        padding: 6px 4px;
        border-radius: 9px;
        overflow: hidden;
      }

      .mobile-kpi span,
      .mobile-detail-item span {
        margin-bottom: 3px;
        font-size: 10px;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .mobile-kpi strong,
      .mobile-detail-item strong {
        min-width: 0;
        font-size: 11px;
        line-height: 1.2;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .result-card-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
      }

      .result-card-head .pill { justify-self: start; }

      .stat .value,
      .result-card,
      .tech-card,
      .control-card,
      .note-card,
      .nav-link,
      .pill {
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      body .table-wrap {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: hidden;
      }

      body .table-wrap > table {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        table-layout: fixed;
      }

      th,
      td {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
    }

    @media (max-width: 339px) {
      .tech-grid { grid-template-columns: 1fr; }
      .tech-detail-grid,
      .mobile-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
"""


THEME_JS = """
"""


def shell(title, body, script):
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <style>
{COMMON_CSS}
  </style>
  <script src="/function/analytics-tracker.js" defer></script>
  <link rel="stylesheet" href="/function/mobile-responsive.css" />
  <link rel="stylesheet" href="/function/theme.css" />
  <script src="/function/theme.js" defer></script>
</head>
<body>
  <a class="home-btn" href="../rukou.html">返回主页</a>
{body}
  <script>
    "use strict";
{script}
  </script>
</body>
</html>
"""


def overview_page(data_json, groups_json):
    body = """
  <main class="app-shell">
    <section class="shell-card hero-shell">
      <div>
        <div class="eyebrow">T12 Research Data</div>
        <h1 class="hero-title">T12 煌耀系列数据总览</h1>
        <p class="hero-copy">
          汇总 T12 煌耀系列科技需求表的全部数据，按煌耀盾兵、煌耀矛兵和煌耀射手三段保留原表顺序。
          支持按兵种筛选、关键词检索，并可直接查看每级资源、火晶和时间。
        </p>
        <div class="nav-row" style="margin-top: 18px;">
          <a class="nav-link" href="./T12Calculator.html">打开 T12 计算器</a>
          <a class="nav-link" href="./T11Calculator.html">查看 T11 计算器</a>
        </div>
      </div>
      <div class="hero-notes">
        <div class="note-card">
          <div class="note-label">数据规模</div>
          <div class="note-value"><span id="sourceRows">0</span> 条等级记录，<span id="sourceGroups">0</span> 个科技卡组</div>
        </div>
      </div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>筛选与统计</h2>
          <p class="section-copy">关键词会匹配科技名、技能描述和兵种名称。</p>
        </div>
      </div>
      <div class="controls-grid">
        <article class="control-card">
          <div class="input-stack">
            <label for="troopFilter">兵种筛选</label>
            <select id="troopFilter">
              <option value="all">全部兵种</option>
              <option value="煌耀盾兵">煌耀盾兵</option>
              <option value="煌耀矛兵">煌耀矛兵</option>
              <option value="煌耀射手">煌耀射手</option>
            </select>
          </div>
        </article>
        <article class="control-card">
          <div class="input-stack">
            <label for="searchInput">关键词</label>
            <input id="searchInput" type="search" placeholder="输入科技名、技能描述或兵种名称" />
          </div>
        </article>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">当前记录</div><div id="visibleRows" class="value">0</div></div>
        <div class="stat"><div class="label">肉</div><div id="visibleMeat" class="value">0</div></div>
        <div class="stat"><div class="label">木材</div><div id="visibleWood" class="value">0</div></div>
        <div class="stat"><div class="label">煤</div><div id="visibleCoal" class="value">0</div></div>
        <div class="stat"><div class="label">铁</div><div id="visibleIron" class="value">0</div></div>
        <div class="stat"><div class="label">钢材</div><div id="visibleSteel" class="value">0</div></div>
        <div class="stat"><div class="label">精炼火晶</div><div id="visibleRefinedCrystal" class="value">0</div></div>
        <div class="stat"><div class="label">火晶微粒</div><div id="visibleMicro" class="value">0</div></div>
        <div class="stat"><div class="label">所需时间</div><div id="visibleTime" class="value">0</div></div>
      </div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>数据明细</h2>
          <p class="section-copy">同类折叠默认收起，点击科技名或使用按钮展开后查看每级明细。</p>
        </div>
        <div class="btn-row">
          <button class="btn primary" id="expandAllGroups" type="button">一键展开</button>
          <button class="btn" id="collapseAllGroups" type="button">一键折叠</button>
        </div>
      </div>
      <div class="table-wrap overview-table-wrap">
        <table>
          <thead>
            <tr>
              <th>兵种</th>
              <th>科技名</th>
              <th>等级</th>
              <th>技能描述</th>
              <th>肉</th>
              <th>木材</th>
              <th>煤</th>
              <th>铁</th>
              <th>钢材</th>
              <th>精炼火晶</th>
              <th>火晶微粒</th>
              <th>所需时间</th>
            </tr>
          </thead>
          <tbody id="overviewRows"></tbody>
        </table>
      </div>
      <div id="overviewMobileRows" class="mobile-overview-list"></div>
    </section>
  </main>
"""
    script = f"""
    const t12Data = {data_json};
    const t12Groups = {groups_json};
    const expandedTechNames = new Set();

{THEME_JS}

    function fmt(n, d = 0) {{
      return Number(n || 0).toLocaleString("zh-CN", {{ minimumFractionDigits: d, maximumFractionDigits: d }});
    }}

    function fmtSmart(n) {{
      return Number(n || 0).toLocaleString("zh-CN", {{ minimumFractionDigits: 0, maximumFractionDigits: 2 }});
    }}

    function fmtTime(seconds) {{
      const days = Number(seconds || 0) / 86400;
      return `${{fmtSmart(days)}} 天`;
    }}

    function escapeHtml(value) {{
      return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#39;"
      }}[ch]));
    }}

    function buildGroupedRows(rows) {{
      const groups = new Map();
      rows.forEach(item => {{
        if (!groups.has(item.name)) {{
          groups.set(item.name, {{
            name: item.name,
            rows: [],
            troops: new Set(),
            groupIds: new Set(),
            meat: 0,
            wood: 0,
            coal: 0,
            iron: 0,
            steel: 0,
            refinedCrystal: 0,
            microCrystal: 0,
            seconds: 0
          }});
        }}
        const group = groups.get(item.name);
        group.rows.push(item);
        group.troops.add(item.troop);
        group.groupIds.add(item.groupId);
        group.meat += item.meat;
        group.wood += item.wood;
        group.coal += item.coal;
        group.iron += item.iron;
        group.steel += item.steel;
        group.refinedCrystal += item.refinedCrystal;
        group.microCrystal += item.microCrystal;
        group.seconds += item.seconds;
      }});
      return [...groups.values()];
    }}

    function applyFilters() {{
      const troop = document.getElementById("troopFilter").value;
      const query = document.getElementById("searchInput").value.trim().toLowerCase();
      return t12Data.filter(item => {{
        const troopOk = troop === "all" || item.troop === troop;
        const text = `${{item.troop}} ${{item.name}} ${{item.desc}}`.toLowerCase();
        return troopOk && (!query || text.includes(query));
      }});
    }}

    function sumRows(rows, key) {{
      return rows.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
    }}

    function renderStats(rows) {{
      const seconds = sumRows(rows, "seconds");
      document.getElementById("sourceRows").textContent = fmt(t12Data.length);
      document.getElementById("sourceGroups").textContent = fmt(t12Groups.length);
      document.getElementById("visibleRows").textContent = fmt(rows.length);
      document.getElementById("visibleMeat").textContent = fmt(sumRows(rows, "meat"));
      document.getElementById("visibleWood").textContent = fmt(sumRows(rows, "wood"));
      document.getElementById("visibleCoal").textContent = fmt(sumRows(rows, "coal"));
      document.getElementById("visibleIron").textContent = fmt(sumRows(rows, "iron"));
      document.getElementById("visibleSteel").textContent = fmt(sumRows(rows, "steel"));
      document.getElementById("visibleRefinedCrystal").textContent = fmt(sumRows(rows, "refinedCrystal"));
      document.getElementById("visibleMicro").textContent = fmt(sumRows(rows, "microCrystal"));
      document.getElementById("visibleTime").textContent = fmtTime(seconds);
    }}

    function renderDesktopRows(groupedRows) {{
      document.getElementById("overviewRows").innerHTML = groupedRows.map(group => {{
        const expanded = expandedTechNames.has(group.name);
        const troopLabel = [...group.troops].join(" / ");
        const levels = group.rows.map(item => item.level);
        const levelLabel = `Lv.${{Math.min(...levels)}}-${{Math.max(...levels)}}`;
        const groupRow = `
          <tr class="group-row">
            <td colspan="12">
              <div class="group-summary">
                <div class="group-title">
                  <strong>${{escapeHtml(group.name)}}</strong>
                  <span class="group-meta">${{escapeHtml(troopLabel)}} · ${{group.rows.length}} 条等级记录 · ${{levelLabel}}</span>
                </div>
                <div class="group-meta">火晶微粒 ${{fmt(group.microCrystal)}} · 所需时间 ${{fmtTime(group.seconds)}}</div>
                <button class="group-toggle" type="button" data-tech-name="${{escapeHtml(group.name)}}">${{expanded ? "收起" : "展开"}}</button>
              </div>
            </td>
          </tr>
        `;
        if (!expanded) return groupRow;
        return groupRow + group.rows.map(item => `
        <tr>
          <td><span class="pill">${{escapeHtml(item.troop)}}</span></td>
          <td>${{escapeHtml(item.name)}}</td>
          <td>Lv.${{item.level}}</td>
          <td class="desc">${{escapeHtml(item.desc)}}</td>
          <td>${{fmt(item.meat)}}</td>
          <td>${{fmt(item.wood)}}</td>
          <td>${{fmt(item.coal)}}</td>
          <td>${{fmt(item.iron)}}</td>
          <td>${{fmt(item.steel)}}</td>
          <td>${{fmt(item.refinedCrystal)}}</td>
          <td>${{fmt(item.microCrystal)}}</td>
          <td>${{fmtTime(item.seconds)}}</td>
        </tr>
        `).join("");
      }}).join("");
    }}

    function renderMobileRows(groupedRows) {{
      document.getElementById("overviewMobileRows").innerHTML = groupedRows.map(group => {{
        const expanded = expandedTechNames.has(group.name);
        const troopLabel = [...group.troops].join(" / ");
        const levels = group.rows.map(item => item.level);
        const levelLabel = `Lv.${{Math.min(...levels)}}-${{Math.max(...levels)}}`;
        const detailCards = expanded ? `
          <div class="mobile-detail-list">
            ${{group.rows.map(item => `
              <article class="mobile-detail-card">
                <div class="mobile-card-head">
                  <div class="mobile-card-title">
                    <strong>Lv.${{item.level}}</strong>
                    <span class="group-meta">${{escapeHtml(item.desc)}}</span>
                  </div>
                  <span class="pill">${{escapeHtml(item.troop)}}</span>
                </div>
                <div class="mobile-detail-grid" style="margin-top: 10px;">
                  <div class="mobile-detail-item"><span>肉</span><strong>${{fmt(item.meat)}}</strong></div>
                  <div class="mobile-detail-item"><span>木材</span><strong>${{fmt(item.wood)}}</strong></div>
                  <div class="mobile-detail-item"><span>煤</span><strong>${{fmt(item.coal)}}</strong></div>
                  <div class="mobile-detail-item"><span>铁</span><strong>${{fmt(item.iron)}}</strong></div>
                  <div class="mobile-detail-item"><span>钢材</span><strong>${{fmt(item.steel)}}</strong></div>
                  <div class="mobile-detail-item"><span>精炼火晶</span><strong>${{fmt(item.refinedCrystal)}}</strong></div>
                  <div class="mobile-detail-item"><span>火晶微粒</span><strong>${{fmt(item.microCrystal)}}</strong></div>
                  <div class="mobile-detail-item"><span>所需时间</span><strong>${{fmtTime(item.seconds)}}</strong></div>
                </div>
              </article>
            `).join("")}}
          </div>
        ` : "";

        return `
          <article class="mobile-group-card">
            <div class="mobile-card-head">
              <div class="mobile-card-title">
                <strong>${{escapeHtml(group.name)}}</strong>
                <span class="group-meta">${{escapeHtml(troopLabel)}} · ${{group.rows.length}} 条等级记录 · ${{levelLabel}}</span>
              </div>
              <button class="group-toggle" type="button" data-tech-name="${{escapeHtml(group.name)}}">${{expanded ? "收起" : "展开"}}</button>
            </div>
            <div class="mobile-kpis">
              <div class="mobile-kpi"><span>火晶微粒</span><strong>${{fmt(group.microCrystal)}}</strong></div>
              <div class="mobile-kpi"><span>所需时间</span><strong>${{fmtTime(group.seconds)}}</strong></div>
              <div class="mobile-kpi"><span>钢材</span><strong>${{fmt(group.steel)}}</strong></div>
              <div class="mobile-kpi"><span>精炼火晶</span><strong>${{fmt(group.refinedCrystal)}}</strong></div>
            </div>
            ${{detailCards}}
          </article>
        `;
      }}).join("");
    }}

    function renderRows() {{
      const rows = applyFilters();
      const groupedRows = buildGroupedRows(rows);
      renderDesktopRows(groupedRows);
      renderMobileRows(groupedRows);
      renderStats(rows);
    }}

    function init() {{
      document.getElementById("troopFilter").addEventListener("change", renderRows);
      document.getElementById("searchInput").addEventListener("input", renderRows);
      document.getElementById("expandAllGroups").addEventListener("click", () => {{
        buildGroupedRows(applyFilters()).forEach(group => expandedTechNames.add(group.name));
        renderRows();
      }});
      document.getElementById("collapseAllGroups").addEventListener("click", () => {{
        expandedTechNames.clear();
        renderRows();
      }});
      document.getElementById("overviewRows").addEventListener("click", event => {{
        const button = event.target.closest("[data-tech-name]");
        if (!button) return;
        const techName = button.getAttribute("data-tech-name");
        if (expandedTechNames.has(techName)) {{
          expandedTechNames.delete(techName);
        }} else {{
          expandedTechNames.add(techName);
        }}
        renderRows();
      }});
      document.getElementById("overviewMobileRows").addEventListener("click", event => {{
        const button = event.target.closest("[data-tech-name]");
        if (!button) return;
        const techName = button.getAttribute("data-tech-name");
        if (expandedTechNames.has(techName)) {{
          expandedTechNames.delete(techName);
        }} else {{
          expandedTechNames.add(techName);
        }}
        renderRows();
      }});
      renderRows();
    }}

    init();
"""
    return shell("T12 煌耀系列数据总览-冬日工具箱", body, script)


def calculator_page(data_json, groups_json, unlock_targets_json):
    body = """
  <main class="app-shell">
    <section class="shell-card hero-shell">
      <div>
        <div class="eyebrow">T12 Research Planner</div>
        <h1 class="hero-title">T12 煌耀系列科技计算器</h1>
        <p class="hero-copy">
          沿用 T11 计算器的卡片式体验，按当前等级到目标等级累计 T12 科技所需资源、精炼火晶、火晶微粒和研究时间。
          为避免 60 个科技卡一次铺满，默认按兵种分组展示，汇总仍会计算所有已设置项目。
        </p>
        <div class="nav-row" style="margin-top: 18px;">
          <a class="nav-link" href="./T12DataOverview.html">查看 T12 数据总览</a>
          <a class="nav-link" href="./T11Calculator.html">查看 T11 计算器</a>
        </div>
      </div>
      <div class="hero-notes">
        <div class="note-card">
          <div class="note-label">计算规则</div>
          <div class="note-value">按“已研究等级 &lt; 等级 &lt;= 目标等级”累计资源与时间。</div>
        </div>
      </div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>计算设置</h2>
          <p class="section-copy">先选择兵种显示范围，再使用预设或手动设置每个科技的起止等级。</p>
        </div>
      </div>
      <div class="controls-grid">
        <article class="control-card">
          <div class="input-stack">
            <label for="troopSelect">显示兵种</label>
            <select id="troopSelect">
              <option value="煌耀盾兵">煌耀盾兵</option>
              <option value="煌耀矛兵">煌耀矛兵</option>
              <option value="煌耀射手">煌耀射手</option>
              <option value="all">全部兵种</option>
            </select>
          </div>
        </article>
        <article class="control-card">
          <div class="input-stack">
            <label for="speed">研究速度百分比</label>
            <input id="speed" type="number" step="0.1" value="0" />
            <p class="hint">折算后天数 = 原始天数 / (1 + 研究速度 / 100)。</p>
          </div>
        </article>
        <article class="control-card">
          <h3>预设方案</h3>
          <div class="btn-row" style="margin-top: 10px;">
            <button class="btn primary" id="presetUnlockSingle">解锁单路 T12</button>
            <button class="btn accent" id="presetFullSingle">单路 T12 拉满</button>
            <button class="btn primary" id="presetUnlockThree">解锁三路 T12</button>
            <button class="btn accent" id="presetFullThree">三路 T12 拉满</button>
            <button class="btn" id="presetEmpty">清空</button>
          </div>
          <p class="hint" style="margin-top: 10px;">单路方案作用于当前「显示兵种」；选「全部兵种」时默认按煌耀盾兵。三路方案会同时设置三个兵种并切到全部显示。</p>
        </article>
      </div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>科技设置</h2>
          <p class="section-copy">每张卡对应一个科技卡组，同名“烈阳雄师”已按兵种拆分为独立卡组。</p>
        </div>
        <span id="visibleGroupCount" class="pill">0 个科技卡组</span>
      </div>
      <div id="cards" class="tech-grid"></div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>总览结果</h2>
          <p class="section-copy">汇总所有已选择目标等级的 T12 科技。</p>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="label">原始天数</div><div id="rawDays" class="value">0</div></div>
        <div class="stat"><div class="label">折算后天数</div><div id="adjDays" class="value">0</div></div>
        <div class="stat"><div class="label">所需时间</div><div id="requiredTime" class="value">0</div></div>
        <div class="stat"><div class="label">精炼火晶</div><div id="refinedCrystal" class="value">0</div></div>
        <div class="stat"><div class="label">火晶微粒</div><div id="microCrystal" class="value">0</div></div>
        <div class="stat"><div class="label">钢材</div><div id="totalSteel" class="value">0</div></div>
        <div class="stat"><div class="label">肉</div><div id="totalMeat" class="value">0</div></div>
        <div class="stat"><div class="label">木材</div><div id="totalWood" class="value">0</div></div>
        <div class="stat"><div class="label">煤</div><div id="totalCoal" class="value">0</div></div>
        <div class="stat"><div class="label">铁</div><div id="totalIron" class="value">0</div></div>
      </div>
    </section>

    <section class="section shell-card">
      <div class="section-head">
        <div>
          <h2>科技详情</h2>
          <p class="section-copy">只显示目标等级高于当前等级的科技，便于聚焦实际消耗。</p>
        </div>
      </div>
      <div id="results" class="results-grid"></div>
    </section>
  </main>
"""
    script = f"""
    const t12Data = {data_json};
    const t12Groups = {groups_json};
    const unlockT12Targets = {unlock_targets_json};
    const rowsByGroup = new Map();
    const state = {{}};

    t12Data.forEach(item => {{
      if (!rowsByGroup.has(item.groupId)) rowsByGroup.set(item.groupId, []);
      rowsByGroup.get(item.groupId).push(item);
    }});
    rowsByGroup.forEach(rows => rows.sort((a, b) => a.level - b.level));
    t12Groups.forEach(group => {{
      state[group.id] = {{ current: 0, target: 0, max: group.max }};
    }});

{THEME_JS}

    function fmt(n, d = 0) {{
      return Number(n || 0).toLocaleString("zh-CN", {{ minimumFractionDigits: d, maximumFractionDigits: d }});
    }}

    function fmtSmart(n) {{
      return Number(n || 0).toLocaleString("zh-CN", {{ minimumFractionDigits: 0, maximumFractionDigits: 2 }});
    }}

    function fmtWan(n) {{
      return `${{fmtSmart(Number(n || 0) / 10000)}} 万`;
    }}

    function fmtSeconds(seconds) {{
      const sec = Math.round(Number(seconds || 0));
      const days = Math.floor(sec / 86400);
      const hours = Math.floor((sec % 86400) / 3600);
      const minutes = Math.floor((sec % 3600) / 60);
      if (days > 0) return `${{days}} 天 ${{hours}} 小时${{minutes ? ` ${{minutes}} 分钟` : ""}}`;
      if (hours > 0) return `${{hours}} 小时${{minutes ? ` ${{minutes}} 分钟` : ""}}`;
      return `${{minutes}} 分钟`;
    }}

    function escapeHtml(value) {{
      return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#39;"
      }}[ch]));
    }}

    function optionHtmlNum(start, end, selected) {{
      let html = "";
      for (let i = start; i <= end; i += 1) {{
        html += `<option value="${{i}}" ${{i === selected ? "selected" : ""}}>${{i}}</option>`;
      }}
      return html;
    }}

    function currentFilterGroups() {{
      const troop = document.getElementById("troopSelect").value;
      return t12Groups.filter(group => troop === "all" || group.troop === troop);
    }}

    function resetAllTargets() {{
      t12Groups.forEach(group => {{
        state[group.id].current = 0;
        state[group.id].target = 0;
      }});
    }}

    function unlockTargetGroupsForTroops(troops) {{
      return troops.flatMap(troop => {{
        return (unlockT12Targets[troop] || []).map(target => {{
          const group = t12Groups.find(item => item.troop === troop && item.name === target.name);
          return group ? {{ group, target: target.target }} : null;
        }}).filter(Boolean);
      }});
    }}

    function selectedSingleTroop() {{
      const selected = document.getElementById("troopSelect").value;
      return selected === "all" ? "煌耀盾兵" : selected;
    }}

    function renderCards() {{
      const groups = currentFilterGroups();
      const container = document.getElementById("cards");
      document.getElementById("visibleGroupCount").textContent = `${{fmt(groups.length)}} 个科技卡组`;
      container.innerHTML = groups.map(group => {{
        const st = state[group.id];
        return `
          <article class="tech-card">
            <div class="card-subtitle">${{escapeHtml(group.troop)}} · 最高 Lv.${{group.max}}</div>
            <h3>${{escapeHtml(group.name)}}</h3>
            <p class="card-subtitle">${{escapeHtml(group.firstDesc)}}</p>
            <div class="level-row">
              <div class="field">
                <label for="current-${{group.id}}">已研究等级</label>
                <select id="current-${{group.id}}" data-group="${{group.id}}" data-kind="current">${{optionHtmlNum(0, group.max, st.current)}}</select>
              </div>
              <div class="field">
                <label for="target-${{group.id}}">目标等级</label>
                <select id="target-${{group.id}}" data-group="${{group.id}}" data-kind="target">${{optionHtmlNum(0, group.max, st.target)}}</select>
              </div>
            </div>
          </article>
        `;
      }}).join("");

      container.querySelectorAll("select[data-group]").forEach(select => {{
        select.addEventListener("change", event => {{
          const groupId = event.target.getAttribute("data-group");
          const kind = event.target.getAttribute("data-kind");
          state[groupId][kind] = Number(event.target.value);
          if (state[groupId].target < state[groupId].current) {{
            state[groupId].target = state[groupId].current;
            const target = document.getElementById(`target-${{groupId}}`);
            if (target) target.value = state[groupId].target;
          }}
          calc();
        }});
      }});
    }}

    function resourceMarkup(label, value) {{
      return `
        <div class="resource-item">
          <span>${{label}}</span>
          <strong>${{fmt(value)}}</strong>
          <div class="resource-sub">${{fmtWan(value)}}</div>
        </div>
      `;
    }}

    function renderResults(items) {{
      const results = document.getElementById("results");
      if (!items.length) {{
        results.innerHTML = `<div class="empty-state">还没有选择任何目标等级。可以使用预设，或手动调整科技卡片。</div>`;
        return;
      }}

      results.innerHTML = items.map(item => `
        <article class="result-card">
          <div class="result-card-head">
            <div>
              <div class="card-subtitle">${{escapeHtml(item.troop)}}</div>
              <h3>${{escapeHtml(item.name)}}</h3>
              <div class="result-progress">Lv.${{item.current}} -> Lv.${{item.target}}</div>
            </div>
            <span class="pill">${{fmtSeconds(item.seconds)}}</span>
          </div>
          <div class="tech-detail-grid">
            <div class="result-kpi"><span>所需时间</span><strong>${{fmtSmart(item.seconds / 86400)}} 天</strong></div>
            <div class="result-kpi"><span>精炼火晶</span><strong>${{fmt(item.refinedCrystal)}}</strong></div>
            <div class="result-kpi"><span>火晶微粒</span><strong>${{fmt(item.microCrystal)}}</strong></div>
            ${{resourceMarkup("钢材", item.steel)}}
            ${{resourceMarkup("肉", item.meat)}}
            ${{resourceMarkup("木材", item.wood)}}
            ${{resourceMarkup("煤", item.coal)}}
            ${{resourceMarkup("铁", item.iron)}}
          </div>
        </article>
      `).join("");
    }}

    function calc() {{
      const speed = Number(document.getElementById("speed").value) || 0;
      const ratio = 1 + speed / 100;
      const totals = {{ seconds: 0, meat: 0, wood: 0, coal: 0, iron: 0, steel: 0, refinedCrystal: 0, microCrystal: 0 }};
      const resultItems = [];

      t12Groups.forEach(group => {{
        const st = state[group.id];
        const rows = rowsByGroup.get(group.id) || [];
        const sum = {{ seconds: 0, meat: 0, wood: 0, coal: 0, iron: 0, steel: 0, refinedCrystal: 0, microCrystal: 0 }};

        rows.forEach(item => {{
          if (item.level > st.current && item.level <= st.target) {{
            sum.seconds += item.seconds;
            sum.meat += item.meat;
            sum.wood += item.wood;
            sum.coal += item.coal;
            sum.iron += item.iron;
            sum.steel += item.steel;
            sum.refinedCrystal += item.refinedCrystal;
            sum.microCrystal += item.microCrystal;
          }}
        }});

        Object.keys(totals).forEach(key => {{ totals[key] += sum[key]; }});
        if (st.target > st.current) {{
          resultItems.push({{
            troop: group.troop,
            name: group.name,
            current: st.current,
            target: st.target,
            ...sum
          }});
        }}
      }});

      const rawDays = totals.seconds / 86400;
      renderResults(resultItems);
      document.getElementById("rawDays").textContent = fmtSmart(rawDays);
      document.getElementById("adjDays").textContent = fmtSmart(rawDays / ratio);
      document.getElementById("requiredTime").textContent = fmtSeconds(totals.seconds);
      document.getElementById("refinedCrystal").textContent = fmt(totals.refinedCrystal);
      document.getElementById("microCrystal").textContent = fmt(totals.microCrystal);
      document.getElementById("totalSteel").textContent = fmt(totals.steel);
      document.getElementById("totalMeat").textContent = fmt(totals.meat);
      document.getElementById("totalWood").textContent = fmt(totals.wood);
      document.getElementById("totalCoal").textContent = fmt(totals.coal);
      document.getElementById("totalIron").textContent = fmt(totals.iron);
    }}

    function applyPreset(type) {{
      if (type === "empty") {{
        resetAllTargets();
      }} else if (type === "unlockSingle") {{
        resetAllTargets();
        const troop = selectedSingleTroop();
        document.getElementById("troopSelect").value = troop;
        unlockTargetGroupsForTroops([troop]).forEach(item => {{
          state[item.group.id].current = 0;
          state[item.group.id].target = item.target;
        }});
      }} else if (type === "fullSingle") {{
        resetAllTargets();
        const troop = selectedSingleTroop();
        document.getElementById("troopSelect").value = troop;
        t12Groups.filter(group => group.troop === troop).forEach(group => {{
          state[group.id].current = 0;
          state[group.id].target = group.max;
        }});
      }} else if (type === "unlockThree") {{
        resetAllTargets();
        document.getElementById("troopSelect").value = "all";
        unlockTargetGroupsForTroops(Object.keys(unlockT12Targets)).forEach(item => {{
          state[item.group.id].current = 0;
          state[item.group.id].target = item.target;
        }});
      }} else if (type === "fullThree") {{
        resetAllTargets();
        document.getElementById("troopSelect").value = "all";
        t12Groups.forEach(group => {{
          state[group.id].current = 0;
          state[group.id].target = group.max;
        }});
      }}

      renderCards();
      calc();
    }}

    function init() {{
      renderCards();
      calc();
      document.getElementById("troopSelect").addEventListener("change", () => {{
        renderCards();
      }});
      document.getElementById("speed").addEventListener("input", calc);
      document.getElementById("presetUnlockSingle").addEventListener("click", () => applyPreset("unlockSingle"));
      document.getElementById("presetFullSingle").addEventListener("click", () => applyPreset("fullSingle"));
      document.getElementById("presetUnlockThree").addEventListener("click", () => applyPreset("unlockThree"));
      document.getElementById("presetFullThree").addEventListener("click", () => applyPreset("fullThree"));
      document.getElementById("presetEmpty").addEventListener("click", () => applyPreset("empty"));
    }}

    init();
"""
    return shell("T12 煌耀系列科技计算器-冬日工具箱", body, script)


def main():
    rows = read_xlsx_rows(SOURCE)
    data, groups = build_dataset(rows)
    unlock_targets = build_unlock_targets(groups)
    data_json = js_json(data)
    groups_json = js_json(groups)
    unlock_targets_json = js_json(unlock_targets)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "T12DataOverview.html").write_text(
        overview_page(data_json, groups_json),
        encoding="utf-8",
    )
    (OUT_DIR / "T12Calculator.html").write_text(
        calculator_page(data_json, groups_json, unlock_targets_json),
        encoding="utf-8",
    )
    print(f"generated {len(data)} rows and {len(groups)} groups")


if __name__ == "__main__":
    main()
