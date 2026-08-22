import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  bearRegion,
  DEFAULT_BEAR_COLOR,
  DEFAULT_BEAR_LABEL,
  DEFAULT_GRID,
  DEFAULT_MINE_LABEL,
  FOOTPRINT,
  inBounds,
  PRESET_COLORS,
  rangesOverlap,
  type GridConfig,
  type Layout,
  type Member,
  type Placement,
} from './types'

const uid = () => Math.random().toString(36).slice(2, 10)

/** 撤销栈最多保留的检查点数 */
const HISTORY_LIMIT = 100

/** 一次可撤销的「文档快照」：只含会写进保存文件的内容，不含草稿/历史本身 */
interface DocSnapshot {
  name: string
  grid: GridConfig
  members: Member[]
  placements: Placement[]
  colors: string[]
  selectedColor: string
  bearColor: string
  bearLabel: string
  rotation: number
}

interface DesignerState {
  name: string
  grid: GridConfig
  members: Member[]
  placements: Placement[]
  /** 统一维护的成员颜色集 */
  colors: string[]
  /** 添加成员时使用的当前所选颜色 */
  selectedColor: string
  /** 熊坑配色与文字（可自定义） */
  bearColor: string
  bearLabel: string
  rotation: number

  /** 正在输入的新成员名称（用于图上幽灵预览；空串表示无草稿） */
  draftName: string
  /** 幽灵预览所在锚点；null 表示当前无可放置位置或无草稿 */
  draftAnchor: { row: number; col: number } | null
  /** 成员姓名输入框是否聚焦（聚焦即显示位置预览，不必等输入文字） */
  draftFocused: boolean

  // —— 布局元信息 ——
  setName: (name: string) => void
  setGrid: (patch: Partial<GridConfig>) => void
  setRotation: (rotation: number) => void

  // —— 熊坑 ——
  setBearColor: (c: string) => void
  setBearLabel: (t: string) => void

  // —— 颜色集 ——
  addColor: (c: string) => void
  removeColor: (c: string) => void
  setSelectedColor: (c: string) => void

  // —— 成员（添加即自动上图）——
  /** 新增成员：优先用草稿幽灵的位置，否则按顺时针找空位；放不下返回 null */
  addMember: (name: string) => Member | null
  /** 新增一面旗帜并自动摆到熊坑周围最近的空位；放不下返回 false */
  addFlag: () => boolean
  /** 新增一个联盟矿（2×2，落位规则与成员一致）；放不下返回 false */
  addMine: () => boolean
  /** 改成员昵称（图上直接编辑） */
  setMemberName: (id: string, name: string) => void
  /** 改成员底色（图上直接编辑；同步设为默认色并补进色板） */
  setMemberColor: (id: string, color: string) => void
  /** 改成员文字色（图上直接编辑） */
  setMemberTextColor: (id: string, color: string) => void
  /** 改旗帜/联盟矿底色 */
  setPlacementFill: (id: string, color: string) => void
  /** 改旗帜/联盟矿文字色 */
  setPlacementTextColor: (id: string, color: string) => void
  /** 改旗帜/联盟矿文字 */
  setPlacementLabel: (id: string, label: string) => void

  // —— 草稿幽灵预览 ——
  /** 设置正在输入的名称；非空时自动计算/保留一个默认顺时针落位 */
  setDraftName: (name: string) => void
  /** 拖动幽灵到新锚点（越界/重叠则忽略） */
  setDraftAnchor: (row: number, col: number) => void
  /** 输入框聚焦/失焦；聚焦即在图上显示位置预览 */
  setDraftFocused: (focused: boolean) => void

  // —— 放置 ——
  movePlacement: (id: string, row: number, col: number) => boolean
  /** 删除占位；若是成员则同时删除该成员 */
  removePlacement: (id: string) => void
  clearPlacements: () => void

  // —— 整体 ——
  newLayout: () => void
  loadLayout: (layout: Layout) => void
  exportLayout: () => Layout

  // —— 撤销 / 重做 ——
  /** 撤销栈（历史检查点，旧→新） */
  past: DocSnapshot[]
  /** 重做栈 */
  future: DocSnapshot[]
  /** 上次编辑的标记，用于把连续的同字段文本编辑合并成一次撤销 */
  lastEditTag: string | null
  undo: () => void
  redo: () => void
}

/** 取当前文档快照（用于压栈） */
function docOf(s: DesignerState): DocSnapshot {
  return {
    name: s.name,
    grid: s.grid,
    members: s.members,
    placements: s.placements,
    colors: s.colors,
    selectedColor: s.selectedColor,
    bearColor: s.bearColor,
    bearLabel: s.bearLabel,
    rotation: s.rotation,
  }
}

/**
 * 生成「记录一次撤销检查点」要并入 set 的字段。
 * tag 用于合并连续的同字段文本编辑：本次 tag 与上次相同时（如连打字改同一昵称）
 * 不再新增检查点，于是一次撤销整体回到开始编辑前，而不是一个字一个字退。
 * 结构性操作传 null（每次都记独立检查点）。任何记录都会清空重做栈。
 */
function recordPast(
  s: DesignerState,
  tag: string | null = null,
): Pick<DesignerState, 'past' | 'future' | 'lastEditTag'> {
  if (tag && s.lastEditTag === tag) {
    return { past: s.past, future: s.future, lastEditTag: tag }
  }
  return {
    past: [...s.past, docOf(s)].slice(-HISTORY_LIMIT),
    future: [],
    lastEditTag: tag,
  }
}

/** 锚点占位是否合法：在界内、不压熊坑、不与其它占位重叠 */
function isFree(
  row: number,
  col: number,
  size: number,
  grid: GridConfig,
  others: Placement[],
): boolean {
  if (!inBounds(row, col, size, grid)) return false
  const bear = bearRegion(grid)
  if (bear && rangesOverlap(bear, { row, col, size })) return false
  return !others.some((o) => rangesOverlap(o, { row, col, size }))
}

/** 找一个能放下 size×size 的空位，按离熊坑中心由近到远，没有则 null */
function findFreeAnchor(
  size: number,
  grid: GridConfig,
  placements: Placement[],
): { row: number; col: number } | null {
  const bear = bearRegion(grid)
  const br = bear ? bear.row + 1 : (grid.rows - 1) / 2
  const bc = bear ? bear.col + 1 : (grid.cols - 1) / 2
  let best: { row: number; col: number; d: number } | null = null
  for (let row = 0; row <= grid.rows - size; row++) {
    for (let col = 0; col <= grid.cols - size; col++) {
      if (!isFree(row, col, size, grid, placements)) continue
      const cr = row + (size - 1) / 2
      const cc = col + (size - 1) / 2
      const d = (cr - br) ** 2 + (cc - bc) ** 2
      if (!best || d < best.d) best = { row, col, d }
    }
  }
  return best ? { row: best.row, col: best.col } : null
}

/** 顺时针角度（正上方=0，顺时针递增），用作确定性兜底排序 */
function cwAngle(dx: number, dy: number): number {
  let a = Math.atan2(dx, -dy)
  if (a < 0) a += Math.PI * 2
  return a
}

/** 两个轴对齐方块是否相交 */
function boxesOverlap(
  a: { row: number; col: number; size: number },
  b: { row: number; col: number; size: number },
): boolean {
  return (
    a.col < b.col + b.size &&
    b.col < a.col + a.size &&
    a.row < b.row + b.size &&
    b.row < a.row + a.size
  )
}

/**
 * 两个轴对齐方块的「共边相邻」长度：不重叠、有一条边贴着时返回共享边的格数（1 或 2），
 * 否则返回 0。用于区分「整条边完全重合(2)」与「转角只贴一格(1)」。
 */
function edgeOverlap(
  a: { row: number; col: number; size: number },
  b: { row: number; col: number; size: number },
): number {
  const rowsShare = Math.min(a.row + a.size, b.row + b.size) - Math.max(a.row, b.row)
  const colsShare = Math.min(a.col + a.size, b.col + b.size) - Math.max(a.col, b.col)
  if ((a.col + a.size === b.col || b.col + b.size === a.col) && rowsShare > 0)
    return rowsShare // 左右贴边，共享竖向 rowsShare 格
  if ((a.row + a.size === b.row || b.row + b.size === a.row) && colsShare > 0)
    return colsShare // 上下贴边，共享横向 colsShare 格
  return 0
}

/** 从角 a 顺时针转到角 b 的夹角，落在 [0, 2π) */
function cwDelta(a: number, b: number): number {
  return ((b - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
}

/** 取某种元素「最近添加」的那一个的占位方块（用作 packAnchor 的「上一个」基准）；没有则 null */
function lastBoxOfKind(
  placements: Placement[],
  kind: Placement['kind'],
): { row: number; col: number; size: number } | null {
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i]
    if (p.kind === kind)
      return { row: p.row, col: p.col, size: FOOTPRINT[kind] }
  }
  return null
}

/**
 * 挑默认落位：**严格顺时针绕熊坑、一个挨一个地长出去**（成员与联盟矿共用）。
 *
 * 以传入的「上一个同类元素」lastBox 为基准，沿顺时针方向找紧挨它的下一格，优先级：
 *  1. 顺时针方向、与上一个整条侧边完全重合（共享 2 格）—— 直行段优先。
 *  2. 其次顺时针方向、侧边只重合 1 格 —— 转角处。
 *  3. 该方向被其他元素占据时，等效地把占据者当作「上一个」继续往前 —— 这里用
 *     「顺时针前方、且紧贴整团边缘的空位」来实现跳过，保证不回退、始终贴着团块。
 * 都用「只取顺时针前方(cwDelta∈(0,π])」来杜绝往回跳；同档内按「离熊坑越近→重合越多
 * →顺时针步子越小」排序，于是先把贴熊坑的内圈顺时针填满，再贴着往外圈绕。
 * 首个（lastBox 为 null）从正上方 12 点起、贴着熊坑。
 */
function packAnchor(
  size: number,
  grid: GridConfig,
  placements: Placement[],
  lastBox: { row: number; col: number; size: number } | null,
): { row: number; col: number } | null {
  const bear = bearRegion(grid)
  const bcx = bear ? bear.col + 1 : (grid.cols - 1) / 2
  const bcy = bear ? bear.row + 1 : (grid.rows - 1) / 2

  // 已占据的方块（熊坑 + 所有占位）——判断「紧贴整团」用
  const occupied: { row: number; col: number; size: number }[] = []
  if (bear) occupied.push({ row: bear.row, col: bear.col, size: FOOTPRINT.bear })
  for (const p of placements)
    occupied.push({ row: p.row, col: p.col, size: FOOTPRINT[p.kind] })

  const lastAng = lastBox
    ? cwAngle(lastBox.col + (size - 1) / 2 - bcx, lastBox.row + (size - 1) / 2 - bcy)
    : 0

  type Cand = {
    row: number
    col: number
    ring: number
    ang: number
    adj: number // 与上一个成员的共边格数（0/1/2）
    fwd: boolean // 是否在上一个成员的顺时针前方
    delta: number // 相对上一个成员的顺时针前进角
    touch: boolean // 是否紧贴整团边缘
  }
  const all: Cand[] = []
  for (let row = 0; row <= grid.rows - size; row++) {
    for (let col = 0; col <= grid.cols - size; col++) {
      if (!isFree(row, col, size, grid, placements)) continue
      const dx = col + (size - 1) / 2 - bcx
      const dy = row + (size - 1) / 2 - bcy
      const ring = Math.max(Math.abs(dx), Math.abs(dy)) // 同心方环，由内向外
      const ang = cwAngle(dx, dy)
      const box = { row, col, size }
      const adj = lastBox ? edgeOverlap(box, lastBox) : 0
      const delta = lastBox ? cwDelta(lastAng, ang) : 0
      const fwd = lastBox ? delta > 1e-6 && delta <= Math.PI : true
      const grown = { row: row - 1, col: col - 1, size: size + 2 }
      const touch = occupied.some((o) => boxesOverlap(grown, o))
      all.push({ row, col, ring, ang, adj, fwd, delta, touch })
    }
  }
  if (!all.length) return null

  if (lastBox) {
    // 顺时针前方、挨着上一个成员 → 顺时针前方、紧贴整团（跳过被占处）→ 兜底
    let pool = all.filter((c) => c.adj > 0 && c.fwd)
    if (!pool.length) pool = all.filter((c) => c.touch && c.fwd)
    if (!pool.length) pool = all.filter((c) => c.touch)
    if (!pool.length) pool = all
    // 越贴熊坑(ring 小) → 整条边重合(adj 大) → 顺时针步子小(delta 小) → 角度兜底
    pool.sort(
      (a, b) =>
        a.ring - b.ring || b.adj - a.adj || a.delta - b.delta || a.ang - b.ang,
    )
    return { row: pool[0].row, col: pool[0].col }
  }

  // 首个成员：贴熊坑、从 12 点开始顺时针
  let pool = all.filter((c) => c.touch)
  if (!pool.length) pool = all
  pool.sort((a, b) => a.ring - b.ring || a.ang - b.ang)
  return { row: pool[0].row, col: pool[0].col }
}

export const useDesigner = create<DesignerState>()(
  persist(
    (set, get) => ({
      name: '新建熊坑图',
      grid: DEFAULT_GRID,
      members: [],
      placements: [],
      colors: [...PRESET_COLORS],
      selectedColor: PRESET_COLORS[0],
      bearColor: DEFAULT_BEAR_COLOR,
      bearLabel: DEFAULT_BEAR_LABEL,
      rotation: 45,
      draftName: '',
      draftAnchor: null,
      draftFocused: false,
      past: [],
      future: [],
      lastEditTag: null,

      setName: (name) => set((s) => ({ ...recordPast(s, 'name'), name })),
      setRotation: (rotation) =>
        set((s) => ({ ...recordPast(s, 'rotation'), rotation: Math.max(0, Math.min(360, Number(rotation) || 0)) })),

      setGrid: (patch) =>
        set((s) => {
          const grid = { ...s.grid, ...patch }
          const oldBear = bearRegion(s.grid)
          const newBear = bearRegion(grid)
          // 熊坑始终居中：增减行列时按熊坑中心的位移量整体平移已有占位，
          // 使每个元素相对熊坑的位置不变 —— 等效于「在外围增删行列」。
          const dr = oldBear && newBear ? newBear.row - oldBear.row : 0
          const dc = oldBear && newBear ? newBear.col - oldBear.col : 0
          const placements = s.placements
            .map((p) => ({ ...p, row: p.row + dr, col: p.col + dc }))
            .filter((p) => {
              const size = FOOTPRINT[p.kind]
              if (!inBounds(p.row, p.col, size, grid)) return false
              if (newBear && rangesOverlap(newBear, { row: p.row, col: p.col, size }))
                return false
              return true
            })
          // 掉出网格的成员占位，对应成员也清掉
          const keptMemberIds = new Set(
            placements.filter((p) => p.memberId).map((p) => p.memberId),
          )
          const members = s.members.filter((m) => keptMemberIds.has(m.id))
          // 网格变了，草稿幽灵重新按新网格找默认落位
          const draftAnchor = s.draftName.trim()
            ? packAnchor(FOOTPRINT.member, grid, placements, lastBoxOfKind(placements, 'member'))
            : null
          return { ...recordPast(s), grid, placements, members, draftAnchor }
        }),

      setBearColor: (c) =>
        set((s) => ({ ...recordPast(s, 'bearColor'), bearColor: c })),
      setBearLabel: (t) =>
        set((s) => ({ ...recordPast(s, 'bearLabel'), bearLabel: t })),

      addColor: (c) =>
        set((s) => ({
          ...recordPast(s),
          colors: s.colors.includes(c) ? s.colors : [...s.colors, c],
          selectedColor: c,
        })),

      removeColor: (c) =>
        set((s) => {
          if (s.colors.length <= 1) return s
          const colors = s.colors.filter((x) => x !== c)
          return {
            ...recordPast(s),
            colors,
            selectedColor: s.selectedColor === c ? colors[0] : s.selectedColor,
          }
        }),

      setSelectedColor: (c) => set({ selectedColor: c }),

      addMember: (name) => {
        const s = get()
        const size = FOOTPRINT.member
        // 优先用草稿幽灵当前所在位置（用户可能拖动调整过），否则按紧贴团块算法找空位
        const anchor =
          s.draftAnchor &&
          isFree(s.draftAnchor.row, s.draftAnchor.col, size, s.grid, s.placements)
            ? s.draftAnchor
            : packAnchor(size, s.grid, s.placements, lastBoxOfKind(s.placements, 'member'))
        if (!anchor) return null
        const member: Member = { id: uid(), name, color: s.selectedColor }
        const placement: Placement = {
          id: uid(),
          kind: 'member',
          row: anchor.row,
          col: anchor.col,
          memberId: member.id,
        }
        const placements = [...s.placements, placement]
        const members = [...s.members, member]
        set({
          ...recordPast(s),
          members,
          placements,
          draftName: '',
          // 输入框仍聚焦（连续回车加人）时，给下一个成员预备好幽灵预览，
          // 并以刚加入的成员为「上一个」，使下一个紧挨着它
          draftAnchor: s.draftFocused
            ? packAnchor(size, s.grid, placements, lastBoxOfKind(placements, 'member'))
            : null,
        })
        return member
      },

      setMemberName: (id, name) =>
        set((s) => ({
          ...recordPast(s, `mname:${id}`),
          members: s.members.map((m) => (m.id === id ? { ...m, name } : m)),
        })),

      setMemberColor: (id, color) =>
        set((s) => ({
          ...recordPast(s, `mcolor:${id}`),
          members: s.members.map((m) => (m.id === id ? { ...m, color } : m)),
          // 同步：把此色设为新增成员的默认色；色板里没有则补进去
          colors: s.colors.includes(color) ? s.colors : [...s.colors, color],
          selectedColor: color,
        })),

      setMemberTextColor: (id, color) =>
        set((s) => ({
          ...recordPast(s, `mtext:${id}`),
          members: s.members.map((m) => (m.id === id ? { ...m, textColor: color } : m)),
          colors: s.colors.includes(color) ? s.colors : [...s.colors, color],
        })),

      setPlacementFill: (id, color) =>
        set((s) => ({
          ...recordPast(s, `pfill:${id}`),
          placements: s.placements.map((p) => (p.id === id ? { ...p, fill: color } : p)),
          colors: s.colors.includes(color) ? s.colors : [...s.colors, color],
          selectedColor: color,
        })),

      setPlacementTextColor: (id, color) =>
        set((s) => ({
          ...recordPast(s, `ptext:${id}`),
          placements: s.placements.map((p) => (p.id === id ? { ...p, textColor: color } : p)),
          colors: s.colors.includes(color) ? s.colors : [...s.colors, color],
        })),

      setPlacementLabel: (id, label) =>
        set((s) => ({
          ...recordPast(s, `plabel:${id}`),
          placements: s.placements.map((p) => (p.id === id ? { ...p, label } : p)),
        })),

      setDraftName: (name) =>
        set((s) => {
          const size = FOOTPRINT.member
          // 没文字、且输入框也没聚焦时才清掉预览；聚焦时即使空名也保留预览
          if (!name.trim() && !s.draftFocused)
            return { draftName: name, draftAnchor: null }
          // 已有锚点仍可用就保留（不打断用户的手动拖动），否则取默认紧贴落位
          const anchor =
            s.draftAnchor &&
            isFree(s.draftAnchor.row, s.draftAnchor.col, size, s.grid, s.placements)
              ? s.draftAnchor
              : packAnchor(size, s.grid, s.placements, lastBoxOfKind(s.placements, 'member'))
          return { draftName: name, draftAnchor: anchor }
        }),

      setDraftAnchor: (row, col) =>
        set((s) => {
          if (!isFree(row, col, FOOTPRINT.member, s.grid, s.placements)) return s
          return { draftAnchor: { row, col } }
        }),

      setDraftFocused: (focused) =>
        set((s) => {
          if (focused) {
            // 聚焦即显示预览：没有合法锚点就算一个默认落位
            const size = FOOTPRINT.member
            const anchor =
              s.draftAnchor &&
              isFree(s.draftAnchor.row, s.draftAnchor.col, size, s.grid, s.placements)
                ? s.draftAnchor
                : packAnchor(size, s.grid, s.placements, lastBoxOfKind(s.placements, 'member'))
            return { draftFocused: true, draftAnchor: anchor }
          }
          // 失焦：没输入任何文字就收起预览
          if (!s.draftName.trim()) return { draftFocused: false, draftAnchor: null }
          return { draftFocused: false }
        }),

      addFlag: () => {
        const s = get()
        const size = FOOTPRINT.flag
        const anchor = findFreeAnchor(size, s.grid, s.placements)
        if (!anchor) return false
        set({
          ...recordPast(s),
          placements: [
            ...s.placements,
            { id: uid(), kind: 'flag', row: anchor.row, col: anchor.col },
          ],
        })
        return true
      },

      addMine: () => {
        const s = get()
        const size = FOOTPRINT.mine
        // 落位规则与成员一致：顺时针紧挨上一个联盟矿
        const anchor = packAnchor(
          size,
          s.grid,
          s.placements,
          lastBoxOfKind(s.placements, 'mine'),
        )
        if (!anchor) return false
        set({
          ...recordPast(s),
          placements: [
            ...s.placements,
            {
              id: uid(),
              kind: 'mine',
              row: anchor.row,
              col: anchor.col,
              fill: s.selectedColor,
              label: DEFAULT_MINE_LABEL,
            },
          ],
        })
        return true
      },

      movePlacement: (id, row, col) => {
        const s = get()
        const self = s.placements.find((x) => x.id === id)
        if (!self) return false
        const size = FOOTPRINT[self.kind]
        const others = s.placements.filter((x) => x.id !== id)
        if (!isFree(row, col, size, s.grid, others)) return false
        set({
          ...recordPast(s),
          placements: s.placements.map((x) =>
            x.id === id ? { ...x, row, col } : x,
          ),
        })
        return true
      },

      removePlacement: (id) =>
        set((s) => {
          const pl = s.placements.find((x) => x.id === id)
          if (!pl) return s
          return {
            ...recordPast(s),
            placements: s.placements.filter((x) => x.id !== id),
            members: pl.memberId
              ? s.members.filter((m) => m.id !== pl.memberId)
              : s.members,
          }
        }),

      clearPlacements: () =>
        set((s) => ({
          ...recordPast(s),
          placements: [],
          members: [],
          draftName: '',
          draftAnchor: null,
        })),

      newLayout: () =>
        set((s) => ({
          ...recordPast(s),
          name: '新建熊坑图',
          grid: DEFAULT_GRID,
          members: [],
          placements: [],
          bearColor: DEFAULT_BEAR_COLOR,
          bearLabel: DEFAULT_BEAR_LABEL,
          rotation: 45,
          draftName: '',
          draftAnchor: null,
        })),

      loadLayout: (layout) =>
        set((s) => ({
          ...recordPast(s),
          name: layout.name,
          grid: layout.grid,
          members: layout.members,
          placements: layout.placements,
          bearColor: layout.bearColor ?? s.bearColor,
          bearLabel: layout.bearLabel ?? s.bearLabel,
          rotation: Number.isFinite(layout.rotation) ? Math.max(0, Math.min(360, Number(layout.rotation))) : 45,
          colors: layout.colors?.length ? layout.colors : s.colors,
          selectedColor: layout.colors?.length
            ? layout.colors[0]
            : s.selectedColor,
          draftName: '',
          draftAnchor: null,
        })),

      exportLayout: (): Layout => {
        const s = get()
        return {
          id: uid(),
          name: s.name,
          grid: s.grid,
          members: s.members,
          placements: s.placements,
          bearColor: s.bearColor,
          bearLabel: s.bearLabel,
          rotation: s.rotation,
          colors: s.colors,
          updatedAt: Date.now(),
        }
      },

      undo: () =>
        set((s) => {
          if (!s.past.length) return s
          const prev = s.past[s.past.length - 1]
          // 恢复后草稿幽灵按恢复出的网格/占位重算（保持预览一致）
          const draftAnchor =
            s.draftFocused || s.draftName.trim()
              ? packAnchor(FOOTPRINT.member, prev.grid, prev.placements, lastBoxOfKind(prev.placements, 'member'))
              : null
          return {
            ...prev,
            past: s.past.slice(0, -1),
            future: [docOf(s), ...s.future].slice(0, HISTORY_LIMIT),
            lastEditTag: null,
            draftAnchor,
          }
        }),

      redo: () =>
        set((s) => {
          if (!s.future.length) return s
          const next = s.future[0]
          const draftAnchor =
            s.draftFocused || s.draftName.trim()
              ? packAnchor(FOOTPRINT.member, next.grid, next.placements, lastBoxOfKind(next.placements, 'member'))
              : null
          return {
            ...next,
            past: [...s.past, docOf(s)].slice(-HISTORY_LIMIT),
            future: s.future.slice(1),
            lastEditTag: null,
            draftAnchor,
          }
        }),
    }),
    {
      name: 'wjdr-bear-pit-current-v5',
      // 草稿幽灵是临时态，不写入本地存储（避免刷新后残留半截预览）
      partialize: (s) => ({
        name: s.name,
        grid: s.grid,
        members: s.members,
        placements: s.placements,
        colors: s.colors,
        selectedColor: s.selectedColor,
        bearColor: s.bearColor,
        bearLabel: s.bearLabel,
        rotation: s.rotation,
      }),
    },
  ),
)
