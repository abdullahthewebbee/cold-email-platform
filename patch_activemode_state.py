path = r"D:\projects\quickly\frontend\src\pages\Settings.jsx"

with open(path, encoding='utf-8') as f:
    lines = f.readlines()

# Find line 207 (0-indexed: 206)
target = 206
if 'modelSaving' in lines[target] and 'useState' in lines[target]:
    lines.insert(target + 1, "  const [activeMode, setActiveMode] = useState(null);\n")
    lines.insert(target + 2, "  const [modeActivating, setModeActivating] = useState(false);\n")
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("OK — activeMode state added")
else:
    print(f"Wrong line: {lines[target][:80]}")