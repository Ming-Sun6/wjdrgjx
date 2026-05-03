from __future__ import annotations

import os
import json
import re
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parents[1]
HUB_ROOT = REPO_ROOT / "public" / "function" / "reference-hub"
PAGES_ROOT = HUB_ROOT / "pages"
DATA_ROOT = HUB_ROOT / "data"
ASSET_ROOT = HUB_ROOT / "assets"
LOCK_PATH = HUB_ROOT / ".generate.lock"
LOCK_TIMEOUT_SECONDS = 60
EXCLUDED_SHEETS = {"目录", "特惠礼包合集", "常规礼包合集", "Sheet1", "WpsReserved_CellImgList"}
DISPIMG_RE = re.compile(r'DISPIMG\("([^"]+)"(?:,\d+)?\)')
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "office": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "etc": "http://www.wps.cn/officeDocument/2017/etCustomData",
}
SLUGS = {
    "秘宝猎人": "treasure-hunter",
    "逐光之旅": "journey-of-light",
    "雪原大冒险": "snowfield-adventure",
    "喀莎许愿屋": "kasha-wish-house",
    "节日活动道具礼包": "festival-prop-packs",
    "宴席活动+加餐礼包": "banquet-bonus-packs",
    "海岛皮肤礼包": "island-skin-packs",
    "银霜商铺": "silver-frost-shop",
    "霜龙行军和宴席": "frost-dragon-march",
    "龙裔商旅": "dragonborn-trader",
    "万象杂货铺": "universal-grocery",
    "2025元宵礼包": "lantern-2025-packs",
    "2025情人节商铺": "valentine-2025-shop",
    "遗失的珍宝": "lost-treasures",
    "钓鱼套装": "fishing-set",
    "冰封的宝藏": "frozen-treasure",
    "除雪礼包": "snow-clearing-packs",
    "弹窗礼包": "popup-packs",
    "周卡": "weekly-cards",
}


def main() -> None:
    with generation_lock():
        generate_reference_hub()


def generate_reference_hub() -> None:
    workbook = find_workbook_path()
    ensure_output_dirs()
    with zipfile.ZipFile(workbook) as workbook_zip:
        shared_strings = load_shared_strings(workbook_zip)
        image_map = load_cell_image_map(workbook_zip)
        sheets = load_sheets(workbook_zip, shared_strings, image_map)
    write_manifest(sheets)
    write_index_page(sheets)
    for sheet in sheets:
        write_sheet_page(sheet)


@contextmanager
def generation_lock():
    HUB_ROOT.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    lock_fd = None
    while lock_fd is None:
        try:
            lock_fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.write(lock_fd, str(os.getpid()).encode("ascii"))
        except FileExistsError:
            if time.monotonic() - start > LOCK_TIMEOUT_SECONDS:
                raise TimeoutError(f"Timed out waiting for {LOCK_PATH}")
            time.sleep(0.05)
    try:
        yield
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
        try:
            LOCK_PATH.unlink()
        except FileNotFoundError:
            pass


def find_workbook_path() -> Path:
    matches = sorted(
        path for path in REPO_ROOT.joinpath("public").rglob("*3.0.xlsx")
        if not path.name.startswith("~$")
    )
    if not matches:
        raise FileNotFoundError("Workbook not found")
    return matches[0]


def ensure_output_dirs() -> None:
    PAGES_ROOT.mkdir(parents=True, exist_ok=True)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)


def load_shared_strings(workbook_zip: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook_zip.namelist():
        return []
    root = ET.fromstring(workbook_zip.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(".//main:t", NS))
        for item in root.findall("main:si", NS)
    ]


def load_cell_image_map(workbook_zip: zipfile.ZipFile) -> dict[str, str]:
    if "xl/cellimages.xml" not in workbook_zip.namelist():
        return {}
    rel_root = ET.fromstring(workbook_zip.read("xl/_rels/cellimages.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("package:Relationship", NS)
    }
    images_root = ET.fromstring(workbook_zip.read("xl/cellimages.xml"))
    image_map: dict[str, str] = {}
    for cell_image in images_root.findall("etc:cellImage", NS):
        pic = cell_image.find("xdr:pic", NS)
        if pic is None:
            continue
        props = pic.find("xdr:nvPicPr/xdr:cNvPr", NS)
        blip = pic.find("xdr:blipFill/a:blip", NS)
        if props is None or blip is None:
            continue
        name = props.attrib.get("name", "").strip()
        rel_id = blip.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed", "")
        target = rel_map.get(rel_id)
        if name and target:
            image_map[name] = "xl/" + target.lstrip("/")
    return image_map


def load_sheets(
    workbook_zip: zipfile.ZipFile,
    shared_strings: list[str],
    image_map: dict[str, str],
) -> list[dict[str, Any]]:
    workbook_root = ET.fromstring(workbook_zip.read("xl/workbook.xml"))
    rel_root = ET.fromstring(workbook_zip.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("package:Relationship", NS)
    }
    sheets: list[dict[str, Any]] = []
    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        if name in EXCLUDED_SHEETS:
            continue
        rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rel_map[rid]
        sheet_root = ET.fromstring(workbook_zip.read("xl/" + target.lstrip("/")))
        grid = build_sheet_grid(sheet_root, shared_strings, image_map)
        slug = SLUGS.get(name, fallback_slug(name))
        copy_sheet_assets(workbook_zip, slug, grid["image_refs"])
        rewrite_grid_image_paths(grid, slug)
        sheets.append({
            "name": name,
            "slug": slug,
            "path": f"./pages/{slug}.html",
            "grid": grid,
        })
    return sheets


def build_sheet_grid(
    sheet_root: ET.Element,
    shared_strings: list[str],
    image_map: dict[str, str],
) -> dict[str, Any]:
    dimension = sheet_root.find("main:dimension", NS)
    start_row, start_col, end_row, end_col = parse_dimension(dimension.attrib.get("ref", "A1:A1") if dimension is not None else "A1:A1")
    merges = [node.attrib["ref"] for node in sheet_root.findall("main:mergeCells/main:mergeCell", NS)]
    image_refs: dict[str, str] = {}
    row_map: dict[int, dict[int, Any]] = {}

    for row in sheet_root.findall("main:sheetData/main:row", NS):
        row_index = int(row.attrib.get("r", "1")) - start_row
        cell_map: dict[int, Any] = {}
        for cell in row.findall("main:c", NS):
            _, col_index = parse_cell_ref(cell.attrib.get("r", "A1"))
            cell_map[col_index - start_col] = parse_workbook_cell(cell, shared_strings, image_map, image_refs)
        row_map[row_index] = cell_map

    rows: list[list[Any]] = []
    for row_offset in range(end_row - start_row + 1):
        current = row_map.get(row_offset, {})
        rows.append([current.get(col_offset, "") for col_offset in range(end_col - start_col + 1)])

    return {
        "startRow": start_row,
        "startCol": start_col,
        "rows": rows,
        "merges": merges,
        "image_refs": image_refs,
    }


def parse_workbook_cell(
    cell: ET.Element,
    shared_strings: list[str],
    image_map: dict[str, str],
    image_refs: dict[str, str],
) -> Any:
    formula = cell.find("main:f", NS)
    if formula is not None and formula.text:
        image_cell = materialize_dispimg_text(formula.text, image_map, image_refs)
        if isinstance(image_cell, dict):
            return image_cell

    inline = cell.find("main:is", NS)
    if inline is not None:
        text = "".join(node.text or "" for node in inline.findall(".//main:t", NS)).strip()
        return materialize_dispimg_text(text, image_map, image_refs)

    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        return ""

    raw = value_node.text.strip()
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        return materialize_dispimg_text(shared_strings[int(raw)].strip(), image_map, image_refs)
    if cell_type == "b":
        return "TRUE" if raw == "1" else "FALSE"

    image_cell = materialize_dispimg_text(raw, image_map, image_refs)
    if isinstance(image_cell, dict):
        return image_cell
    if re.fullmatch(r"-?\d+\.0+", raw):
        return raw.split(".", 1)[0]
    return raw


def materialize_dispimg_text(
    text: str,
    image_map: dict[str, str],
    image_refs: dict[str, str],
) -> Any:
    match = DISPIMG_RE.search(text or "")
    if not match:
        return text
    image_id = match.group(1)
    source = image_map.get(image_id)
    if not source:
        return text
    image_refs[image_id] = source
    return {
        "type": "image",
        "imageId": image_id,
        "src": source,
        "alt": image_id,
    }


def copy_sheet_assets(workbook_zip: zipfile.ZipFile, slug: str, image_refs: dict[str, str]) -> None:
    target_dir = ASSET_ROOT / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for image_id, source in image_refs.items():
        suffix = Path(source).suffix or ".png"
        (target_dir / f"{image_id.lower()}{suffix}").write_bytes(workbook_zip.read(source))


def rewrite_grid_image_paths(grid: dict[str, Any], slug: str) -> None:
    for row in grid["rows"]:
        for cell in row:
            if isinstance(cell, dict) and cell.get("type") == "image":
                suffix = Path(cell["src"]).suffix or ".png"
                cell["src"] = f"./../assets/{slug}/{cell['imageId'].lower()}{suffix}"


def parse_dimension(ref: str) -> tuple[int, int, int, int]:
    if ":" not in ref:
        row, col = parse_cell_ref(ref)
        return row, col, row, col
    start_ref, end_ref = ref.split(":", 1)
    start_row, start_col = parse_cell_ref(start_ref)
    end_row, end_col = parse_cell_ref(end_ref)
    return start_row, start_col, end_row, end_col


def parse_cell_ref(ref: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    if not match:
        return (1, 1)
    letters, row_text = match.groups()
    return int(row_text), letters_to_col(letters)


def letters_to_col(letters: str) -> int:
    value = 0
    for char in letters:
        value = value * 26 + (ord(char) - 64)
    return value


def build_merge_maps(
    merge_refs: list[str],
    start_row: int,
    start_col: int,
) -> tuple[dict[str, tuple[int, int]], set[str]]:
    lead_map: dict[str, tuple[int, int]] = {}
    covered: set[str] = set()
    for ref in merge_refs:
        if ":" not in ref:
            continue
        start_ref, end_ref = ref.split(":", 1)
        start = parse_cell_ref(start_ref)
        end = parse_cell_ref(end_ref)
        lead_map[f"{start[0] - start_row}:{start[1] - start_col}"] = (end[0] - start[0] + 1, end[1] - start[1] + 1)
        for row in range(start[0], end[0] + 1):
            for col in range(start[1], end[1] + 1):
                if row == start[0] and col == start[1]:
                    continue
                covered.add(f"{row - start_row}:{col - start_col}")
    return lead_map, covered


def render_html_cell(cell: Any) -> str:
    if isinstance(cell, dict) and cell.get("type") == "image":
        return (
            f'<img src="{cell["src"]}" alt="{escape_html(cell.get("alt", ""))}" '
            'style="max-width:72px;max-height:72px;object-fit:contain;display:block;margin:0 auto;">'
        )
    return escape_html("" if cell is None else str(cell))


def render_grid_table(grid: dict[str, Any]) -> str:
    lead_map, covered = build_merge_maps(grid["merges"], grid["startRow"], grid["startCol"])
    body = []
    for row_index, row in enumerate(grid["rows"]):
        cells = []
        for col_index, cell in enumerate(row):
            key = f"{row_index}:{col_index}"
            if key in covered:
                continue
            attrs = ""
            if key in lead_map:
                rowspan, colspan = lead_map[key]
                if rowspan > 1:
                    attrs += f' rowspan="{rowspan}"'
                if colspan > 1:
                    attrs += f' colspan="{colspan}"'
            cells.append(f"<td{attrs}>{render_html_cell(cell)}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return "<table>" + "".join(body) + "</table>"


def is_empty_cell(cell: Any) -> bool:
    return cell is None or cell == ""


def compact_rows(rows: list[list[Any]]) -> list[list[Any]]:
    if not rows:
        return rows
    min_col = None
    max_col = None
    for row in rows:
        for index, cell in enumerate(row):
            if is_empty_cell(cell):
                continue
            min_col = index if min_col is None else min(min_col, index)
            max_col = index if max_col is None else max(max_col, index)
    if min_col is None or max_col is None:
        return rows
    return [row[min_col:max_col + 1] for row in rows]


def trim_section_rows(rows: list[list[Any]]) -> list[list[Any]]:
    return [row for row in rows if any(not is_empty_cell(cell) for cell in row)]


def slice_columns(rows: list[list[Any]], start_col: int, end_col: int) -> list[list[Any]]:
    return [row[start_col:end_col] for row in rows]


def normalize_label(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def render_simple_table(rows: list[list[Any]], title: str, author: str = "") -> str:
    table_rows = compact_rows(rows)
    if not table_rows:
        return ""
    header = table_rows[0]
    body = table_rows[1:]
    title_html = f'<div class="subtitle-row"><h2>{escape_html(title)}</h2>{("<span>" + escape_html(author) + "</span>") if author else ""}</div>'
    return (
        '<section class="section-card">' +
          title_html +
          '<div class="table-wrap"><table><tbody>' +
            '<tr>' + ''.join(f'<th>{render_html_cell(cell)}</th>' for cell in header) + '</tr>' +
            ''.join('<tr>' + ''.join(f'<td>{render_html_cell(cell)}</td>' for cell in row) + '</tr>' for row in body) +
          '</tbody></table></div>' +
        '</section>'
    )


def render_compact_table(title: str, author: str, rows: list[list[Any]]) -> str:
    table_rows = trim_section_rows(rows)
    if not table_rows:
        return ""
    header = table_rows[0]
    body = table_rows[1:]
    title_html = f'<div class="subtitle-row"><h2>{escape_html(title)}</h2>{("<span>" + escape_html(author) + "</span>") if author else ""}</div>'
    return (
        '<section class="section-card">' +
          title_html +
          '<div class="table-wrap"><table><tbody>' +
            '<tr>' + ''.join(f'<th>{render_html_cell(cell)}</th>' for cell in header) + '</tr>' +
            ''.join('<tr>' + ''.join(f'<td>{render_html_cell(cell)}</td>' for cell in row) + '</tr>' for row in body) +
          '</tbody></table></div>' +
        '</section>'
    )


def render_note_block(title: str, author: str, content: str) -> str:
    return (
        '<section class="section-card note-card">' +
          f'<div class="subtitle-row"><h2>{escape_html(title)}</h2><span>{escape_html(author)}</span></div>' +
          f'<div class="note-body">{escape_html(content)}</div>' +
        '</section>'
    )


def render_snowfield_page(sheet: dict[str, Any]) -> str:
    rows = sheet["grid"]["rows"]

    def render_self_select(start_index: int, end_index: int) -> str:
        title = normalize_label(rows[start_index][1])
        author = str(rows[start_index][6] or "")
        section_rows = slice_columns(rows[start_index + 1:end_index], 1, 8)
        return render_compact_table(title, author, section_rows)

    sections = [
        render_note_block("雪原大冒险活动建议", "甜甜", str(rows[3][11] or "")),
        render_compact_table("礼包购买获得", "作者:甜甜", slice_columns(rows[2:8], 0, 10)),
        render_compact_table("进度奖励", "作者:甜甜", slice_columns(rows[10:16], 0, 6)),
        render_self_select(17, 43),
        render_self_select(43, 69),
        render_self_select(69, 95),
        render_self_select(95, 121),
        render_self_select(121, len(rows)),
    ]
    return "".join(section for section in sections if section)


def render_treasure_hunter_page(sheet: dict[str, Any]) -> str:
    rows = sheet["grid"]["rows"]

    def render_progress_block(title_row: int, data_start: int, data_end: int) -> str:
        title = normalize_label(rows[title_row][0])
        author = str(rows[title_row][5] or "")
        return render_compact_table(title, author, slice_columns(rows[data_start:data_end], 0, 6))

    sections = [
        render_compact_table("累计挖宝奖励", "作者:甜甜", slice_columns(rows[2:10], 7, 16)),
        render_compact_table("秘宝猎人礼包", "甜甜", slice_columns(rows[2:7], 17, 25)),
        render_compact_table("未开火晶进度自选", "作者:甜甜", slice_columns(rows[2:5], 0, 5)),
        render_progress_block(5, 6, 9),
        render_progress_block(9, 10, 13),
        render_progress_block(13, 14, 17),
        render_progress_block(17, 18, 21),
        render_progress_block(21, 22, len(rows)),
    ]
    return "".join(section for section in sections if section)


def render_sheet_content(sheet: dict[str, Any]) -> str:
    if sheet["slug"] == "snowfield-adventure":
        return render_snowfield_page(sheet)
    if sheet["slug"] == "treasure-hunter":
        return render_treasure_hunter_page(sheet)
    return '<div class="table-wrap">' + render_grid_table(sheet["grid"]) + '</div>'


def write_sheet_page(sheet: dict[str, Any]) -> None:
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escape_html(sheet['name'])}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: "Microsoft YaHei", sans-serif; background: #fff; color: #18212f; padding: 12px; }}
    .sheet {{ display: grid; gap: 12px; }}
    .title {{ font-size: 28px; font-weight: 800; }}
    .subtitle-row {{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }}
    .subtitle-row h2 {{ font-size: 22px; font-weight: 800; }}
    .subtitle-row span {{ color:#6b7280; font-weight:700; }}
    .section-card {{ display:grid; gap:10px; }}
    .note-card {{ background:#89254d; color:#fff; border-radius:16px; padding:18px; }}
    .note-card .subtitle-row span {{ color:#fff; }}
    .note-body {{ white-space:pre-wrap; line-height:1.8; font-size:15px; }}
    .table-wrap {{ overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; }}
    td, th {{ border: 1px solid #111; padding: 8px 10px; text-align: center; vertical-align: middle; white-space: pre-wrap; }}
  </style>
  <link rel="stylesheet" href="/function/mobile-responsive.css" />
</head>
<body>
  <main class="sheet">
    <div class="title">{escape_html(sheet['name'])}</div>
    {render_sheet_content(sheet)}
  </main>
</body>
</html>
"""
    (PAGES_ROOT / f"{sheet['slug']}.html").write_text(html, encoding="utf-8")


def write_manifest(sheets: list[dict[str, Any]]) -> None:
    manifest = [{"name": sheet["name"], "slug": sheet["slug"], "path": sheet["path"]} for sheet in sheets]
    (DATA_ROOT / "sheets.js").write_text(
        "window.REFERENCE_HUB_SHEETS = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def write_index_page(sheets: list[dict[str, Any]]) -> None:
    first_path = sheets[0]["path"] if sheets else ""
    nav_items = "\n".join(
        f'      <button class="nav-item{" active" if index == 0 else ""}" type="button" data-path="{sheet["path"]}">{escape_html(sheet["name"])}</button>'
        for index, sheet in enumerate(sheets)
    )
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>礼包参考总览</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: "Microsoft YaHei", sans-serif; min-height: 100vh; background: #edf3fb; color: #16324f; padding: 16px; }}
    .layout {{ max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; }}
    #sheetNav, .viewer {{ background: #fff; border: 1px solid #c6d8ef; border-radius: 18px; box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08); }}
    #sheetNav {{ padding: 14px; display: grid; gap: 10px; align-content: start; }}
    .nav-item {{ width: 100%; border: 1px solid #c6d8ef; background: #f8fbff; border-radius: 12px; padding: 10px 12px; text-align: left; cursor: pointer; font-weight: 700; }}
    .nav-item.active {{ background: #2f78b8; border-color: #2f78b8; color: #fff; }}
    .viewer {{ overflow: hidden; display: grid; grid-template-rows: auto 1fr; min-height: 85vh; }}
    #sheetHeader {{ padding: 14px 18px; border-bottom: 1px solid #d7e3f3; font-size: 20px; font-weight: 800; }}
    #sheetFrame {{ width: 100%; height: 100%; min-height: 78vh; border: 0; background: #fff; }}
    @media (max-width: 920px) {{
      .layout {{ grid-template-columns: 1fr; }}
      #sheetNav {{ display: flex; overflow-x: auto; }}
      .nav-item {{ min-width: 180px; }}
    }}
  </style>
  <link rel="stylesheet" href="/function/mobile-responsive.css" />
</head>
<body>
  <div class="layout">
    <aside id="sheetNav">
{nav_items}
    </aside>
    <main class="viewer">
      <div id="sheetHeader">{escape_html(sheets[0]["name"]) if sheets else ""}</div>
      <iframe id="sheetFrame" src="{first_path}" title="Workbook reference"></iframe>
    </main>
  </div>
  <script src="./data/sheets.js"></script>
  <script>
    const sheetFrame = document.getElementById("sheetFrame");
    const sheetHeader = document.getElementById("sheetHeader");
    function switchSheet(path, label, button) {{
      sheetFrame.src = path;
      sheetHeader.textContent = label;
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      if (button) button.classList.add("active");
    }}
    document.querySelectorAll(".nav-item").forEach((button) => {{
      button.addEventListener("click", () => switchSheet(button.dataset.path, button.textContent, button));
    }});
  </script>
</body>
</html>
"""
    (HUB_ROOT / "index.html").write_text(html, encoding="utf-8")


def escape_html(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def fallback_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.encode("utf-8").hex()).strip("-")


if __name__ == "__main__":
    main()
