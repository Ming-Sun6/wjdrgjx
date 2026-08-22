import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import Toolbar from './components/Toolbar'
import MemberPanel from './components/MemberPanel'
import MapCanvas from './components/MapCanvas'
import { useDesigner } from './store'

export default function App() {
  const stageRef = useRef<Konva.Stage>(null)

  // 全局快捷键：Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    document.title = '熊坑排布简约版 - 冬日工具箱'
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        useDesigner.getState().undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        useDesigner.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Toolbar stageRef={stageRef} />
      <div className="workspace">
        <MemberPanel />
        <main className="canvas-area">
          <div className="canvas-scroll">
            <MapCanvas stageRef={stageRef} />
          </div>
        </main>
      </div>
      <footer className="open-source-footer">
        <span>熊坑排布简约版基于开源项目 </span>
        <a href="https://github.com/tianxiaofeng1014/wjdr-bear-pit-designer" target="_blank" rel="noreferrer">wjdr-bear-pit-designer</a>
        <span>，感谢开源作者。</span>
      </footer>
    </div>
  )
}
