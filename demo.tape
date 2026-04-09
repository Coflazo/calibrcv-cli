Output assets/demo.gif

Set FontSize 15
Set Width 880
Set Height 550
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 35ms
Set Shell bash

# Suppress dotenv 17 promotional logging
Env DOTENV_CONFIG_QUIET "true"

# ── Scene 1: Help ──────────────────────────────────
Type "calibrcv --help"
Sleep 300ms
Enter
Sleep 2500ms

# ── Scene 2: Score (basic) ─────────────────────────
Type "calibrcv score assets/example_after.pdf"
Sleep 300ms
Enter
Sleep 4s

# ── Scene 3: Score + job description ───────────────
Type@55ms "calibrcv score assets/example_after.pdf --job-desc 'Senior backend engineer. Python, Go, AWS, distributed systems, Docker, Kubernetes, PostgreSQL, Redis.'"
Sleep 300ms
Enter
Sleep 4s

# ── Scene 4: Build help ───────────────────────────
Type "calibrcv build --help"
Sleep 300ms
Enter
Sleep 3s
