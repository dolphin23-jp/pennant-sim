from pathlib import Path

path = Path('src/engine/game.ts')
text = path.read_text()
old = """  const roster = new Map(team.fielders.map((player) => [player.id, player]));
  const resolved = supplied
    .map((player) => {
      const current = roster.get(player.id);
      return current ? { ...current, _assignedPos: player._assignedPos ?? current.pos } : null;
    })
    .filter((player): player is Player => Boolean(player && (player.injuryDays ?? 0) <= 0));
  return resolved.length >= 9 ? resolved.slice(0, 9) : bestLineup(team);
"""
new = """  const roster = new Map(team.fielders.map((player) => [player.id, player])),
    resolved: Player[] = [];
  for (const player of supplied) {
    const current = roster.get(player.id);
    if (!current || (current.injuryDays ?? 0) > 0) continue;
    resolved.push({ ...current, _assignedPos: player._assignedPos ?? current.pos });
  }
  return resolved.length >= 9 ? resolved.slice(0, 9) : bestLineup(team);
"""
if new in text:
    print('type fix already applied')
elif old in text:
    path.write_text(text.replace(old, new, 1))
    print('type fix applied')
else:
    raise SystemExit('resolveLineup pattern missing')
