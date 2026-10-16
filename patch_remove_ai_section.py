path = r"D:\projects\quickly\frontend\src\pages\Settings.jsx"

with open(path, encoding='utf-8') as f:
    content = f.read()

# 1. Remove 'ai' from sidebar
old_nav = "    { id: 'ai', label: 'AI features' },\n"
new_nav = ""

# 2. Remove AI Features section (line 1822-2053)
ai_section_start = "\n        <section id=\"settings-ai\" className=\"mb-10 scroll-mt-6\">"
ai_section_end = "\n        </section>\n\n        <section id=\"settings-other\""
next_section = "\n\n        <section id=\"settings-other\""

start_idx = content.find(ai_section_start)
end_idx = content.find(next_section, start_idx)

if start_idx == -1 or end_idx == -1:
    print(f"Section not found: start={start_idx}, end={end_idx}")
else:
    content = content[:start_idx] + next_section + content[end_idx + len(next_section):]
    print("OK — AI Features section removed")

c1 = content.count(old_nav)
if c1 == 1:
    content = content.replace(old_nav, new_nav)
    print("OK — AI sidebar link removed")
else:
    print(f"Nav NO MATCH — {c1}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)