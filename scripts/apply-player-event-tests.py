from pathlib import Path

path = Path('tests/engine.unit.test.ts')
text = path.read_text()
if 'growPlayer records a non-zero change' in text:
    print('tests already applied')
    raise SystemExit(0)
text = text.replace(
    """  calcStandings,
  configureRandom,
""",
    """  bestLineup,
  calcStandings,
  configureRandom,
  growPlayer,
""",
    1,
)
marker = "test('calcStandings records wins, losses, runs and ranks', () => {"
insert = """test('growPlayer records a non-zero change when normal development rounds to zero', () => {
  const player = makePlayer('flat-growth', false);
  player.age = 31;
  player.pot = { ...player.p };
  configureRandom(() => 0.5, () => Date.UTC(2026, 0, 1));
  try {
    const grown = growPlayer(player),
      latest = grown.growthLog?.at(-1);
    assert.ok(latest?.changes?.length);
    assert.ok(latest.changes.some((change) => change.diff !== 0));
  } finally {
    resetRandom();
  }
});

test('post-game processing awakens a participant and can award a special ability', () => {
  const teams = initTeams(),
    target = teams.giants.fielders[0] as Player,
    suppliedLineup = teams.giants.fielders.slice(0, 9);
  target.age = 20;
  target.p = {
    ...target.p,
    cf: 25,
    cb: 25,
    pw: 25,
    dc: 25,
    sp: 25,
    df: 25,
    arm: 25,
  };
  target.pot = { cf: 75, cb: 75, pw: 75, dc: 75, sp: 75, df: 75, arm: 75, stam: 75 };
  target.specials = [];
  target.specialLevels = {};
  target.awakeCount = 0;
  target.seasonAwakenDone = false;
  configureRandom(() => 0, () => Date.UTC(2026, 0, 1));
  try {
    const result = simulateGame('giants', 'tigers', teams, suppliedLineup),
      updated = teams.giants.fielders.find((player) => player.id === target.id);
    assert.ok(result.postGameEvents.awakenings.some((event) => event.playerId === target.id));
    assert.equal(updated?.seasonAwakenDone, true);
    assert.ok((updated?.specials?.length ?? 0) > 0);
  } finally {
    resetRandom();
  }
});

test('post-game injuries set severity and exclude the player from the next lineup', () => {
  const teams = initTeams(),
    target = teams.giants.fielders[0] as Player,
    suppliedLineup = teams.giants.fielders.slice(0, 9);
  target.seasonAwakenDone = true;
  configureRandom(() => 0, () => Date.UTC(2026, 0, 1));
  try {
    const result = simulateGame('giants', 'tigers', teams, suppliedLineup),
      updated = teams.giants.fielders.find((player) => player.id === target.id);
    assert.ok(result.postGameEvents.injuries.some((event) => event.playerId === target.id));
    assert.equal(updated?.injurySeverity, 'light');
    assert.ok((updated?.injuryDays ?? 0) > 0);
    assert.ok(!bestLineup(teams.giants).some((player) => player.id === target.id));
  } finally {
    resetRandom();
  }
});

"""
if marker not in text:
    raise SystemExit('test insertion marker missing')
path.write_text(text.replace(marker, insert + marker, 1))
print('player event tests applied')
