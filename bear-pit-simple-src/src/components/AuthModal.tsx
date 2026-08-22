import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onAuthenticated: (user: unknown) => void
}

export default function AuthModal({ open, onClose, onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(String(payload?.error || '登录失败'))
      const me = await fetch('/api/auth/me', { credentials: 'include' })
      const mePayload = await me.json().catch(() => null)
      onAuthenticated(mePayload?.user || payload?.user || null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="simple-auth-modal" role="presentation" onMouseDown={onClose}>
      <div className="simple-auth-panel" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="simple-auth-head">
          <h3>{mode === 'login' ? '登录' : '注册并登录'}</h3>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" type="password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {error && <div className="simple-auth-error">{error}</div>}
        <div className="simple-auth-actions">
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>{busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}</button>
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '注册账号' : '返回登录'}</button>
        </div>
      </div>
    </div>
  )
}
