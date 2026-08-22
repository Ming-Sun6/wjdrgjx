import { useEffect, useState } from 'react'
import type Konva from 'konva'
import { useDesigner } from '../store'
import type { Layout } from '../types'

interface Props {
  stageRef: React.RefObject<Konva.Stage>
  loggedIn: boolean
  openAuthModal: () => void
}

export default function Toolbar({ stageRef, loggedIn, openAuthModal }: Props) {
  const name = useDesigner((s) => s.name)
  const grid = useDesigner((s) => s.grid)
  const rotation = useDesigner((s) => s.rotation)
  const setRotation = useDesigner((s) => s.setRotation)
  const setName = useDesigner((s) => s.setName)
  const setGrid = useDesigner((s) => s.setGrid)
  const newLayout = useDesigner((s) => s.newLayout)
  const clearPlacements = useDesigner((s) => s.clearPlacements)
  const exportLayout = useDesigner((s) => s.exportLayout)
  const loadLayout = useDesigner((s) => s.loadLayout)
  const undo = useDesigner((s) => s.undo)
  const redo = useDesigner((s) => s.redo)
  const canUndo = useDesigner((s) => s.past.length > 0)
  const canRedo = useDesigner((s) => s.future.length > 0)

  const [archives, setArchives] = useState<Array<{ id: number; title: string; createdAt: number; data?: Layout }>>([])
  const [shareKey, setShareKey] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const auth = await fetch('/api/auth/me', { credentials: 'include' })
        const authPayload = await auth.json().catch(() => null)
        if (cancelled || !authPayload?.authenticated) return
        const response = await fetch('/api/bearpit-simple/backups', { credentials: 'include' })
        const payload = await response.json().catch(() => null)
        if (!cancelled && response.ok && Array.isArray(payload?.backups)) {
          setArchives(payload.backups.map((item: { id: number; title: string; createdAt: number }) => ({ ...item })))
        }
      } catch { /* 未登录或接口暂时不可用 */ }
    })()
    return () => { cancelled = true }
  }, [])

  const requireLogin = () => {
    if (loggedIn) return true
    if (window.confirm('登录后才能使用保存和生成分享秘钥功能，点击“确定”打开登录窗口。')) openAuthModal()
    return false
  }

  const rememberArchive = async () => {
    if (!requireLogin()) return
    const title = window.prompt('请输入存档名称', name || '熊坑方案')?.trim()
    if (!title) return
    const data = exportLayout()
    try {
      const response = await fetch('/api/bearpit-simple/backups', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, title }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.backup) throw new Error('save failed')
      const saved = payload.backup
      setArchives((current) => [{ id: Number(saved.id), title: String(saved.title || title), createdAt: saved.createdAt, data }, ...current.filter((item) => item.id !== Number(saved.id))].slice(0, 50))
    } catch {
      window.alert('存档保存失败，请稍后重试')
    }
  }

  const restoreArchive = async (id: number) => {
    if (!requireLogin()) return
    const item = archives.find((entry) => entry.id === id)
    if (item?.data) { loadLayout(item.data); return }
    try {
      const response = await fetch(`/api/bearpit-simple/backups/${encodeURIComponent(String(id))}`, { credentials: 'include' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.backup?.data) throw new Error('restore failed')
      loadLayout(payload.backup.data as Layout)
    } catch {
      window.alert('存档读取失败，请稍后重试')
    }
  }

  const encodeShare = async () => {
    if (!requireLogin()) return
    try {
      const response = await fetch('/api/bearpit/shares', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: exportLayout() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !/^[A-Za-z0-9]{16}$/.test(String(payload?.shareKey || ''))) throw new Error('share failed')
      const key = String(payload.shareKey)
      setShareKey(key)
      navigator.clipboard?.writeText(key).catch(() => undefined)
    } catch {
      window.alert('分享秘钥生成失败，请稍后重试')
    }
  }

  const importShare = async () => {
    const key = window.prompt('请输入分享秘钥')?.trim()
    if (!key) return
    try {
      let layout: Layout
      if (/^[A-Za-z0-9]{16}$/.test(key)) {
        const response = await fetch(`/api/bearpit/shares/${encodeURIComponent(key)}`)
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.data) throw new Error('share not found')
        layout = payload.data as Layout
      } else {
        // 兼容旧版本：旧秘钥是 URL-safe Base64 编码的完整布局 JSON。
        const padded = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)
        layout = JSON.parse(decodeURIComponent(escape(atob(padded)))) as Layout
      }
      if (!layout.grid || !Array.isArray(layout.placements)) throw new Error('bad')
      loadLayout(layout)
    } catch { window.alert('分享秘钥无效或已损坏') }
  }

  const handleExportPng = () => {
    const stage = stageRef.current
    if (!stage) return
    const uri = stage.toDataURL({ pixelRatio: 2 })
    const a = document.createElement('a')
    a.href = uri
    a.download = `${name || '熊坑图'}.png`
    a.click()
  }

  return (
    <header className="toolbar">
      <div className="tb-group title-group">
        <span className="logo">🐻 熊坑图设计器</span>
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="tb-group">
        <label>
          行
          <input
            type="number"
            min={3}
            max={30}
            value={grid.rows}
            onChange={(e) => setGrid({ rows: Math.max(3, Number(e.target.value)) })}
          />
        </label>
        <label>
          列
          <input
            type="number"
            min={3}
            max={30}
            value={grid.cols}
            onChange={(e) => setGrid({ cols: Math.max(3, Number(e.target.value)) })}
          />
        </label>
        <label>
          格大小
          <input
            type="number"
            min={32}
            max={120}
            step={4}
            value={grid.cellSize}
            onChange={(e) => setGrid({ cellSize: Math.max(32, Number(e.target.value)) })}
          />
        </label>
        <label className="rotation-control">
          旋转
          <input type="range" min={0} max={360} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
          <input className="rotation-number" type="number" min={0} max={360} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />°
        </label>
      </div>

      <div className="tb-group actions">
        <button onClick={() => { window.location.href = '/rukou.html' }}>返回主页</button>
        <button className="btn-primary" onClick={rememberArchive}>保存存档</button>
        <button onClick={importShare}>导入分享秘钥</button>
        <button onClick={encodeShare}>生成分享秘钥</button>
        <button onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
          ↶ 撤销
        </button>
        <button onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Y)">
          ↷ 重做
        </button>
        <button onClick={handleExportPng}>🖼 保存 PNG</button>
        <button onClick={() => confirm('清空所有站位？（熊坑保留）') && clearPlacements()}>
          清空站位
        </button>
        <button onClick={() => confirm('新建会清空当前内容，确定？') && newLayout()}>
          新建
        </button>
      </div>
      {shareKey && (
        <div className="share-key-modal" role="dialog" aria-modal="true">
          <div className="share-key-panel">
            <h3>分享秘钥</h3>
            <p>秘钥仅显示且仅可查看一次，请立即复制并妥善保存。</p>
            <code>{shareKey}</code>
            <div className="share-key-actions">
              <button className="btn-primary" onClick={() => navigator.clipboard?.writeText(shareKey).catch(() => undefined)}>复制秘钥</button>
              <button onClick={() => setShareKey('')}>我已保存</button>
            </div>
          </div>
        </div>
      )}
      {archives.length > 0 && <div className="archive-list">存档记录：{archives.map((item) => <button key={item.id} onClick={() => restoreArchive(item.id)}>{item.title}</button>)}</div>}
    </header>
  )
}
