path = r"D:\projects\quickly\frontend\src\pages\Settings.jsx"

with open(path, encoding='utf-8') as f:
    content = f.read()

# Add activateMode function and activeMode state
old_state = "  const [modelSaving, setModelSaving] = useState(false);"
new_state = """  const [modelSaving, setModelSaving] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [modeActivating, setModeActivating] = useState(false);"""

old_func = """  const saveModel = async (mode, model) => {"""
new_func = """  const activateMode = async (modeKey) => {
    const newActive = activeMode === modeKey ? null : modeKey;
    setModeActivating(true);
    try {
      if (newActive) {
        // Deactivate previous mode first
        if (activeMode && activeMode !== 'manual') {
          await api.post('/settings/activate-mode', { mode: activeMode, active: false });
        }
        // Activate new mode
        await api.post('/settings/activate-mode', { mode: newActive, active: newActive !== 'manual' });
        setActiveMode(newActive);
        notify(`${newActive.replace('_', ' ')} mode activated`, 'success');
      } else {
        await api.post('/settings/activate-mode', { mode: modeKey, active: false });
        setActiveMode(null);
        notify('Mode deactivated', 'success');
      }
    } catch { notify('Failed to activate mode', 'error'); }
    finally { setModeActivating(false); }
  };

  const saveModel = async (mode, model) => {"""

# Add active indicator to card header
old_header = """            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-800 dark:text-gray-100">{mode.label}</span>
              {mode.hasAI && credits?.[mode.modelKey] && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-medium">
                  ✦ {MODEL_LABELS[credits[mode.modelKey]]?.name}
                </span>
              )}
            </div>"""

new_header = """            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-800 dark:text-gray-100">{mode.label}</span>
              {activeMode === mode.key && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500 text-white font-bold">Active</span>
              )}
              {mode.hasAI && credits?.[mode.modelKey] && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-medium">
                  ✦ {MODEL_LABELS[credits[mode.modelKey]]?.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <button
                disabled={modeActivating}
                onClick={() => activateMode(mode.key)}
                className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                  activeMode === mode.key ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
                } disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${
                  activeMode === mode.key ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>"""

# Fix closing of the header button
old_close = """              <input
                type="text"
                value={codes[mode.key] || ''}
                onChange={e => { e.stopPropagation(); setCodes(c => ({ ...c, [mode.key]: e.target.value.toUpperCase() })); }}
                onClick={e => e.stopPropagation()}
                className={`font-mono text-sm border-2 ${mode.codeColor} rounded-lg px-3 py-1 w-32 focus:outline-none dark:bg-gray-700 dark:text-white`}
                placeholder="e.g. SEMI-2024"
              />
              <span className="text-gray-400 text-xs">{expanded === mode.key ? '▲' : '▼'}</span>
            </div>"""

new_close = """              <input
                type="text"
                value={codes[mode.key] || ''}
                onChange={e => { e.stopPropagation(); setCodes(c => ({ ...c, [mode.key]: e.target.value.toUpperCase() })); }}
                onClick={e => e.stopPropagation()}
                className={`font-mono text-sm border-2 ${mode.codeColor} rounded-lg px-3 py-1 w-28 focus:outline-none dark:bg-gray-700 dark:text-white`}
                placeholder="e.g. SEMI-2024"
              />
              <span className="text-gray-400 text-xs" onClick={e => { e.stopPropagation(); setExpanded(expanded === mode.key ? null : mode.key); }}>{expanded === mode.key ? '▲' : '▼'}</span>
            </div>
            </div>"""

c1 = content.count(old_state)
c2 = content.count(old_func)
c3 = content.count(old_header)
c4 = content.count(old_close)

print(f"Matches: state={c1}, func={c2}, header={c3}, close={c4}")

if c1 == 1: content = content.replace(old_state, new_state)
if c2 == 1: content = content.replace(old_func, new_func)
if c3 == 1: content = content.replace(old_header, new_header)
if c4 == 1: content = content.replace(old_close, new_close)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")