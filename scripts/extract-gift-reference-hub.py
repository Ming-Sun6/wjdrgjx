from __future__ import annotations

import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FILE = REPO_ROOT / "public" / "function" / "Zero" / "gift-reference-hub.data.js"
IMAGE_ROOT = REPO_ROOT / "public" / "Scores" / "reference-hub"
EXCLUDED_SHEETS = {"目录", "特惠礼包合集", "常规礼包合集", "Sheet1", "WpsReserved_CellImgList"}
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
CATEGORY_MAP = {
    "秘宝猎人": "活动",
    "逐光之旅": "活动",
    "雪原大冒险": "活动",
    "喀莎许愿屋": "商铺",
    "节日活动道具礼包": "礼包",
    "宴席活动+加餐礼包": "礼包",
    "海岛皮肤礼包": "礼包",
    "银霜商铺": "商铺",
    "霜龙行军和宴席": "节日",
    "龙裔商旅": "商铺",
    "万象杂货铺": "商铺",
    "2025元宵礼包": "节日",
    "2025情人节商铺": "商铺",
    "遗失的珍宝": "活动",
    "钓鱼套装": "活动",
    "冰封的宝藏": "活动",
    "除雪礼包": "礼包",
    "弹窗礼包": "礼包",
    "周卡": "礼包",
}
DISPIMG_RE = re.compile(r'DISPIMG\("([^"]+)"(?:,\d+)?\)')
SECTION_KEYWORDS = (
    "价格",
    "商铺",
    "礼包",
    "套装",
    "宝藏",
    "冒险",
    "小铺",
    "兑换",
    "宴席",
    "商旅",
    "行军",
    "月卡",
    "周卡",
    "珍宝",
    "进度自选",
)


def main() -> None:
    workbook_path = find_workbook_path()
    shutil.rmtree(IMAGE_ROOT, ignore_errors=True)
    IMAGE_ROOT.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(workbook_path) as workbook_zip:
        shared_strings = load_shared_strings(workbook_zip)
        cell_images = load_cell_image_map(workbook_zip)
        sheets = extract_sheets(workbook_zip, shared_strings, cell_images)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(build_js_assignment("window.GIFT_REFERENCE_HUB_DATA", sheets), encoding="utf-8")


def find_workbook_path() -> Path:
    local_matches = sorted(
        p for p in REPO_ROOT.joinpath("public").rglob("*3.0.xlsx")
        if not p.name.startswith("~$")
    )
    if local_matches:
        return local_matches[0]

    for worktree_path in list_worktree_paths():
        if worktree_path == REPO_ROOT:
            continue
        matches = sorted(
            p for p in worktree_path.joinpath("public").rglob("*3.0.xlsx")
            if not p.name.startswith("~$")
        )
        if matches:
            return matches[0]

    raise FileNotFoundError("Unable to locate 无尽冬日数据攻略3.0.xlsx in current repo or sibling worktrees")


def list_worktree_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    paths: list[Path] = []
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            paths.append(Path(line[len("worktree ") :].strip()))
    return paths


def load_shared_strings(workbook_zip: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook_zip.namelist():
        return []

    root = ET.fromstring(workbook_zip.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("main:si", NS):
        values.append("".join(node.text or "" for node in item.findall(".//main:t", NS)))
    return values


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


def extract_sheets(
    workbook_zip: zipfile.ZipFile,
    shared_strings: list[str],
    cell_images: dict[str, str],
) -> list[dict]:
    workbook_root = ET.fromstring(workbook_zip.read("xl/workbook.xml"))
    rel_root = ET.fromstring(workbook_zip.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("package:Relationship", NS)
    }

    sheets: list[dict] = []
    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib.get("name", "")
        if name in EXCLUDED_SHEETS:
            continue

        relation_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", "")
        target = rel_map.get(relation_id)
        if not target:
            continue

        sheet_root = ET.fromstring(workbook_zip.read("xl/" + target.lstrip("/")))
        row_data, image_refs = extract_sheet_rows(workbook_zip, sheet_root, shared_strings, cell_images, name)
        merge_refs = extract_merge_refs(sheet_root)
        sheet_grid = extract_sheet_grid(workbook_zip, sheet_root, shared_strings, cell_images, name)
        sheets.append(
            {
                "name": name,
                "slug": SLUGS.get(name, fallback_slug(name)),
                "category": CATEGORY_MAP.get(name, "活动"),
                "summary": build_summary(row_data),
                "sourceSheet": name,
                "stats": build_stats(row_data, image_refs),
                "sections": build_sections(name, row_data),
                "images": image_refs,
                "merges": merge_refs,
                "sheetGrid": sheet_grid,
                "fullDetail": {"sections": [{"type": "grid", "title": "原表摘录", "rows": row_data[:20]}], "merges": merge_refs},
            }
        )

    return sheets


def extract_sheet_rows(
    workbook_zip: zipfile.ZipFile,
    sheet_root: ET.Element,
    shared_strings: list[str],
    cell_images: dict[str, str],
    sheet_name: str,
) -> tuple[list[list[Any]], list[dict]]:
    rows: list[list[Any]] = []
    images: list[dict] = []
    copied: set[str] = set()

    for row in sheet_root.findall("main:sheetData/main:row", NS):
        row_values: list[Any] = []
        for cell in row.findall("main:c", NS):
            rendered, image_info = render_cell(workbook_zip, cell, shared_strings, cell_images, sheet_name)
            if rendered not in ("", None):
                row_values.append(rendered)
            if image_info and image_info["src"] not in copied:
                copied.add(image_info["src"])
                images.append(image_info)
        if row_values:
            rows.append(row_values)

    return rows, images


def extract_merge_refs(sheet_root: ET.Element) -> list[str]:
    merge_cells = sheet_root.find("main:mergeCells", NS)
    if merge_cells is None:
        return []
    return [merge.attrib["ref"] for merge in merge_cells.findall("main:mergeCell", NS)]


def extract_sheet_grid(
    workbook_zip: zipfile.ZipFile,
    sheet_root: ET.Element,
    shared_strings: list[str],
    cell_images: dict[str, str],
    sheet_name: str,
) -> dict[str, Any]:
    start_row, start_col, end_row, end_col = parse_dimension_ref(
        sheet_root.find("main:dimension", NS).attrib.get("ref", "A1:A1")
    )

    row_map: dict[int, dict[int, Any]] = {}
    for row in sheet_root.findall("main:sheetData/main:row", NS):
        row_index = int(row.attrib.get("r", "1")) - start_row
        cells: dict[int, Any] = {}
        for cell in row.findall("main:c", NS):
            cell_ref = cell.attrib.get("r", "")
            _, col_index = parse_cell_ref(cell_ref)
            rendered, _ = render_cell(workbook_zip, cell, shared_strings, cell_images, sheet_name)
            cells[col_index - start_col] = rendered if rendered not in ("", None) else ""
        row_map[row_index] = cells

    grid_rows: list[list[Any]] = []
    for row_offset in range(end_row - start_row + 1):
        row_cells = row_map.get(row_offset, {})
        grid_rows.append([row_cells.get(col_offset, "") for col_offset in range(end_col - start_col + 1)])

    return {
        "startRow": start_row,
        "startCol": start_col,
        "endRow": end_row,
        "endCol": end_col,
        "columnCount": end_col - start_col + 1,
        "rows": grid_rows,
        "merges": extract_merge_refs(sheet_root),
    }


def parse_dimension_ref(ref: str) -> tuple[int, int, int, int]:
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
        return 1, 1
    letters, row_text = match.groups()
    return int(row_text), column_letters_to_index(letters)


def column_letters_to_index(letters: str) -> int:
    result = 0
    for char in letters:
        result = result * 26 + (ord(char) - 64)
    return result


def render_cell(
    workbook_zip: zipfile.ZipFile,
    cell: ET.Element,
    shared_strings: list[str],
    cell_images: dict[str, str],
    sheet_name: str,
) -> tuple[Any, dict | None]:
    formula = cell.find("main:f", NS)
    if formula is not None and formula.text:
        match = DISPIMG_RE.search(formula.text)
        if match:
            image_id = match.group(1)
            image_info = copy_sheet_image(workbook_zip, sheet_name, image_id, cell_images)
            return image_info, image_info

    inline = cell.find("main:is", NS)
    if inline is not None:
        text = "".join(node.text or "" for node in inline.findall(".//main:t", NS)).strip()
        return text, None

    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        return "", None

    raw = value_node.text.strip()
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        index = int(raw)
        return shared_strings[index].strip(), None
    if cell_type == "b":
        return ("TRUE" if raw == "1" else "FALSE"), None
    return normalize_scalar(raw), None


def copy_sheet_image(
    workbook_zip: zipfile.ZipFile,
    sheet_name: str,
    image_id: str,
    cell_images: dict[str, str],
) -> dict | None:
    source_path = cell_images.get(image_id)
    if not source_path:
        return None

    suffix = Path(source_path).suffix or ".png"
    sheet_dir = IMAGE_ROOT / SLUGS.get(sheet_name, fallback_slug(sheet_name))
    sheet_dir.mkdir(parents=True, exist_ok=True)
    image_path = sheet_dir / f"{image_id.lower()}{suffix}"
    if not image_path.exists():
        image_path.write_bytes(workbook_zip.read(source_path))

    web_path = "/" + image_path.relative_to(REPO_ROOT / "public").as_posix()
    return {
        "type": "image",
        "title": f"{sheet_name} 图片",
        "src": web_path,
        "alt": f"{sheet_name} 图片 {image_id}",
    }


def normalize_scalar(value: str) -> str:
    if re.fullmatch(r"-?\d+\.0+", value):
        return value.split(".", 1)[0]
    return value


def build_summary(rows: list[list[Any]]) -> str:
    lines = []
    for row in rows[:3]:
        parts = [cell_text(cell) for cell in row[:4]]
        merged = " ".join(part for part in parts if part).strip()
        if merged:
            lines.append(merged)
    return " / ".join(line for line in lines if line) or "参考表内容总览"


def build_stats(rows: list[list[Any]], images: list[dict]) -> list[dict]:
    non_empty_rows = len(rows)
    richest_row = max((len(row) for row in rows), default=0)
    return [
        {"label": "有效行数", "value": str(non_empty_rows)},
        {"label": "最宽列数", "value": str(richest_row)},
        {"label": "截图数量", "value": str(len(images))},
    ]


def build_sections(sheet_name: str, rows: list[list[Any]]) -> list[dict]:
    if sheet_name == "秘宝猎人":
        return build_treasure_hunter_sections(rows)
    if sheet_name == "逐光之旅":
        return build_journey_of_light_sections(rows)
    if sheet_name == "雪原大冒险":
        return build_snowfield_adventure_sections(rows)
    if sheet_name == "喀莎许愿屋":
        return build_kasha_wish_house_sections(rows)

    sections: list[dict] = []
    current_title: str | None = None
    current_rows: list[list[Any]] = []

    for row in rows:
        title = detect_section_title(row)
        if title:
            if current_rows:
                sections.append({"type": "grid", "title": current_title or "内容速览", "rows": current_rows[:12]})
            current_title = title
            current_rows = [row]
            continue

        current_rows.append(row)

    if current_rows:
        sections.append({"type": "grid", "title": current_title or "内容速览", "rows": current_rows[:12]})

    return sections or [{"type": "grid", "title": "内容速览", "rows": rows[:12]}]


def build_treasure_hunter_sections(rows: list[list[Any]]) -> list[dict]:
    sections: list[dict] = []

    sections.append(
        {
            "type": "grid",
            "title": "累计挖宝奖励",
            "rows": [
                rows[2][5:14],
                rows[3][5:14],
                rows[4][5:14],
                rows[5][2:11],
                rows[6][6:15],
                rows[7][6:15],
                rows[8][6:15],
                rows[9][2:11],
            ],
        }
    )

    sections.append(
        {
            "type": "grid",
            "title": "秘宝猎人礼包",
            "rows": [
                rows[2][14:22],
                rows[3][14:22],
                rows[4][14:22],
                [rows[5][11], rows[5][12], rows[5][13], rows[5][14], rows[5][15], rows[5][16], "", ""],
                [rows[6][15], rows[6][16], rows[6][17], rows[6][18], rows[6][19], rows[6][20], rows[6][21]],
            ],
        }
    )

    progress_blocks = [
        ("未 开 火 晶 进 度 自 选", "作者:甜甜", rows[2][0:5], rows[3][0:5], rows[4][0:5]),
        ("火 晶 三 进 度 自 选", "作者:甜甜", rows[6][0:6], rows[7][0:6], rows[8][0:6]),
        ("火 晶 五 进 度 自 选", "作者:甜甜", rows[10][0:6], rows[11][0:6], rows[12][0:6]),
        ("战 争 学 院 进 度 自 选", "作者:甜甜", rows[14][0:6], rows[15][0:6], rows[16][0:6]),
        ("火 晶 八 进 度 自 选", "作者:甜甜", rows[18][0:6], rows[19][0:6], rows[20][0:6]),
        ("七 代 火 八 进 度 自 选", "作者:甜甜", rows[22][0:6], rows[23][0:6], rows[24][0:6]),
    ]

    for title, author, header, normal_row, treasure_row in progress_blocks:
        sections.append(
            {
                "type": "grid",
                "title": title,
                "meta": author,
                "rows": [header, normal_row, treasure_row],
            }
        )

    return sections


def build_journey_of_light_sections(rows: list[list[Any]]) -> list[dict]:
    return [
        {"type": "grid", "title": rows[1][1], "rows": [rows[2], rows[3], rows[4], rows[5], rows[6], rows[7]]},
        {"type": "grid", "title": rows[8][0], "rows": [rows[9], rows[10], rows[11], rows[12], rows[13], rows[14]]},
        {"type": "grid", "title": rows[15][0], "rows": [rows[16], rows[17], rows[18], rows[19], rows[20], rows[21]]},
    ]


def build_snowfield_adventure_sections(rows: list[list[Any]]) -> list[dict]:
    def block(title: str, start: int, end: int) -> dict:
      return {
          "type": "grid",
          "title": title,
          "rows": rows[start:end],
      }

    advice = ""
    if len(rows) > 3 and len(rows[3]) > 10 and isinstance(rows[3][10], str):
        advice = rows[3][10]

    return [
        {
            "type": "note",
            "title": "雪原大冒险活动建议",
            "meta": "作者:甜甜",
            "content": advice,
        },
        block("礼包购买获得", 2, 8),
        block("进度奖励", 9, 15),
        block("火 晶 十 进 度 自 选", 16, 40),
        block("火 晶 八 进 度 自 选", 41, 65),
        block("战 争 学 院 进 度 自 选", 66, 90),
        block("火 晶 五 进 度 自 选", 91, 115),
        block("火 晶 三 进 度 自 选", 116, 139),
    ]


def build_kasha_wish_house_sections(rows: list[list[Any]]) -> list[dict]:
    def block(title: str, section_rows: list[list[Any]], meta: str = "制作:甜甜") -> dict:
        return {
            "type": "grid",
            "title": title,
            "meta": meta,
            "rows": section_rows,
        }

    wish_house_rows = [
        block("喀莎的许愿屋（火晶八进度）", [rows[2][8:21], rows[3][7:20]]),
        block("喀莎的许愿屋（战争学院进度）", [rows[4][7:19], rows[5][7:19]]),
        block("喀莎的许愿屋（火晶五进度）", [rows[6][7:19], rows[7][7:19]]),
        block("喀莎的许愿屋（其他进度）", [rows[8][7:19], rows[9][7:19]]),
    ]

    return wish_house_rows + [
        block("喀莎小铺（火晶进度）", rows[2:16], "制作：甜甜"),
        block("心愿礼包（火晶进度）", rows[17:43], "制作:甜甜"),
        block("喀莎小铺（火晶前开赋能进度）", rows[44:57], "制作：甜甜"),
        block("心愿礼包（火晶前开赋能进度）", rows[58:84], "制作:甜甜"),
        block("喀莎小铺（火晶前未开赋能进度）", rows[85:97], "制作：甜甜"),
        block("心愿礼包（火晶前未开赋能进度）", rows[98:124], "制作:甜甜"),
    ]


def detect_section_title(row: list[Any]) -> str | None:
    if not row:
        return None

    first = next((cell_text(cell).strip() for cell in row if cell_text(cell).strip()), "")
    if not first or first == "目录" or first == "图片":
        return None
    if len(first) > 24:
        return None

    if any(keyword in first for keyword in SECTION_KEYWORDS):
        return first

    row_text = " ".join(cell_text(cell) for cell in row[1:] if cell_text(cell))
    if len(row) <= 4 and any(marker in row_text for marker in ("作者", "制作")):
        return first

    return None


def cell_text(cell: Any) -> str:
    if isinstance(cell, str):
        return cell
    if isinstance(cell, dict):
        if cell.get("type") == "image":
            return ""
        return str(cell.get("text", ""))
    return ""


def fallback_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.encode("utf-8").hex()).strip("-")


def build_js_assignment(variable_name: str, data: list[dict]) -> str:
    return f"{variable_name} = {to_js(data)};\n"


def to_js(value: Any, indent: int = 0) -> str:
    if isinstance(value, dict):
        pieces = []
        next_indent = indent + 2
        for key, item in value.items():
            pieces.append(" " * next_indent + f"{key}: {to_js(item, next_indent)}")
        return "{\n" + ",\n".join(pieces) + "\n" + " " * indent + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        next_indent = indent + 2
        pieces = [" " * next_indent + to_js(item, next_indent) for item in value]
        return "[\n" + ",\n".join(pieces) + "\n" + " " * indent + "]"
    return json.dumps(value, ensure_ascii=False)


if __name__ == "__main__":
    main()
