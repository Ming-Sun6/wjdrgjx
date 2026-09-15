'use strict';

const EQUIPMENT_CSV = `
1,良好,1500,15,0,0,224400,0.0935,0,1250|2,良好1星,3800,40,0,0,306000,0.1275,0,3125|3,稀有,7000,70,0,0,408000,0.17,0,8750|4,稀有1星,9700,95,0,0,510000,0.2125,0,11250|5,稀有2星,0,0,45,0,612000,0.255,0,12500|6,稀有3星,0,0,50,0,714000,0.2975,0,12500|7,史诗,0,0,60,0,816000,0.34,0,13000|8,史诗1星,0,0,70,0,885360,0.3689,0,14000|9,史诗2星,6500,65,40,0,954720,0.3978,0,15000|10,史诗3星,8000,80,50,0,1024080,0.4267,0,16000|11,史诗T1,10000,95,60,0,1093440,0.4556,0,17000|12,史诗T1-1星,11000,110,70,0,1162800,0.4845,0,18000|13,史诗T1-2星,13000,130,85,0,1232160,0.5134,0,19000|14,史诗T1-3星,15000,160,100,0,1301520,0.5423,0,20000|15,传说,22000,220,40,0,1362720,0.5678,0,21000|16,传说1星,23000,230,40,0,1423920,0.5933,0,0|17,传说2星,25000,250,45,0,1485120,0.6188,0,0|18,传说3星,26000,260,45,0,1546320,0.6443,0,0|19,传说T1,28000,280,45,0,1607520,0.6698,0,0|20,传说T1-1星,30000,300,55,0,1668720,0.6953,0,0|21,传说T1-2星,32000,320,55,0,1729920,0.7208,0,0|22,传说T1-3星,35000,340,55,0,1791120,0.7463,0,0|23,传说T2,38000,360,55,0,1852320,0.7718,0,0|24,传说T2-1星,43000,430,75,0,1913520,0.7973,0,0|25,传说T2-2星,45000,460,80,0,1978800,0.8228,0,0|26,传说T2-3星,48000,500,85,0,2040000,0.85,0,0|27,神话,50000,530,85,10,2142000,0.8925,40,0|28,神话1星,52000,560,90,10,2244000,0.935,80,0|29,神話2星,54000,590,95,10,2346000,0.9775,120,0|30,神话3星,56000,620,100,10,2448000,1.02,160,0|31,神话T1,59000,670,110,15,2550000,1.0625,290,0|32,神话T1-1星,61000,700,115,15,2652000,1.105,330,0|33,神话T1-2星,63000,730,120,15,2754000,1.1475,370,0|34,神话T1-3星,65000,760,125,15,2856000,1.19,410,0|35,神话T2,68000,810,135,20,2958000,1.2325,540,0|36,神话T2-1星,70000,840,140,20,3060000,1.275,580,0|37,神话T2-2星,72000,870,145,20,3162000,1.3175,620,0|38,神话T2-3星,74000,900,150,20,3264000,1.36,660,0|39,神话T3,77000,950,160,25,3366000,1.4025,790,0|40,神话T3-1星,80000,990,165,25,3468000,1.445,830,0|41,神话T3-2星,83000,1030,170,25,3570000,1.4875,870,0|42,神话T3-3星,86000,1070,180,25,3672000,1.53,910,0|43,神话T3-3星1段,24000,300,50,8,3712000,1.547,1010,0|44,神话T3-3星2段,24000,300,50,8,3753000,1.564,1020,0|45,神话T3-3星3段,24000,300,50,8,3794000,1.581,1030,0|46,神话T3-3星4段,24000,300,50,8,3835000,1.598,1040,0|47,神话T4,24000,300,50,8,3876000,1.615,1050,0|48,神话T4-1段,28000,330,55,8,3916000,1.632,1060,0|49,神话T4-2段,28000,330,55,8,3957000,1.649,1070,0|50,神话T4-3段,28000,330,55,8,3998000,1.666,1080,0|51,神话T4-4段,28000,330,55,8,4039000,1.683,1090,0|52,神话T4-1星,28000,330,55,8,4080000,1.7,1100,0|53,神话T4-1星1段,32000,360,60,8,4120000,1.717,1110,0|54,神话T4-1星2段,32000,360,60,8,4161000,1.734,1120,0|55,神话T4-1星3段,32000,360,60,8,4202000,1.751,1130,0|56,神话T4-1星4段,32000,360,60,8,4243000,1.768,1140,0|57,神话T4-2星,32000,360,60,8,4284000,1.785,1150,0|58,神话T4-2星1段,36000,390,65,8,4324000,1.802,1160,0|59,神话T4-2星2段,36000,390,65,8,4365000,1.819,1170,0|60,神话T4-2星3段,36000,390,65,8,4406000,1.836,1180,0|61,神话T4-2星4段,36000,390,65,8,4447000,1.853,1190,0|62,神话T4-3星,36000,390,65,8,4488000,1.87,1200,0|63,神话T4-3星1段,40000,420,70,12,4528000,1.887,1300,0|64,神话T4-3星2段,40000,420,70,12,4569000,1.904,1310,0|65,神话T4-3星3段,40000,420,70,12,4610000,1.921,1320,0|66,神话T4-3星4段,40000,420,70,12,4651000,1.938,1330,0|67,神话T5,40000,420,70,12,4692000,1.955,1340,0|68,神话T5-1段,44000,450,75,12,4732000,1.972,1350,0|69,神话T5-2段,44000,450,75,12,4773000,1.989,1360,0|70,神话T5-3段,44000,450,75,12,4814000,2.006,1370,0|71,神话T5-4段,44000,450,75,12,4855000,2.023,1380,0|72,神话T5-1星,44000,450,75,12,4896000,2.04,1390,0|73,神话T5-1星1段,48000,480,80,12,4936000,2.057,1400,0|74,神话T5-1星2段,48000,480,80,12,4977000,2.074,1410,0|75,神话T5-1星3段,48000,480,80,12,5018000,2.091,1420,0|76,神话T5-1星4段,48000,480,80,12,5059000,2.108,1430,0|77,神话T5-2星,48000,480,80,12,5100000,2.125,1440,0|78,神话T5-2星1段,52000,510,85,12,5140000,2.142,1450,0|79,神话T5-2星2段,52000,510,85,12,5181000,2.159,1460,0|80,神话T5-2星3段,52000,510,85,12,5222000,2.176,1470,0|81,神话T5-2星4段,52000,510,85,12,5263000,2.193,1480,0|82,神话T5-3星,52000,510,85,12,5304000,2.21,1490,0|83,神话T5-3星1段,56000,540,90,16,5344000,2.227,1590,0|84,神话T5-3星2段,56000,540,90,16,5385000,2.244,1600,0|85,神话T5-3星3段,56000,540,90,16,5426000,2.261,1610,0|86,神话T5-3星4段,56000,540,90,16,5467000,2.278,1620,0|87,神话T6,60000,570,95,16,5508000,2.295,1630,0|88,神话T6-1段,60000,570,95,16,5548000,2.312,1640,0|89,神话T6-2段,60000,570,95,16,5589000,2.329,1650,0|90,神话T6-3段,60000,570,95,16,5630000,2.346,1660,0|91,神话T6-4段,60000,570,95,16,5671000,2.363,1670,0|92,神话T6-1星,60000,570,95,16,5712000,2.38,1680,0|93,神话T6-1星1段,64000,600,100,16,5752000,2.397,1690,0|94,神话T6-1星2段,64000,600,100,16,5793000,2.414,1700,0|95,神话T6-1星3段,64000,600,100,16,5834000,2.431,1710,0|96,神话T6-1星4段,64000,600,100,16,5875000,2.448,1720,0|97,神话T6-2星,64000,600,100,16,5916000,2.465,1730,0|98,神话T6-2星1段,68000,630,105,16,5956000,2.482,1740,0|99,神话T6-2星2段,68000,630,105,16,5997000,2.499,1750,0|100,神话T6-2星3段,68000,630,105,16,6038000,2.516,1760,0|101,神话T6-2星4段,68000,630,105,16,6079000,2.533,1770,0|102,神话T6-3星,68000,630,105,16,6120000,2.55,1780,0
`.trim();

const GEM_CSV = `
1,5,5,0,0.09,625|2,40,15,0,0.12,1250|3,60,40,0,0.16,3125|4,80,100,0,0.19,8750|5,100,200,0,0.25,11250|6,120,300,0,0.3,12500|7,140,400,0,0.35,12500|8,200,400,0,0.4,13000|9,300,400,0,0.45,14000|10,420,420,0,0.5,15000|11,560,420,0,0.55,16000|12,580,450,15,0.64,17000|13,580,450,30,0.73,18000|14,600,500,45,0.82,19000|15,600,500,70,0.91,20000|16,650,550,100,1,21000|17,85,70,15,1.01,23500,16级（1段）|18,85,70,15,1.02,26000,16级（2段）|19,85,70,15,1.03,28500,16级（3段）|20,85,70,15,1.04,31000,16级（4段）|21,85,70,15,1.05,33500,16级（5段）|22,85,70,15,1.06,36000,16级（6段）|23,85,70,15,1.07,38500,16级（7段）|24,85,70,15,1.08,41000,16级（8段）|25,85,70,15,1.09,43500,17级|26,100,90,20,1.1,46200,17级（1段）|27,150,130,20,1.11,48900,17级（2段）|28,150,130,20,1.12,51600,17级（3段）|29,150,130,20,1.13,54300,17级（4段）|30,150,130,20,1.14,57000,17级（5段）|31,150,130,20,1.15,59700,17级（6段）|32,150,130,20,1.16,62400,17级（7段）|33,150,130,20,1.17,65100,17级（8段）|34,150,130,20,1.18,67800,18级
`.trim();

const EQUIPMENT_MATERIALS = Object.freeze([
  { key: 'alloy', name: '强韧合金' },
  { key: 'polish', name: '抛光液' },
  { key: 'plan', name: '设计图纸' },
  { key: 'amber', name: '月光琥珀' }
]);

const GEM_MATERIALS = Object.freeze([
  { key: 'manual', name: '宝石手册' },
  { key: 'blueprint', name: '宝石图纸' },
  { key: 'codex', name: '宝石秘典' }
]);

const PUBLIC_ROUTE_PATHS = [
  '/api/lord-equipment-gem',
  '/api/lord-equipment',
  '/api/lord-gems',
  '/api/lord-equipment/calc',
  '/api/lord-gems/calc'
];

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseEquipmentRows(csv) {
  return String(csv || '')
    .split('|')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const x = row.split(',');
      return {
        seq: toNumber(x[0]),
        name: String(x[1] || '').trim(),
        alloy: toNumber(x[2]),
        polish: toNumber(x[3]),
        plan: toNumber(x[4]),
        amber: toNumber(x[5]),
        power: toNumber(x[6]),
        attr: toNumber(x[7]),
        march: toNumber(x[8]),
        score: toNumber(x[9])
      };
    });
}

function parseGemRows(csv) {
  return String(csv || '')
    .split('|')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const x = row.split(',');
      const lv = toNumber(x[0]);
      return {
        lv,
        label: String(x[6] || '').trim() || `Lv.${lv}`,
        manual: toNumber(x[1]),
        blueprint: toNumber(x[2]),
        codex: toNumber(x[3]),
        attr: toNumber(x[4]),
        score: toNumber(x[5])
      };
    });
}

const EQUIPMENT = Object.freeze(parseEquipmentRows(EQUIPMENT_CSV).map((row) => Object.freeze(row)));
const GEMS = Object.freeze(parseGemRows(GEM_CSV).map((row) => Object.freeze(row)));

function normalizeStageName(name) {
  return String(name || '').trim().replace(/話/g, '话');
}

function firstPresent(source, keys) {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] != null && source[key] !== '') return source[key];
  }
  return undefined;
}

function findEquipment(ref) {
  if (ref == null || ref === '') return null;
  const asNum = Number(ref);
  if (Number.isInteger(asNum) && asNum > 0) {
    return EQUIPMENT.find((row) => row.seq === asNum) || null;
  }
  const name = String(ref).trim();
  const exact = EQUIPMENT.find((row) => row.name === name);
  if (exact) return exact;
  const normalized = normalizeStageName(name);
  return EQUIPMENT.find((row) => normalizeStageName(row.name) === normalized) || null;
}

function findGem(ref) {
  if (ref == null || ref === '') return null;
  const asNum = Number(ref);
  if (Number.isInteger(asNum) && asNum > 0) {
    return GEMS.find((row) => row.lv === asNum) || null;
  }
  const label = String(ref).trim();
  return GEMS.find((row) => row.label === label) || null;
}

function parsePieces(raw) {
  if (raw == null || raw === '') return 1;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 1) return { error: 'BAD_PIECES' };
  return Math.min(99, Math.round(num));
}

function sumEquipmentCost(fromSeq, toSeq) {
  const cost = { alloy: 0, polish: 0, plan: 0, amber: 0 };
  if (toSeq <= fromSeq) return cost;
  for (const row of EQUIPMENT) {
    if (row.seq > fromSeq && row.seq <= toSeq) {
      cost.alloy += row.alloy;
      cost.polish += row.polish;
      cost.plan += row.plan;
      cost.amber += row.amber;
    }
  }
  return cost;
}

function sumGemCost(fromLv, toLv) {
  const cost = { manual: 0, blueprint: 0, codex: 0 };
  if (toLv <= fromLv) return cost;
  for (const row of GEMS) {
    if (row.lv > fromLv && row.lv <= toLv) {
      cost.manual += row.manual;
      cost.blueprint += row.blueprint;
      cost.codex += row.codex;
    }
  }
  return cost;
}

function scaleCost(cost, pieces) {
  const scaled = {};
  for (const [key, value] of Object.entries(cost)) scaled[key] = value * pieces;
  return scaled;
}

function calculateEquipment(input) {
  const src = input || {};
  const from = findEquipment(firstPresent(src, ['from', 'fromSeq', 'fromName']));
  const to = findEquipment(firstPresent(src, ['to', 'toSeq', 'toName']));
  const piecesOrError = parsePieces(src.pieces);
  if (piecesOrError && piecesOrError.error) return piecesOrError;
  if (!from) return { error: 'BAD_FROM' };
  if (!to) return { error: 'BAD_TO' };
  const pieces = piecesOrError;
  const cost = scaleCost(sumEquipmentCost(from.seq, to.seq), pieces);
  return {
    from,
    to,
    pieces,
    cost,
    delta: {
      attr: to.attr - from.attr,
      power: to.power - from.power,
      march: to.march - from.march,
      score: to.score - from.score
    }
  };
}

function calculateGems(input) {
  const src = input || {};
  const from = findGem(firstPresent(src, ['from', 'fromLv', 'fromLabel']));
  const to = findGem(firstPresent(src, ['to', 'toLv', 'toLabel']));
  const piecesOrError = parsePieces(src.pieces);
  if (piecesOrError && piecesOrError.error) return piecesOrError;
  if (!from) return { error: 'BAD_FROM' };
  if (!to) return { error: 'BAD_TO' };
  const pieces = piecesOrError;
  const cost = scaleCost(sumGemCost(from.lv, to.lv), pieces);
  return {
    from,
    to,
    pieces,
    cost,
    delta: {
      attr: to.attr - from.attr,
      score: to.score - from.score
    }
  };
}

function getCatalog() {
  return {
    equipment: EQUIPMENT,
    gems: GEMS,
    materials: {
      equipment: EQUIPMENT_MATERIALS,
      gems: GEM_MATERIALS
    }
  };
}

function applyPublicApiHeaders(res) {
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function requestPayload(req) {
  if (req.method === 'GET') return req.query || {};
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function mountLordEquipmentGemRoutes(app) {
  app.options(PUBLIC_ROUTE_PATHS, (_req, res) => {
    applyPublicApiHeaders(res);
    return res.status(204).end();
  });

  app.get('/api/lord-equipment-gem', (_req, res) => {
    applyPublicApiHeaders(res);
    return res.json(getCatalog());
  });

  app.get('/api/lord-equipment', (_req, res) => {
    applyPublicApiHeaders(res);
    return res.json({ equipment: EQUIPMENT, materials: EQUIPMENT_MATERIALS });
  });

  app.get('/api/lord-gems', (_req, res) => {
    applyPublicApiHeaders(res);
    return res.json({ gems: GEMS, materials: GEM_MATERIALS });
  });

  function sendCalc(res, result) {
    applyPublicApiHeaders(res);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  }

  app.get('/api/lord-equipment/calc', (req, res) => sendCalc(res, calculateEquipment(requestPayload(req))));
  app.post('/api/lord-equipment/calc', (req, res) => sendCalc(res, calculateEquipment(requestPayload(req))));
  app.get('/api/lord-gems/calc', (req, res) => sendCalc(res, calculateGems(requestPayload(req))));
  app.post('/api/lord-gems/calc', (req, res) => sendCalc(res, calculateGems(requestPayload(req))));
}

module.exports = {
  EQUIPMENT,
  GEMS,
  EQUIPMENT_MATERIALS,
  GEM_MATERIALS,
  findEquipment,
  findGem,
  calculateEquipment,
  calculateGems,
  getCatalog,
  mountLordEquipmentGemRoutes
};
