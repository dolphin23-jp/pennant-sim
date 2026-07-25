from pathlib import Path

path = Path('src/engine/game.ts')
text = path.read_text()
text = text.replace("import { bestLineup, masteryFromAccum } from './ratings';", "import { masteryFromAccum } from './ratings';")
path.write_text(text)
