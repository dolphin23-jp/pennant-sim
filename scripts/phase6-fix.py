from pathlib import Path

history = Path('src/engine/leagueHistory.ts')
text = history.read_text()
text = text.replace(
    "(output as Record<string, unknown>)[key] = Math.round(value * factor);",
    "(output as unknown as Record<string, unknown>)[key] = Math.round(value * factor);",
)
history.write_text(text)

game_state = Path('src/state/gameState.tsx')
text = game_state.read_text()
text = text.replace("title: `${teams[teamKey].ab}で新規開始`,", "title: `${history.teams[teamKey].ab}で新規開始`,")
game_state.write_text(text)
