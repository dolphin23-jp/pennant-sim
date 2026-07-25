from pathlib import Path

# Keep the strategy engine auditable and callable, but do not silently change
# the established simulation distribution in this phase.
path = Path('src/engine/game.ts')
text = path.read_text()
text = text.replace("import { strategicBestLineup } from './aiStrategy';\n", "")
text = text.replace("import { masteryFromAccum } from './ratings';", "import { bestLineup, masteryFromAccum } from './ratings';")
text = text.replace("if (!supplied?.length) return strategicBestLineup(team).lineup;", "if (!supplied?.length) return bestLineup(team);")
text = text.replace(": strategicBestLineup(team).lineup;", ": bestLineup(team);")
path.write_text(text)

path = Path('src/engine/pitcherPlan.ts')
text = path.read_text()
text = text.replace("import { strategicPitcherOrder } from './aiStrategy';\n", "")
old_closer = """  const closerById = new Map(team.pitchers.filter((pitcher) => pitcher.role === 'クローザー').map((pitcher) => [pitcher.id, pitcher]));
  const strategicClosers = strategicPitcherOrder(team, 'closer').map((entry) => closerById.get(entry.playerId)).filter((pitcher): pitcher is Player => Boolean(pitcher));
  const closers = strategicClosers.length ? strategicClosers : [...closerById.values()];
  if (!closerPriority.length) return closers;"""
new_closer = """  const closers = team.pitchers.filter((pitcher) => pitcher.role === 'クローザー');
  if (!closerPriority.length) return closers;"""
text = text.replace(old_closer, new_closer)
path.write_text(text)
