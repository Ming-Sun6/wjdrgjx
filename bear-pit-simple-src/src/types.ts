// ===== 数据模型 =====

/** 联盟成员 */
export interface Member {
  id: string
  name: string
  /** 标记颜色（令牌底色） */
  color: string
  /** 文字色；不设则按底色明暗自动取深/浅 */
  textColor?: string
}

/** 可放置的元素种类 */
export type ElementKind = 'bear' | 'member' | 'flag' | 'mine'

/** 每种元素占用的网格边长（N 表示占 N×N 个格子） */
export const FOOTPRINT: Record<ElementKind, number> = {
  bear: 3,
  member: 2,
  flag: 1,
  mine: 2,
}

export const KIND_LABELS: Record<ElementKind, string> = {
  bear: '熊坑',
  member: '成员',
  flag: '旗帜',
  mine: '联盟矿',
}

/**
 * 一个元素在网格上的占位。
 * (row, col) 是占位区域的锚点 = 行列最小的那个格子。
 * 区域覆盖 row..row+size-1、col..col+size-1（size 由 kind 决定）。
 * 熊坑不存在 placements 里——它由网格派生、固定在正中，见 bearRegion()。
 */
export interface Placement {
  id: string
  kind: 'member' | 'flag' | 'mine'
  row: number
  col: number
  /** kind === 'member' 时关联的成员 */
  memberId?: string
  /** 旗帜编号 / 联盟矿文字，可选 */
  label?: string
  /** 底色（flag / mine 用；member 的底色在 Member.color） */
  fill?: string
  /** 文字色；不设则按底色明暗自动取深/浅 */
  textColor?: string
}

/** 网格配置（逻辑为正方形网格，渲染时整体旋转 45° 成菱形） */
export interface GridConfig {
  rows: number
  cols: number
  /** 单个菱形格子的外接框边长（像素） */
  cellSize: number
}

/** 一张完整的熊坑图布局（保存到文件的内容） */
export interface Layout {
  id: string
  name: string
  grid: GridConfig
  members: Member[]
  placements: Placement[]
  /** 熊坑配色与文字 */
  bearColor?: string
  bearLabel?: string
  /** 成员色板 */
  colors?: string[]
  /** 画布整体旋转角度，旧存档缺省按 45° 兼容 */
  rotation?: number
  updatedAt: number
}

export const DEFAULT_GRID: GridConfig = {
  rows: 12,
  cols: 12,
  cellSize: 48,
}

/** 预设令牌配色：莫兰迪浅色系（低饱和、浅灰调；文字颜色按底色明暗自动取深/浅） */
export const PRESET_COLORS = [
  '#D9C2BA', // 浅陶灰
  '#C9D1C0', // 浅鼠尾草
  '#C2D0D6', // 浅雾蓝
  '#E3D5B8', // 浅燕麦
  '#D2C7D6', // 浅藕荷
  '#E0C9BE', // 浅杏
  '#BFD3CC', // 浅薄荷灰
  '#D8CFC4', // 浅灰米
]

/** 熊坑默认配色与文字 */
export const DEFAULT_BEAR_COLOR = '#A6534D' // 莫兰蒂砖红
export const DEFAULT_BEAR_LABEL = '熊坑'

/** 旗帜默认底色（浅灰） */
export const DEFAULT_FLAG_FILL = '#e5e7eb'
/** 联盟矿默认文字 */
export const DEFAULT_MINE_LABEL = '矿'

// ===== 占位几何 / 校验（纯函数，供 store 与画布共用）=====

/** 唯一的熊坑：3×3，固定在网格正中；网格放不下时返回 null */
export function bearRegion(
  grid: GridConfig,
): { kind: 'bear'; row: number; col: number } | null {
  const size = FOOTPRINT.bear
  if (grid.rows < size || grid.cols < size) return null
  return {
    kind: 'bear',
    row: Math.round((grid.rows - size) / 2),
    col: Math.round((grid.cols - size) / 2),
  }
}

/** 元素 e 占用区域与 [row,col,size] 是否重叠（轴对齐区间相交） */
export function rangesOverlap(
  e: { kind: ElementKind; row: number; col: number },
  b: { row: number; col: number; size: number },
): boolean {
  const es = FOOTPRINT[e.kind]
  return (
    e.col < b.col + b.size &&
    b.col < e.col + es &&
    e.row < b.row + b.size &&
    b.row < e.row + es
  )
}

/** 锚点 (row,col) 放下 size×size 是否在网格内 */
export function inBounds(
  row: number,
  col: number,
  size: number,
  grid: GridConfig,
): boolean {
  return row >= 0 && col >= 0 && row + size <= grid.rows && col + size <= grid.cols
}
