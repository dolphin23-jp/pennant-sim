from pathlib import Path

path = Path('src/engine/pitcherPlan.ts')
text = path.read_text()
old = """  const strategicIds = strategicPitcherOrder(team, 'starter').map((entry) => entry.playerId);
  const starterById = new Map(team.pitchers.map((pitcher) => [pitcher.id, pitcher]));
  const automatic = strategicIds.map((id) => starterById.get(id)).filter((pitcher): pitcher is Player => Boolean(pitcher)).slice(0, team.rotSize || 6);
  const fallback = automatic.length ? automatic : topStarters(team);
  if (!rotationOrder.length) return fallback;"""
new = """  const automatic = topStarters(team);
  if (!rotationOrder.length) return automatic;"""
text = text.replace(old, new)
text = text.replace("  for (const pitcher of fallback) append(pitcher);", "  for (const pitcher of automatic) append(pitcher);")
path.write_text(text)
