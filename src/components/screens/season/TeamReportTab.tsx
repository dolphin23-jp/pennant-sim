import { CENTRAL, TINFO } from '../../../data';
import {
  aggregateTeamStats,
  bestLineup,
  calcOVR,
  deriveTeamForm,
  resolveCloserOrder,
  resolveStarterRotation,
} from '../../../engine';
import type { TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, LampFigure, SectionTitle, StatChip, teamTextColor } from '../../ui';
import { TeamFormationOverview } from '../../widgets/TeamFormationOverview';
import { TeamSwitcher } from '../../widgets/TeamSwitcher';

function leagueLabel(teamKey: TeamKey): string {
  return (CENTRAL as readonly TeamKey[]).includes(teamKey) ? 'セ・リーグ' : 'パ・リーグ';
}

export function TeamReportTab() {
  const game = useGameState();
  if (!game.teams || !game.playerTeam) return null;

  const teams = game.teams;
  const viewedKey = game.viewTeam ?? game.playerTeam;
  const viewedTeam = teams[viewedKey];
  const isOwnTeam = viewedKey === game.playerTeam;
  const record = game.standings[viewedKey];
  const form = deriveTeamForm(game.season.schedule, viewedKey);
  const pctText = record.pct === undefined ? '.---' : record.pct.toFixed(3).replace(/^0/, '');
  const streakTone = form.streak.includes('連勝')
    ? 'var(--color-success)'
    : form.streak.includes('連敗')
      ? 'var(--color-danger)'
      : undefined;

  const statsSource = isOwnTeam ? game.accumulated : game.leagueAccumulated;
  const teamStats = aggregateTeamStats(viewedTeam, statsSource);

  const lineup = isOwnTeam && game.lineup.length ? game.lineup : bestLineup(viewedTeam);
  const rotation = resolveStarterRotation(viewedTeam, isOwnTeam ? game.pitcherPlan.rotationOrder : []);
  const bullpenClosers = resolveCloserOrder(
    viewedTeam,
    isOwnTeam ? game.pitcherPlan.closerPriority : [],
  );
  const bullpenRelievers = viewedTeam.pitchers
    .filter((pitcher) => pitcher.role === 'リリーフ' && pitcher.activeRoster !== false)
    .sort((first, second) => calcOVR(second) - calcOVR(first));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <TeamSwitcher
        title="Team Report"
        cardAriaLabel="表示する球団を選択"
        selectAriaLabel="編成・成績を表示する球団"
        value={viewedKey}
        teamKeys={Object.keys(teams) as TeamKey[]}
        onChange={game.setViewTeam}
      />

      <Card ariaLabel={`${TINFO[viewedKey].n}の成績スナップショット`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <SectionTitle>Team Snapshot</SectionTitle>
          <span style={{ color: teamTextColor(TINFO[viewedKey].c), fontWeight: 800, fontSize: 13 }}>
            {TINFO[viewedKey].n}
          </span>
          <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>{leagueLabel(viewedKey)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <LampFigure
            label={TINFO[viewedKey].ab}
            value={record.rank ? `${record.rank}位` : '-'}
            elite={Boolean(record.rank && record.rank <= 3)}
            ariaLabel={`${TINFO[viewedKey].n} 現在${record.rank ?? '-'}位`}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatChip label="勝敗分" value={`${record.w}-${record.l}-${record.d}`} />
            <StatChip label="勝率" value={pctText} />
            <StatChip label="差" value={record.gb ?? '-'} />
            <StatChip label="直近10" value={`${form.last10.w}-${form.last10.l}-${form.last10.d}`} />
            <StatChip label="連続" value={form.streak} tone={streakTone} />
            <StatChip label="チーム打率" value={teamStats.avg.toFixed(3).replace(/^0/, '')} />
            <StatChip label="本塁打" value={String(teamStats.hr)} />
            <StatChip label="チーム防御率" value={teamStats.era.toFixed(2)} />
            <StatChip label="奪三振" value={String(teamStats.k)} />
          </div>
        </div>
      </Card>

      <TeamFormationOverview
        lineup={lineup}
        rotation={rotation}
        bullpenClosers={bullpenClosers}
        bullpenRelievers={bullpenRelievers}
        statsSource={statsSource}
        onSelectPlayer={game.selectPlayer}
      />
    </div>
  );
}
