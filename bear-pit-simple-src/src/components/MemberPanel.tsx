import { useDesigner } from '../store'

export default function MemberPanel() {
  const colors = useDesigner((s) => s.colors)
  const selectedColor = useDesigner((s) => s.selectedColor)
  const bearColor = useDesigner((s) => s.bearColor)
  const bearLabel = useDesigner((s) => s.bearLabel)
  const setBearColor = useDesigner((s) => s.setBearColor)
  const setBearLabel = useDesigner((s) => s.setBearLabel)
  const addColor = useDesigner((s) => s.addColor)
  const removeColor = useDesigner((s) => s.removeColor)
  const setSelectedColor = useDesigner((s) => s.setSelectedColor)
  const addMember = useDesigner((s) => s.addMember)
  const addFlag = useDesigner((s) => s.addFlag)
  const addMine = useDesigner((s) => s.addMine)
  // 名称在 store 里（draftName），这样图上幽灵预览能实时看到
  const draftName = useDesigner((s) => s.draftName)
  const setDraftName = useDesigner((s) => s.setDraftName)
  const setDraftFocused = useDesigner((s) => s.setDraftFocused)

  // 实时统计（总数）
  const memberCount = useDesigner((s) => s.members.length)
  const members = useDesigner((s) => s.members)
  const setMemberName = useDesigner((s) => s.setMemberName)
  const flagCount = useDesigner(
    (s) => s.placements.filter((p) => p.kind === 'flag').length,
  )
  const mineCount = useDesigner(
    (s) => s.placements.filter((p) => p.kind === 'mine').length,
  )

  const submit = () => {
    const trimmed = draftName.trim()
    if (!trimmed) return
    const ok = addMember(trimmed)
    if (!ok) {
      alert('网格放不下更多成员了，调大行/列再试。')
    }
    // 成功与否 addMember 都会处理 draft；失败时保留输入便于改大网格再回车
  }

  return (
    <aside className="panel">
      {/* 统计（实时总数） */}
      <div className="stats">
        <span>
          成员 <b>{memberCount}</b>
        </span>
        <span>
          旗帜 <b>{flagCount}</b>
        </span>
        <span>
          联盟矿 <b>{mineCount}</b>
        </span>
      </div>

      {/* 熊坑 */}
      <section className="region">
        <h2>熊坑</h2>
        <div className="bear-edit">
          <input
            type="color"
            value={bearColor}
            title="熊坑颜色"
            onChange={(e) => setBearColor(e.target.value)}
          />
          <input
            className="bear-label"
            placeholder="熊坑文字（可留空）"
            value={bearLabel}
            onChange={(e) => setBearLabel(e.target.value)}
          />
        </div>
      </section>

      {/* 旗帜 / 联盟矿 */}
      <section className="region">
        <h2>旗帜 / 联盟矿</h2>
        <div className="place-tools">
          <button
            className="tool"
            onClick={() => {
              if (!addFlag()) alert('网格放不下更多旗帜了，调大行/列再试。')
            }}
          >
            🚩 添加旗帜
          </button>
          <button
            className="tool"
            onClick={() => {
              if (!addMine()) alert('网格放不下更多联盟矿了，调大行/列再试。')
            }}
          >
            ⛏ 添加联盟矿
          </button>
        </div>
        <div className="hint">
          旗帜占 1 格、联盟矿占 2×2；都自动摆到熊坑周围。可拖动换位、单击改底色（联盟矿还可改文字/文字色）、移上去点右上角 × 删除。
        </div>
      </section>

      {/* 成员 */}
      <section className="region">
        <h2>成员</h2>
        <div className="member-form">
          <div className="form-row">
            <span
              className="color-dot big"
              style={{ background: selectedColor }}
              title="新元素将使用此底色"
            />
            <input
              placeholder="昵称，回车直接上图"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onFocus={() => setDraftFocused(true)}
              onBlur={() => setDraftFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <button className="btn-primary" onClick={submit}>
            + 添加并上图
          </button>
        </div>
        <div className="hint">
          光标点进下面的输入框，图上就会以半透明令牌预览落点（默认绕熊坑顺时针排），可直接拖动调整，输入昵称后回车即落位。图上令牌可拖动换位、单击改文字/底色/文字色、移上去点右上角 × 删除。
        </div>

        <h3>配色（文字 / 底色通用）</h3>
        <div className="color-manager">
          {colors.map((c) => (
            <button
              key={c}
              className={`swatch${c === selectedColor ? ' sel' : ''}`}
              style={{ background: c }}
              title="选为新元素默认底色"
              onClick={() => setSelectedColor(c)}
            >
              {colors.length > 1 && (
                <span
                  className="rm"
                  title="删除该颜色"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeColor(c)
                  }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <label className="swatch add" title="新增颜色">
            ＋
            <input type="color" onChange={(e) => addColor(e.target.value)} />
          </label>
        </div>
        <div className="hint">
          这组颜色同时供「令牌底色」和「文字颜色」选用（在图上单击元素的小窗里选）。
        </div>
      </section>
      <section className="region member-roster">
        <h2>成员名单</h2>
        <div className="member-roster-list">
          {members.length ? members.map((member) => (
            <label key={member.id} className="member-roster-row">
              <span className="color-dot" style={{ background: member.color }} />
              <input value={member.name} onChange={(e) => setMemberName(member.id, e.target.value)} />
            </label>
          )) : <div className="hint">暂无成员，请先添加成员。</div>}
        </div>
      </section>
    </aside>
  )
}
