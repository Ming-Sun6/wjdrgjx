const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const rootDir = path.join(__dirname, '..');
const workbookPath = path.join(rootDir, 'public', '参考', '专家数据表.xlsx');
const outputPath = path.join(rootDir, 'public', 'function', 'expert-calculator-data.js');

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function cleanName(value) {
  return cleanText(value).replace(/\s+/g, '');
}

function cellValue(sheet, col, row) {
  const cell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];
  return cell ? cell.v : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function readLevelBlock(sheet, startCol, startRow, endRow) {
  const levels = [];
  const milestones = [];
  let lastLevel = null;

  for (let row = startRow; row <= endRow; row += 1) {
    const levelValue = cellValue(sheet, startCol, row);
    if (typeof levelValue === 'number') {
      const level = levelValue;
      const favor = numberOrNull(cellValue(sheet, startCol + 1, row));
      const totalFavor = numberOrNull(cellValue(sheet, startCol + 2, row));
      const stat = percentValue(cellValue(sheet, startCol + 3, row));
      const mark = numberOrNull(cellValue(sheet, startCol + 4, row));
      const relation = cleanText(cellValue(sheet, startCol + 5, row));
      levels.push({ level, favor, totalFavor, stat, mark, relation });
      lastLevel = level;
      continue;
    }

    if (cleanText(levelValue) === '进阶') {
      milestones.push({
        afterLevel: lastLevel,
        stat: percentValue(cellValue(sheet, startCol + 3, row)),
        mark: numberOrNull(cellValue(sheet, startCol + 4, row)),
        relation: cleanText(cellValue(sheet, startCol + 5, row))
      });
    }
  }

  return { levels, milestones };
}

function addComputedTotals(levels) {
  let running = 0;
  return levels
    .sort((a, b) => a.level - b.level)
    .map(level => {
      running += level.favor || 0;
      return {
        ...level,
        computedTotalFavor: running,
        totalFavor: level.totalFavor || running
      };
    });
}

function readSkills(sheet, range) {
  const skills = [];
  let current = null;
  let pendingType = null;

  for (let row = 0; row <= range.e.r; row += 1) {
    const first = cleanText(cellValue(sheet, 13, row));
    const second = cleanText(cellValue(sheet, 14, row));
    const third = cleanText(cellValue(sheet, 15, row));
    const seventh = cleanText(cellValue(sheet, 19, row));
    const isNormalHeader = first === '名称' && (second === '技能等级' || second === '等级');
    const isTalentHeader = first === '名称' && third === '等级' && seventh === '技能';

    if (isNormalHeader) {
      current = null;
      pendingType = 'skill';
      continue;
    }

    if (isTalentHeader) {
      current = null;
      pendingType = 'talent';
      continue;
    }

    if (pendingType === 'talent') {
      const level = numberOrNull(cellValue(sheet, 15, row));
      if (!level) continue;
      const name = cleanText(cellValue(sheet, 13, row));
      if (name) {
        current = { name, status: '已导入', type: 'talent', levels: [] };
        skills.push(current);
      }
      if (!current) continue;
      current.levels.push({
        level,
        relation: cleanText(cellValue(sheet, 16, row)),
        talentLevel: numberOrNull(cellValue(sheet, 18, row)),
        description: cleanText(cellValue(sheet, 19, row))
      });
      continue;
    }

    if (pendingType !== 'skill') continue;

    const level = numberOrNull(cellValue(sheet, 14, row));
    if (!level) continue;
    const name = cleanText(cellValue(sheet, 13, row));
    if (name) {
      current = { name, status: '已导入', type: 'skill', levels: [] };
      skills.push(current);
    }
    if (!current) continue;
    current.levels.push({
      level,
      books: numberOrNull(cellValue(sheet, 15, row)) || 0,
      xp: numberOrNull(cellValue(sheet, 16, row)) || 0,
      requirement: cleanText(cellValue(sheet, 17, row)),
      cumulativeBooks: numberOrNull(cellValue(sheet, 18, row)),
      description: cleanText(cellValue(sheet, 19, row))
    });
  }

  return skills.filter(skill => skill.levels.length > 0);
}

function readExpert(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const left = readLevelBlock(sheet, 0, 2, range.e.r);
  const right = readLevelBlock(sheet, 6, 2, range.e.r);
  const levels = addComputedTotals([...left.levels, ...right.levels]);
  const statLabel = cleanText(cellValue(sheet, 3, 1));

  return {
    id: cleanName(sheetName),
    name: cleanName(sheetName),
    sheetName: cleanText(sheetName),
    statLabel,
    levels,
    relationMilestones: [...left.milestones, ...right.milestones].filter(item => item.relation),
    skills: readSkills(sheet, range)
  };
}

function build() {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: false, cellDates: false });
  const data = {
    source: 'public/参考/专家数据表.xlsx',
    note: '技能名称和部分技能数据预留为待补充；可直接在本文件中继续完善。',
    experts: workbook.SheetNames.map(sheetName => readExpert(workbook, sheetName))
  };

  const content = `/* Auto-generated from ${data.source}. Edit skill placeholders here when new data is available. */\n` +
    `(function(){\n` +
    `  window.ExpertCalculatorData = ${JSON.stringify(data, null, 2)};\n` +
    `})();\n`;

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}

build();
