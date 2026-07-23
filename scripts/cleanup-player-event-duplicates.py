from pathlib import Path

path = Path('src/engine/game.ts')
text = path.read_text()
old = """function resolveLineup(team: Team, supplied?: Player[] | null): Player[] {
  if (!supplied?.length) return bestLineup(team);
  const roster = new Map(team.fielders.map((player) => [player.id, player]));
  const resolved = supplied
    .map((player) => {
      const current = roster.get(player.id);
      return current ? { ...current, _assignedPos: player._assignedPos ?? current.pos } : null;
    })
    .filter((player): player is Player => Boolean(player && (player.injuryDays ?? 0) <= 0));
  return resolved.length >= 9 ? resolved.slice(0, 9) : bestLineup(team);
}
"""
if old in text:
    path.write_text(text.replace(old, '', 1))
    print('removed duplicate resolveLineup')
else:
    print('duplicate resolveLineup already absent')
