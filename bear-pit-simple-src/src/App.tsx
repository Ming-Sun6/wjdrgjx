import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import Toolbar from './components/Toolbar'
import MemberPanel from './components/MemberPanel'
import MapCanvas from './components/MapCanvas'
import AuthModal from './components/AuthModal'
import { useDesigner } from './store'

export default function App() {
  const stageRef = useRef<Konva.Stage>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

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

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((payload) => setLoggedIn(Boolean(payload?.authenticated)))
      .catch(() => setLoggedIn(false))
  }, [])

  return (
    <div className="app">
      <Toolbar stageRef={stageRef} loggedIn={loggedIn} openAuthModal={() => setAuthOpen(true)} />
      <div className="workspace">
        <MemberPanel />
        <main className="canvas-area">
          <div className="canvas-scroll">
            <MapCanvas stageRef={stageRef} />
          </div>
        </main>
      </div>
      <footer className="open-source-footer wjdr-footer">
        <div className="open-source-card">
          <div className="open-source-mark" aria-hidden="true">⌘</div>
          <div className="open-source-copy">
            <div className="open-source-kicker">OPEN SOURCE PROJECT</div>
            <div className="open-source-title">熊坑排布简约版</div>
            <div className="open-source-desc">
              本工具基于开源项目构建，感谢开源社区的分享与贡献。
            </div>
            <a
              className="open-source-link"
              href="https://github.com/tianxiaofeng1014/wjdr-bear-pit-designer"
              target="_blank"
              rel="noreferrer"
            >
              查看 GitHub 项目 <span aria-hidden="true">↗</span>
            </a>
            <div className="open-source-thanks">
              <span className="thanks-title">《2554王国 FBI 一口气吃十个大馒头》</span>
            </div>
          </div>
        </div>
        <div id="wjdr-footer-credits" className="open-source-admin-credits" aria-live="polite" />
      </footer>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={() => setLoggedIn(true)} />
    </div>
  )
}
