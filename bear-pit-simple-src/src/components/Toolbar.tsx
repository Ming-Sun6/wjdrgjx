import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { useDesigner } from '../store'
import type { Layout } from '../types'

interface Props {
  stageRef: React.RefObject<Konva.Stage>
}

export default function Toolbar({ stageRef }: Props) {
  const name = useDesigner((s) => s.name)
  const grid = useDesigner((s) => s.grid)
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

  const [archives, setArchives] = useState<Array<{ id: string; title: string; createdAt: number; data: Layout }>>([])
  const [shareKey, setShareKey] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try { setArchives(JSON.parse(localStorage.getItem('wjdr-bearpit-simple-archives') || '[]')) } catch { setArchives([]) }
  }, [])

  const rememberArchive = () => {
    const title = window.prompt('请输入存档名称', name || '熊坑方案')?.trim()
    if (!title) return
    const data = exportLayout()
    const next = [{ id: Math.random().toString(36).slice(2), title, createdAt: Date.now(), data }, ...archives].slice(0, 50)
    localStorage.setItem('wjdr-bearpit-simple-archives', JSON.stringify(next))
    setArchives(next)
    fetch('/api/bearpit/layout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, backupTitle: title }),
    }).catch(() => undefined)
  }

  const restoreArchive = (id: string) => {
    const item = archives.find((entry) => entry.id === id)
    if (item) loadLayout(item.data)
  }

  const encodeShare = async () => {
    try {
      const response = await fetch('/api/bearpit/shares', {
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

  // 保存设计：把整套设计下载成 .json 文件
  const handleSaveDesign = () => {
    const data = JSON.stringify(exportLayout(), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || '熊坑图'}.设计.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 打开设计：从 .json 文件载入
  const handleOpenDesign = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const layout = JSON.parse(String(reader.result)) as Layout
        if (!layout.grid || !Array.isArray(layout.placements))
          throw new Error('格式不对')
        loadLayout(layout)
      } catch {
        alert('这个文件打不开，请选择之前“保存设计”导出的 .json 文件。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  void handleSaveDesign
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
      </div>

      <div className="tb-group actions">
        <button className="btn-primary" onClick={rememberArchive}>保存存档</button>
        <button onClick={importShare}>导入分享秘钥</button>
        <button onClick={encodeShare}>生成分享秘钥</button>
        <button onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
          ↶ 撤销
        </button>
        <button onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Y)">
          ↷ 重做
        </button>
        <button className="btn-primary" onClick={rememberArchive}>
          💾 保存设计
        </button>
        <button onClick={() => fileRef.current?.click()}>📂 打开设计</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleOpenDesign}
        />
        <button onClick={handleExportPng}>🖼 保存 PNG</button>
        <button onClick={() => confirm('清空所有站位？（熊坑保留）') && clearPlacements()}>
          清空站位
        </button>
        <button onClick={() => confirm('新建会清空当前内容，确定？') && newLayout()}>
          新建
        </button>
      </div>
      {shareKey && <div className="share-key" title="已复制到剪贴板">分享秘钥：{shareKey}</div>}
      {archives.length > 0 && <div className="archive-list">存档记录：{archives.map((item) => <button key={item.id} onClick={() => restoreArchive(item.id)}>{item.title}</button>)}</div>}
    </header>
  )
}
