const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const rootDir = path.join(__dirname, '..');
const workbookPath = path.join(rootDir, 'public', '参考', '专家数据表.xlsx');
const garethWorkbookPath = path.join(rootDir, 'public', '参考', '加雷斯.xlsx');
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
    hasExpertLevelData: true,
    statLabel,
    levels,
    relationMilestones: [...left.milestones, ...right.milestones].filter(item => item.relation),
    skills: readSkills(sheet, range)
  };
}

function requiredSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Missing required Gareth sheet: ${name}`);
  return sheet;
}

function requiredNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid numeric value for ${label}`);
  return number;
}

function readGareth(workbook) {
  const summaryRows = XLSX.utils.sheet_to_json(requiredSheet(workbook, '分技能汇总'), {
    header: 1,
    defval: null
  });
  const detailRows = XLSX.utils.sheet_to_json(requiredSheet(workbook, '技能经验与书明细'), {
    header: 1,
    defval: null
  });
  const summary = summaryRows.slice(1)
    .filter(row => row[0] === '技能' || row[0] === '天赋')
    .map(row => ({
      type: row[0] === '天赋' ? 'talent' : 'skill',
      name: cleanText(row[1]),
      maxLevel: requiredNumber(row[2], `${row[1]} max level`),
      totalXp: requiredNumber(row[3], `${row[1]} total XP`),
      totalBooks: requiredNumber(row[5], `${row[1]} total books`)
    }));
  const normalSummary = summary.filter(item => item.type === 'skill');
  const talentSummary = summary.filter(item => item.type === 'talent');
  if (normalSummary.length !== 4 || talentSummary.length !== 1) {
    throw new Error('Gareth workbook must contain exactly four skills and one talent');
  }

  const headers = detailRows[0] || [];
  const requirementCol = headers.indexOf('升级条件') >= 0 ? headers.indexOf('升级条件') : headers.indexOf('关系要求');
  const descriptionCol = headers.indexOf('技能效果');
  const skills = normalSummary.map(meta => {
    let cumulativeBooks = 0;
    const levels = detailRows.slice(1)
      .filter(row => cleanText(row[0]) === meta.name)
      .map(row => {
        const level = requiredNumber(row[1], `${meta.name} level`);
        const xp = requiredNumber(row[3], `${meta.name} Lv.${level} XP`);
        const books = requiredNumber(row[5], `${meta.name} Lv.${level} books`);
        cumulativeBooks += books;
        return {
          level,
          books,
          xp,
          requirement: requirementCol >= 0 ? cleanText(row[requirementCol]) : '',
          cumulativeBooks,
          description: descriptionCol >= 0 ? cleanText(row[descriptionCol]) : ''
        };
      });
    const actualLevels = levels.map(row => row.level);
    const expectedLevels = Array.from({ length: meta.maxLevel }, (_, index) => index + 1);
    if (JSON.stringify(actualLevels) !== JSON.stringify(expectedLevels)) {
      throw new Error(`${meta.name} levels must be unique and contiguous from 1 to ${meta.maxLevel}`);
    }
    const totalXp = levels.reduce((sum, row) => sum + row.xp, 0);
    const totalBooks = levels.reduce((sum, row) => sum + row.books, 0);
    if (totalXp !== meta.totalXp || totalBooks !== meta.totalBooks) {
      throw new Error(`${meta.name} detail totals do not match summary`);
    }
    return { name: meta.name, status: '已导入', type: 'skill', levels };
  });

  const talentRows = XLSX.utils.sheet_to_json(requiredSheet(workbook, '天赋明细'), {
    header: 1,
    defval: null
  }).slice(1);
  const talent = talentSummary[0];
  const talentLevels = talentRows.map(row => ({
    level: requiredNumber(row[1], `${talent.name} expert level`),
    relation: cleanText(row[2]),
    talentLevel: requiredNumber(row[3], `${talent.name} talent level`),
    description: cleanText(row[4])
  }));
  if (talentLevels.length !== talent.maxLevel) {
    throw new Error(`${talent.name} talent detail must contain ${talent.maxLevel} levels`);
  }
  skills.push({ name: talent.name, status: '已导入', type: 'talent', levels: talentLevels });

  const expertRows = XLSX.utils.sheet_to_json(requiredSheet(workbook, '专家等级与关系'), {
    header: 1,
    defval: null
  }).slice(1);
  const levels = expertRows.map(row => ({
    level: requiredNumber(row[0], '加雷斯 expert level'),
    favor: requiredNumber(row[1], `加雷斯 Lv.${row[0]} favor`),
    totalFavor: requiredNumber(row[2], `加雷斯 Lv.${row[0]} total favor`),
    stat: percentValue(requiredNumber(row[3], `加雷斯 Lv.${row[0]} stat`)),
    mark: null,
    relation: cleanText(row[4])
  }));
  if (levels.length !== 100 || levels.some((row, index) => row.level !== index + 1)) {
    throw new Error('加雷斯 expert levels must be contiguous from 1 to 100');
  }
  const computedLevels = addComputedTotals(levels);
  if (computedLevels.some(row => row.totalFavor !== row.computedTotalFavor)) {
    throw new Error('加雷斯 cumulative favor does not match per-level requirements');
  }
  const relationMilestones = expertRows
    .filter(row => row[5] != null || row[6] != null || cleanText(row[7]))
    .map(row => ({
      afterLevel: requiredNumber(row[0], '加雷斯 milestone level'),
      stat: percentValue(requiredNumber(row[5], `加雷斯 Lv.${row[0]} milestone stat`)),
      mark: requiredNumber(row[6], `加雷斯 Lv.${row[0]} mark`),
      relation: cleanText(row[7])
    }));
  if (relationMilestones.length !== 10) {
    throw new Error('加雷斯 must contain 10 relation milestones');
  }

  return {
    id: '加雷斯',
    name: '加雷斯',
    sheetName: '加雷斯',
    hasExpertLevelData: true,
    statLabel: '部队穿透力 部队生命力',
    levels: computedLevels,
    relationMilestones,
    skills
  };
}

function build() {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: false, cellDates: false });
  const garethWorkbook = XLSX.readFile(garethWorkbookPath, { cellFormula: false, cellDates: false });
  const data = {
    note: '技能名称和部分技能数据预留为待补充；可直接在本文件中继续完善。',
    experts: [...workbook.SheetNames.map(sheetName => readExpert(workbook, sheetName)), readGareth(garethWorkbook)]
  };

  const content = `/* Generated expert calculator data. */\n` +
    `(function(){\n` +
    `  window.ExpertCalculatorData = ${JSON.stringify(data, null, 2)};\n` +
    `})();\n`;

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}

build();
