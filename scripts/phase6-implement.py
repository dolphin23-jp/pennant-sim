from pathlib import Path

path = Path('src/state/gameState.tsx')
text = path.read_text()
text = text.replace(
"  createPlayerSeasonRecords,\n  generateSchedule,",
"  createFictionalLeagueHistory,\n  createPlayerSeasonRecords,\n  generateSchedule,",
)
old = """      const teams = current.teams ?? initTeams();
      const schedule = generateSchedule(2026);
      const rotations = createEmptyRotations();
      const prepared = simCpuUntilNext(schedule, teams, rotations, teamKey, {});
      return {
        ...initialState,
        loading: false,
        screen: 'season',
        teams,
        playerTeam: teamKey,
        viewTeam: teamKey,
        lineup: bestLineup(teams[teamKey]),
        season: { year: 2026, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        leagueAccumulated: prepared.leagueDistStats,
        leagueCareerAccumulated: prepared.leagueDistStats,
"""
new = """      const initialTeams = current.teams ?? initTeams();
      const history = createFictionalLeagueHistory(initialTeams, {
        endYear: 2025,
        seasons: 20,
        seed: 2026,
        legendsPerTeam: 2,
      });
      registerExistingNames(history.teams);
      const schedule = generateSchedule(2026);
      const rotations = createEmptyRotations();
      const prepared = simCpuUntilNext(schedule, history.teams, rotations, teamKey, {});
      const leagueCareerAccumulated = mergeStats(history.careerStats, prepared.leagueDistStats);
      return {
        ...initialState,
        loading: false,
        screen: 'season',
        teams: history.teams,
        playerTeam: teamKey,
        viewTeam: teamKey,
        lineup: bestLineup(history.teams[teamKey]),
        season: { year: 2026, schedule: prepared.sched },
        rotN: prepared.rotN,
        standings: calcStandings(prepared.sched),
        leagueAccumulated: prepared.leagueDistStats,
        careerAccumulated: history.careerStats,
        leagueCareerAccumulated,
        yearlyStats: history.yearlyStats,
        retiredPlayers: history.retiredPlayers,
        championHistory: history.championHistory,
"""
if old not in text:
    raise SystemExit('chooseTeam anchor not found')
path.write_text(text.replace(old, new))
