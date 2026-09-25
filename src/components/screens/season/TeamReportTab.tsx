import { CENTRAL, TINFO } from '../../../data';
import {
  aggregateTeamStats,
  bestLineup,
  calcOVR,
  CLUB_PLAN_LABEL,
  clubPlanFor,
  deriveTeamForm,
  financeOf,
  formatManYen,
  gameAttendance,
  teamPopularity,
  isForeignPlayer,
  resolveCloserOrder,
  resolveStarterRotation,
  salaryOf,
  teamPayroll,
  teamStrategyFor,
  yearsUntilFreeAgency,
} from '../../../engine';
import type {
  Player,
  ScheduleGame,
  StandingRecord,
  Team,
  TeamKey,
  TeamPhilosophy,
} from '../../../engine';

const PHILOSOPHY_LABEL: Record<TeamPhilosophy, string> = {
  balanced: 'バランス型',
  power: '長打力重視',
  onBase: '出塁重視',
  speed: '機動力重視',
  defense: '守備重視',
  youth: '若手育成',
  veteran: 'ベテラン重用',
};
import { ManagerHistoryCard } from '../../widgets/ManagerReport';
import { useGameState } from '../../../state/gameState';
import { Card, LampFigure, SectionTitle, StatChip, teamTextColor } from '../../ui';
import { TeamFormationOverview } from '../../widgets/TeamFormationOverview';
import { TeamSwitcher } from '../../widgets/TeamSwitcher';

function leagueLabel(teamKey: TeamKey): string {
  return (CENTRAL as readonly TeamKey[]).includes(teamKey) ? 'セ・リーグ' : 'パ・リーグ';
}

function PlayerChips({
  players,
  detail,
  onSelect,
}: {
  players: Player[];
  detail(player: Player): string;
  onSelect(player: Player): void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          className="roster-player-button"
          onClick={() => onSelect(player)}
        >
          {player.name}
          <span style={{ color: 'var(--color-text-faint)', marginLeft: 4 }}>{detail(player)}</span>
        </button>
      ))}
    </div>
  );
}

/** Budget and payroll, the club's biggest contracts, and who may test free agency. */
function ClubFinances({
  team,
  standings,
  schedule,
  onSelect,
}: {
  team: Team;
  standings: Record<TeamKey, StandingRecord>;
  schedule: ScheduleGame[];
  onSelect(player: Player): void;
}) {
  const homeGames = schedule.filter((game) => game.played && game.homeKey === team.key);
  const attendance = homeGames.length
    ? Math.round(
        homeGames.reduce(
          (sum, game) => sum + gameAttendance(team, game.id, game.date, standings[team.key]?.rank),
          0,
        ) / homeGames.length,
      )
    : null;
  const finance = financeOf(team);
  const plan = clubPlanFor(team, { standings });
  const payroll = teamPayroll(team);
  const room = finance.budget - payroll;
  const roster = [...team.pitchers, ...team.fielders];
  const topSalaries = [...roster].sort((a, b) => salaryOf(b) - salaryOf(a)).slice(0, 5);
  // Rights are counted at the start of the winter, so a player one season short of them
  // holds them by the time he decides.
  const freeAgencyWatch = roster
    .filter(
      (player) =>
        !isForeignPlayer(player) &&
        (yearsUntilFreeAgency(player) ?? 99) <= 1 &&
        (player.contractYears ?? 0) <= 1 &&
        calcOVR(player, player.isP ? undefined : player.pos) >= 55,
    )
    .sort((a, b) => calcOVR(b, b.isP ? undefined : b.pos) - calcOVR(a, a.isP ? undefined : a.pos))
    .slice(0, 8);
  return (
    <Card ariaLabel={`${team.n}の球団経営`}>
      <SectionTitle>球団財務</SectionTitle>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <StatChip label="予算" value={formatManYen(finance.budget)} />
        <StatChip label="年俸総額" value={formatManYen(payroll)} />
        <StatChip
          label={room >= 0 ? '余力' : '超過'}
          value={formatManYen(Math.abs(room))}
          tone={room >= 0 ? 'var(--color-success)' : 'var(--color-warning)'}
        />
        <StatChip label="前年収入" value={formatManYen(finance.revenue)} />
        <StatChip label="ファン人気" value={String(teamPopularity(team))} />
        {attendance !== null && (
          <StatChip label="観客動員（平均）" value={`${attendance.toLocaleString('ja-JP')}人`} />
        )}
        <StatChip
          label="チームカラー"
          value={PHILOSOPHY_LABEL[teamStrategyFor(team.key).philosophy]}
        />
        <StatChip label="今の成績なら" value={`${CLUB_PLAN_LABEL[plan.mode]}方針`} />
      </div>
      <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 4 }}>
        高額年俸
      </div>
      <PlayerChips
        players={topSalaries}
        detail={(player) => formatManYen(salaryOf(player))}
        onSelect={onSelect}
      />
      <div style={{ color: 'var(--color-text-faint)', fontSize: 11, margin: '10px 0 4px' }}>
        今オフFA権を行使できる見込みの主力
      </div>
      {freeAgencyWatch.length ? (
        <PlayerChips
          players={freeAgencyWatch}
          detail={(player) => `OVR ${calcOVR(player, player.isP ? undefined : player.pos)}`}
          onSelect={onSelect}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>該当する選手はいません</div>
      )}
      <p style={{ color: 'var(--color-text-faint)', fontSize: 11, margin: '10px 0 0' }}>
        CPU球団はオフに、成績と主力の年齢から「勝負」（FAで即戦力を獲る）・「再建」（ベテランを出して若手を集める）・「中庸」の方針を決めます。予算は本拠地の市場規模と前年の成績・ポストシーズン収入で決まります。年俸総額が予算を超えている球団はFA選手を獲得できず、主力がFA宣言しやすくなります。
      </p>
    </Card>
  );
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
  const rotation = resolveStarterRotation(
    viewedTeam,
    isOwnTeam ? game.pitcherPlan.rotationOrder : [],
  );
  const bullpenClosers = resolveCloserOrder(
    viewedTeam,
    isOwnTeam ? game.pitcherPlan.closerPriority : [],
  );
  const bullpenRelievers = viewedTeam.pitchers
    .filter((pitcher) => pitcher.role === 'リリーフ' && pitcher.activeRoster !== false)
    .sort((first, second) => calcOVR(second) - calcOVR(first));

  return (
    <div className="stack">
      <TeamSwitcher
        title="球団情報"
        cardAriaLabel="表示する球団を選択"
        selectAriaLabel="編成・成績を表示する球団"
        value={viewedKey}
        teamKeys={Object.keys(teams) as TeamKey[]}
        onChange={game.setViewTeam}
      />

      {isOwnTeam && <ManagerHistoryCard record={game.manager} />}

      <Card ariaLabel={`${TINFO[viewedKey].n}の成績スナップショット`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <SectionTitle>チーム概況</SectionTitle>
          <span style={{ color: teamTextColor(TINFO[viewedKey].c), fontWeight: 800, fontSize: 13 }}>
            {TINFO[viewedKey].n}
          </span>
          <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
            {leagueLabel(viewedKey)}
          </span>
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

      <ClubFinances
        team={viewedTeam}
        standings={game.standings}
        schedule={game.season.schedule}
        onSelect={game.selectPlayer}
      />

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
