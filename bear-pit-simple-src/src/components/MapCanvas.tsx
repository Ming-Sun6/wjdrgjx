import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Stage, Layer, Rect, Line, Group, Text, Circle, Ellipse } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useDesigner } from '../store'
import { bearRegion, DEFAULT_FLAG_FILL, FOOTPRINT, type Placement } from '../types'

interface Props {
  stageRef: React.RefObject<Konva.Stage>
}

const PAD = 12
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 按底色明暗自动选深/浅文字色，保证可读（浅色底用深字，深色底用白字） */
function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 150 ? '#33312e' : '#ffffff'
}

/** 成员字号基准：保证常见成员名称能完整放进令牌（不足/超出都按此字号渲染） */
const REF_NAME = '成员名称示例'

/**
 * 成员令牌文字排版：字号固定，不再按名字长短自适应。
 * 字号 = 让基准名 REF_NAME 在 1~4 行内取到的「能落在菱形里的最大字号」，
 * 所有成员统一使用；该字号随格子大小(half)线性缩放，任意格子尺寸下基准名都放得下。
 * 约束：以中心对齐的文字块需满足 块半宽 + 块半高 ≤ R（四角落在 |x|+|y|≤R 内）。
 * 返回固定字号，以及当前 label 在该字号下的文字框宽高（用于居中与换行）。
 */
function memberFit(label: string, half: number) {
  const margin = 5
  const cw = 1.0 // 单字宽 ≈ 字号（CJK）；拉丁字偏窄，估算偏保守不会溢出
  const lh = 1.12
  const R = Math.max(8, half - margin)
  // 固定字号：基准名在 1~4 行里能取到的最大可放字号
  let fs = 0
  for (let lines = 1; lines <= 4; lines++) {
    const perLine = Math.ceil(REF_NAME.length / lines)
    const cand = (2 * R) / (perLine * cw + lines * lh)
    if (cand > fs) fs = cand
  }
  const fontSize = Math.max(8, Math.floor(fs))
  // 当前名字在该固定字号下挑行数：优先少行，放不下再加行（上限 4 行；超长允许略溢出）
  const len = Math.max(1, label.length)
  let perLine = Math.ceil(len / 4)
  let lines = 4
  for (let ln = 1; ln <= 4; ln++) {
    const pl = Math.ceil(len / ln)
    if ((pl * fontSize * cw) / 2 + (ln * fontSize * lh) / 2 <= R) {
      perLine = pl
      lines = ln
      break
    }
  }
  const width = Math.ceil(perLine * fontSize * cw) + 1
  const height = Math.ceil(lines * fontSize * lh)
  return { fontSize, width, height }
}

/** 45° 菱形网格站位画布 */
export default function MapCanvas({ stageRef }: Props) {
  const grid = useDesigner((s) => s.grid)
  const members = useDesigner((s) => s.members)
  const placements = useDesigner((s) => s.placements)
  const bearColor = useDesigner((s) => s.bearColor)
  const bearLabel = useDesigner((s) => s.bearLabel)
  const rotation = useDesigner((s) => s.rotation)
  const colors = useDesigner((s) => s.colors)
  const selectedColor = useDesigner((s) => s.selectedColor)
  const draftName = useDesigner((s) => s.draftName)
  const draftAnchor = useDesigner((s) => s.draftAnchor)
  const draftFocused = useDesigner((s) => s.draftFocused)
  const movePlacement = useDesigner((s) => s.movePlacement)
  const removePlacement = useDesigner((s) => s.removePlacement)
  const setDraftAnchor = useDesigner((s) => s.setDraftAnchor)
  const setMemberName = useDesigner((s) => s.setMemberName)
  const setMemberColor = useDesigner((s) => s.setMemberColor)
  const setMemberTextColor = useDesigner((s) => s.setMemberTextColor)
  const setPlacementFill = useDesigner((s) => s.setPlacementFill)
  const setPlacementTextColor = useDesigner((s) => s.setPlacementTextColor)
  const setPlacementLabel = useDesigner((s) => s.setPlacementLabel)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // 图上直接编辑元素：记录正在编辑的占位 id 及浮层屏幕坐标（fixed 定位）
  const [editing, setEditing] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const stage = stageRef.current
    const scroll = stage?.container()?.parentElement
    const area = scroll?.parentElement
    if (!area) return
    const update = () => setAreaSize({ width: area.clientWidth, height: area.clientHeight })
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(area)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [stageRef])

  const { rows, cols, cellSize } = grid
  const fitCellSize = areaSize.width > 0 && areaSize.height > 0
    ? Math.floor(Math.min((areaSize.width - PAD * 2) * 2 / (rows + cols), (areaSize.height - PAD * 2) * 2 / (rows + cols)))
    : cellSize
  const renderCellSize = areaSize.width > 0 && areaSize.width < 700
    ? Math.max(28, Math.min(cellSize, fitCellSize))
    : Math.min(120, Math.max(cellSize, fitCellSize))
  const hw = renderCellSize / 2 // 菱形半宽 = 半高（与水平线呈 45°）

  const baseStageW = (rows + cols) * hw + PAD * 2
  const baseStageH = (rows + cols) * hw + PAD * 2
  const rotationDelta = rotation - 45
  const rotationRad = (rotationDelta * Math.PI) / 180
  const stageW = Math.ceil(Math.abs(baseStageW * Math.cos(rotationRad)) + Math.abs(baseStageH * Math.sin(rotationRad)))
  const stageH = Math.ceil(Math.abs(baseStageW * Math.sin(rotationRad)) + Math.abs(baseStageH * Math.cos(rotationRad)))
  const originX = PAD + rows * hw
  const originY = PAD + hw

  /** 逻辑格 (col,row) 中心 → 屏幕坐标 */
  const g2s = (col: number, row: number) => ({
    x: originX + (col - row) * hw,
    y: originY + (col + row) * hw,
  })

  /** 屏幕坐标 → 逻辑格（浮点） */
  const s2g = (x: number, y: number) => {
    const u = (x - originX) / hw
    const v = (y - originY) / hw
    return { col: (u + v) / 2, row: (v - u) / 2 }
  }

  /** 占位锚点 (row,col) + 边长 size → 区域中心屏幕坐标 */
  const footprintCenter = (row: number, col: number, size: number) =>
    g2s(col + (size - 1) / 2, row + (size - 1) / 2)

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  )

  const bear = bearRegion(grid)

  const anchorFromScreen = (x: number, y: number, size: number) => {
    const { col, row } = s2g(x, y)
    const ac = clamp(Math.round(col - (size - 1) / 2), 0, cols - size)
    const ar = clamp(Math.round(row - (size - 1) / 2), 0, rows - size)
    return { row: ar, col: ac }
  }

  const handleDragEnd =
    (pl: Placement) => (e: KonvaEventObject<DragEvent>) => {
      const node = e.target
      const size = FOOTPRINT[pl.kind]
      const { row, col } = anchorFromScreen(node.x(), node.y(), size)
      const ok = movePlacement(pl.id, row, col)
      const a = ok ? { row, col } : { row: pl.row, col: pl.col }
      const c = footprintCenter(a.row, a.col, size)
      node.position({ x: c.x, y: c.y }) // 同步节点，失败则回弹
    }

  /** 单击元素令牌 → 在其上方弹出文字/底色/文字色编辑浮层 */
  const openEditor = (pl: Placement) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.container().getBoundingClientRect()
    const c = footprintCenter(pl.row, pl.col, FOOTPRINT[pl.kind])
    const a = (rotationDelta * Math.PI) / 180
    const dx = c.x - baseStageW / 2
    const dy = c.y - baseStageH / 2
    const rotated = {
      x: stageW / 2 + dx * Math.cos(a) - dy * Math.sin(a),
      y: stageH / 2 + dx * Math.sin(a) + dy * Math.cos(a),
    }
    // 容器若被 CSS 缩放，按比例换算（正常 1:1）
    const sx = stageW ? rect.width / stageW : 1
    const sy = stageH ? rect.height / stageH : 1
    setEditing({
      id: pl.id,
      x: rect.left + rotated.x * sx,
      y: rect.top + rotated.y * sy,
    })
  }

  /** 拖动草稿幽灵 → 落到合法空位（非法则回弹） */
  const handleGhostDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target
    const size = FOOTPRINT.member
    const { row, col } = anchorFromScreen(node.x(), node.y(), size)
    setDraftAnchor(row, col)
    const a = useDesigner.getState().draftAnchor ?? { row: 0, col: 0 }
    const c = footprintCenter(a.row, a.col, size)
    node.position({ x: c.x, y: c.y })
  }

  /** 悬停时出现在元素右上角的删除角标 */
  const deleteBadge = (pl: Placement, half: number) => (
    <Group
      x={half * 0.5}
      y={-half * 0.5}
      onMouseDown={(e) => {
        e.cancelBubble = true // 别触发拖拽
      }}
      onClick={(e) => {
        e.cancelBubble = true
        removePlacement(pl.id)
      }}
      onTap={(e) => {
        e.cancelBubble = true
        removePlacement(pl.id)
      }}
    >
      <Circle
        radius={9}
        fill="#ef4444"
        stroke="#ffffff"
        strokeWidth={1.5}
        shadowColor="#000000"
        shadowOpacity={0.3}
        shadowBlur={3}
      />
      <Text
        x={-9}
        y={-7}
        width={18}
        align="center"
        text="×"
        fontSize={14}
        fontStyle="bold"
        fill="#ffffff"
        listening={false}
      />
    </Group>
  )

  // 正在编辑的占位及其（成员才有的）成员记录，并归一化出 文字/底色/文字色 与对应写入函数
  const editingPl = editing ? placements.find((p) => p.id === editing.id) : undefined
  const editingMember = editingPl?.memberId
    ? memberMap.get(editingPl.memberId)
    : undefined
  const editTarget =
    editing && editingPl
      ? (() => {
          const isMember = editingPl.kind === 'member'
          const mid = editingPl.memberId
          const fill =
            (isMember ? editingMember?.color : editingPl.fill) ?? DEFAULT_FLAG_FILL
          const text = (isMember ? editingMember?.textColor : editingPl.textColor) ?? ''
          return {
            kind: editingPl.kind,
            label: isMember ? editingMember?.name ?? '' : editingPl.label ?? '',
            fill,
            text, // 空串表示「自动（按底色取深/浅）」
            // 文字（成员=昵称、矿=矿名；旗帜无文字编辑）
            setLabel: (v: string) =>
              isMember && mid
                ? setMemberName(mid, v)
                : setPlacementLabel(editingPl.id, v),
            setFill: (c: string) =>
              isMember && mid
                ? setMemberColor(mid, c)
                : setPlacementFill(editingPl.id, c),
            setText: (c: string) =>
              isMember && mid
                ? setMemberTextColor(mid, c)
                : setPlacementTextColor(editingPl.id, c),
          }
        })()
      : undefined

  return (
    <>
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        className="canvas-stage"
      >
        {/* ===== 静态层：背景 + 网格 + 熊坑。listening=false，拖动时不参与重绘，
            这是 Edge 拖动卡顿的主要修复点（原先所有内容同层，每帧重绘全部图形）。 ===== */}
        <Layer listening={false} x={stageW / 2} y={stageH / 2} offsetX={baseStageW / 2} offsetY={baseStageH / 2} rotation={rotationDelta}>
          {/* 白底：导出 PNG 不透明 */}
          <Rect x={0} y={0} width={baseStageW} height={baseStageH} fill="#ffffff" />

          {/* 菱形网格线（两族 45° 斜线） */}
          {Array.from({ length: cols + 1 }, (_, i) => {
            const a = g2s(i - 0.5, -0.5)
            const b = g2s(i - 0.5, rows - 0.5)
            return (
              <Line
                key={`c${i}`}
                points={[a.x, a.y, b.x, b.y]}
                stroke="#d4d4d8"
                strokeWidth={1}
              />
            )
          })}
          {Array.from({ length: rows + 1 }, (_, j) => {
            const a = g2s(-0.5, j - 0.5)
            const b = g2s(cols - 0.5, j - 0.5)
            return (
              <Line
                key={`r${j}`}
                points={[a.x, a.y, b.x, b.y]}
                stroke="#d4d4d8"
                strokeWidth={1}
              />
            )
          })}

          {/* 熊坑：固定正中、唯一、不可交互 */}
          {bear &&
            (() => {
              const c = footprintCenter(bear.row, bear.col, FOOTPRINT.bear)
              const half = (FOOTPRINT.bear * cellSize) / 2
              const s = cellSize * 0.8 // 熊头整体缩放（<1 即比格子略小）
              const fg = contrastText(bearColor) // 熊头剪影色（随底色取深/浅）
              const hy = -s * 0.18 // 头中心，略偏上给文字让位
              return (
                <Group x={c.x} y={c.y}>
                  <Line
                    closed
                    points={[0, -half, half, 0, 0, half, -half, 0]}
                    fill={bearColor}
                    opacity={0.92}
                    stroke="#0f172a55"
                    strokeWidth={1}
                    shadowColor="#000000"
                    shadowOpacity={0.18}
                    shadowBlur={5}
                    shadowOffsetY={2}
                  />
                  {/* 矢量熊头 */}
                  <Circle x={-s * 0.45} y={hy - s * 0.48} radius={s * 0.26} fill={fg} />
                  <Circle x={s * 0.45} y={hy - s * 0.48} radius={s * 0.26} fill={fg} />
                  <Circle x={-s * 0.45} y={hy - s * 0.48} radius={s * 0.12} fill={bearColor} opacity={0.45} />
                  <Circle x={s * 0.45} y={hy - s * 0.48} radius={s * 0.12} fill={bearColor} opacity={0.45} />
                  <Circle x={0} y={hy} radius={s * 0.6} fill={fg} />
                  {/* 口鼻部 */}
                  <Ellipse x={0} y={hy + s * 0.26} radiusX={s * 0.32} radiusY={s * 0.24} fill={bearColor} opacity={0.28} />
                  {/* 眼睛 */}
                  <Circle x={-s * 0.23} y={hy - s * 0.08} radius={s * 0.075} fill={bearColor} />
                  <Circle x={s * 0.23} y={hy - s * 0.08} radius={s * 0.075} fill={bearColor} />
                  {/* 鼻子 */}
                  <Ellipse x={0} y={hy + s * 0.2} radiusX={s * 0.12} radiusY={s * 0.085} fill={bearColor} />
                  {bearLabel && (
                    <Text
                      x={-half}
                      y={hy + s * 0.62}
                      width={half * 2}
                      align="center"
                      text={bearLabel}
                      fontSize={16}
                      fontStyle="bold"
                      fill={fg}
                    />
                  )}
                </Group>
              )
            })()}
        </Layer>

        {/* ===== 动态层：成员 / 旗帜 / 草稿幽灵 / 水印。拖动只重绘本层。 ===== */}
        <Layer x={stageW / 2} y={stageH / 2} offsetX={baseStageW / 2} offsetY={baseStageH / 2} rotation={rotationDelta}>
          {placements.map((pl) => {
            const size = FOOTPRINT[pl.kind]
            const c = footprintCenter(pl.row, pl.col, size)
            const half = (size * cellSize) / 2

            if (pl.kind === 'flag') {
              // 旗帜：底色可改；其上叠矢量小旗。单击改底色，拖动换位，悬停 × 删除
              const fill = pl.fill ?? DEFAULT_FLAG_FILL
              const s = cellSize
              const flagW = s * 0.3
              const flagH = s * 0.22
              const poleH = s * 0.52
              const poleX = -flagW / 2
              const poleTop = -poleH / 2
              const poleW = Math.max(2, s * 0.05)
              return (
                <Group
                  key={pl.id}
                  x={c.x}
                  y={c.y}
                  draggable
                  onDragEnd={handleDragEnd(pl)}
                  onClick={() => openEditor(pl)}
                  onTap={() => openEditor(pl)}
                  onMouseEnter={() => setHoveredId(pl.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Line
                    closed
                    points={[0, -half, half, 0, 0, half, -half, 0]}
                    fill={fill}
                    opacity={0.95}
                    stroke="#0f172a55"
                    strokeWidth={1}
                    shadowColor="#000000"
                    shadowOpacity={0.18}
                    shadowBlur={4}
                    shadowOffsetY={2}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {/* 旗杆 */}
                  <Line
                    points={[poleX, poleTop, poleX, poleTop + poleH]}
                    stroke="#5b5b5b"
                    strokeWidth={poleW}
                    lineCap="round"
                    listening={false}
                  />
                  {/* 三角旗 */}
                  <Line
                    closed
                    points={[
                      poleX,
                      poleTop,
                      poleX + flagW,
                      poleTop + flagH / 2,
                      poleX,
                      poleTop + flagH,
                    ]}
                    fill="#cf5a5a"
                    stroke="#cf5a5a"
                    strokeWidth={1}
                    lineJoin="round"
                    listening={false}
                  />
                  {hoveredId === pl.id && deleteBadge(pl, half)}
                </Group>
              )
            }

            // 成员 / 联盟矿：2×2 菱形 + 居中文字。单击改字/改色，拖动换位，悬停 × 删除
            const isMember = pl.kind === 'member'
            const m = isMember ? memberMap.get(pl.memberId!) : undefined
            const label = isMember ? m?.name ?? '（已删除）' : pl.label ?? ''
            const fill = (isMember ? m?.color : pl.fill) ?? '#94a3b8'
            const textColor =
              (isMember ? m?.textColor : pl.textColor) ?? contrastText(fill)
            const fit = memberFit(label, half)
            return (
              <Group
                key={pl.id}
                x={c.x}
                y={c.y}
                draggable
                onDragEnd={handleDragEnd(pl)}
                onClick={() => openEditor(pl)}
                onTap={() => openEditor(pl)}
                onMouseEnter={() => setHoveredId(pl.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Line
                  closed
                  points={[0, -half, half, 0, 0, half, -half, 0]}
                  fill={fill}
                  opacity={0.92}
                  stroke="#0f172a55"
                  strokeWidth={1}
                  shadowColor="#000000"
                  shadowOpacity={0.18}
                  shadowBlur={5}
                  shadowOffsetY={2}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                />
                {/* 联盟矿：内嵌一圈细菱形边框，与成员区分 */}
                {!isMember && (
                  <Line
                    closed
                    points={[0, -half * 0.78, half * 0.78, 0, 0, half * 0.78, -half * 0.78, 0]}
                    stroke={textColor}
                    strokeWidth={1.5}
                    opacity={0.5}
                    listening={false}
                  />
                )}
                <Text
                  x={-fit.width / 2}
                  y={-fit.height / 2}
                  width={fit.width}
                  height={fit.height}
                  align="center"
                  verticalAlign="middle"
                  wrap="char"
                  lineHeight={1.12}
                  text={label}
                  fontSize={fit.fontSize}
                  fontStyle="bold"
                  fill={textColor}
                  listening={false}
                />
                {hoveredId === pl.id && deleteBadge(pl, half)}
              </Group>
            )
          })}

          {/* 草稿幽灵：输入框聚焦即预览落点（空名时为空令牌），可拖动调整 */}
          {(draftFocused || draftName.trim()) &&
            draftAnchor &&
            (() => {
              const size = FOOTPRINT.member
              const c = footprintCenter(draftAnchor.row, draftAnchor.col, size)
              const half = (size * cellSize) / 2
              const label = draftName.trim()
              const fit = memberFit(label, half)
              return (
                <Group
                  x={c.x}
                  y={c.y}
                  opacity={0.6}
                  draggable
                  onDragEnd={handleGhostDragEnd}
                >
                  <Line
                    closed
                    points={[0, -half, half, 0, 0, half, -half, 0]}
                    fill={selectedColor}
                    stroke="#1d4ed8"
                    strokeWidth={2}
                    dash={[6, 4]}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  <Text
                    x={-fit.width / 2}
                    y={-fit.height / 2}
                    width={fit.width}
                    height={fit.height}
                    align="center"
                    verticalAlign="middle"
                    wrap="char"
                    lineHeight={1.12}
                    text={label}
                    fontSize={fit.fontSize}
                    fontStyle="bold"
                    fill={contrastText(selectedColor)}
                    listening={false}
                  />
                </Group>
              )
            })()}

          {/* 水印（最上层，随 PNG 一起导出） */}
          <Text
            x={0}
            y={baseStageH - 34}
            width={baseStageW - 6}
            align="right"
            lineHeight={1.35}
            text=""
            fontSize={11}
            fill="#475569"
            listening={false}
          />
        </Layer>
      </Stage>

      {/* 元素编辑浮层（DOM 覆盖在画布上方）：文字 + 底色 + 文字色 */}
      {editing &&
        editTarget &&
        createPortal(
          <div className="te-backdrop" onMouseDown={() => setEditing(null)}>
            <div
              className="token-editor"
              style={{ left: editing.x, top: editing.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {editTarget.kind !== 'flag' && (
                <input
                  className="te-name"
                  autoFocus
                  value={editTarget.label}
                  placeholder={
                    editTarget.kind === 'member' ? '成员昵称' : '联盟矿文字'
                  }
                  onChange={(e) => editTarget.setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                />
              )}

              <div className="te-row">
                <span className="te-rowlabel">底色</span>
                <div className="te-swatches">
                  {colors.map((c) => (
                    <button
                      key={c}
                      className={`te-swatch${c === editTarget.fill ? ' sel' : ''}`}
                      style={{ background: c }}
                      title="设为底色"
                      onClick={() => editTarget.setFill(c)}
                    />
                  ))}
                  <label className="te-swatch add" title="自定义底色">
                    ＋
                    <input
                      type="color"
                      onChange={(e) => editTarget.setFill(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {editTarget.kind !== 'flag' && (
                <div className="te-row">
                  <span className="te-rowlabel">文字</span>
                  <div className="te-swatches">
                    <button
                      className={`te-swatch te-auto${
                        editTarget.text === '' ? ' sel' : ''
                      }`}
                      title="自动（按底色取深/浅）"
                      onClick={() => editTarget.setText('')}
                    >
                      自
                    </button>
                    {colors.map((c) => (
                      <button
                        key={c}
                        className={`te-swatch${
                          c === editTarget.text ? ' sel' : ''
                        }`}
                        style={{ background: c }}
                        title="设为文字色"
                        onClick={() => editTarget.setText(c)}
                      />
                    ))}
                    <label className="te-swatch add" title="自定义文字色">
                      ＋
                      <input
                        type="color"
                        onChange={(e) => editTarget.setText(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
