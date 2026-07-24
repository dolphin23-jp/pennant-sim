import { useState } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../../data';
import { ops, qualifiesForRate } from '../../../engine';
import type { Player, PlayerStats, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, EmptyState, SectionTitle, SegmentedControl, teamTextColor } from '../../ui';

type League = 'central' | 'pacific';

const LEAGUE_TEAMS: Record<League, readonly TeamKey[]> = {
  central: CENTRAL,
  pacific: PACIFIC,
};
const LEAGUE_LABEL: Record<League, string> = {
  central: 'セ・リーグ',
  pacific: 'パ・リーグ',
};

function leagueOf(teamKey: TeamKey): League {
  return (CENTRAL as readonly TeamKey[]).includes(teamKey) ? 'central' : 'pacific';
}

interface RankingDefinition {
  id: string;
  label: string;
  kind: 'bat' | 'pit';
  rate: boolean;
  direction: 'asc' | 'desc';
  value(stats: PlayerStats): number | null;
  format(value: number): string;
}

interface RankingEntry {
  player: Player;
  teamKey: TeamKey;
  value: number;
}

const integerText = (value: number): string => String(Math.round(value));
const rateText = (value: number): string => value.toFixed(3).replace(/^0/, '');
const eraText = (value: number): string => value.toFixed(2);

const BATTER_RANKINGS: RankingDefinition[] = [
  {
    id: 'average',
    label: '打率',
    kind: 'bat',
    rate: true,
    direction: 'desc',
    value: (stats) =>
      stats.type === 'bat' && stats.ab > 0 ? stats.h / stats.ab : null,
    format: rateText,
  },
  {
    id: 'home-runs',
    label: '本塁打',
    kind: 'bat',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'bat' ? stats.hr : null),
    format: integerText,
  },
  {
    id: 'runs-batted-in',
    label: '打点',
    kind: 'bat',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'bat' ? stats.rbi : null),
    format: integerText,
  },
  {
    id: 'stolen-bases',
    label: '盗塁',
    kind: 'bat',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'bat' ? stats.sb : null),
    format: integerText,
  },
  {
    id: 'ops',
    label: 'OPS',
    kind: 'bat',
    rate: true,
    direction: 'desc',
    value: (stats) => (stats.type === 'bat' ? ops(stats) : null),
    format: rateText,
  },
];

const PITCHER_RANKINGS: RankingDefinition[] = [
  {
    id: 'era',
    label: '防御率',
    kind: 'pit',
    rate: true,
    direction: 'asc',
    value: (stats) =>
      stats.type === 'pit' && stats.ip3 > 0 ? (stats.er * 27) / stats.ip3 : null,
    format: eraText,
  },
  {
    id: 'wins',
    label: '勝利',
    kind: 'pit',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'pit' ? stats.w : null),
    format: integerText,
  },
  {
    id: 'strikeouts',
    label: '奪三振',
    kind: 'pit',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'pit' ? stats.k : null),
    format: integerText,
  },
  {
    id: 'saves',
    label: 'セーブ',
    kind: 'pit',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'pit' ? stats.sv : null),
    format: integerText,
  },
  {
    id: 'holds',
    label: 'ホールド',
    kind: 'pit',
    rate: false,
    direction: 'desc',
    value: (stats) => (stats.type === 'pit' ? stats.hld : null),
    format: integerText,
  },
];

const teamKeySet = new Set<string>(Object.keys(TINFO));

function teamKeyFor(player: Player): TeamKey | null {
  const candidate = String(player.tk);
  return teamKeySet.has(candidate) ? (candidate as TeamKey) : null;
}

function RankingCard({
  definition,
  players,
  playerTeam,
  gamesByTeam,
  statsByPlayer,
  onSelect,
}: {
  definition: RankingDefinition;
  players: Player[];
  playerTeam: TeamKey;
  gamesByTeam: Record<TeamKey, number>;
  statsByPlayer: Record<string, PlayerStats>;
  onSelect(player: Player): void;
}) {
  const entries = players
    .map<RankingEntry | null>((player) => {
      const stats = statsByPlayer[player.id];
      const teamKey = teamKeyFor(player);
      if (!stats || !teamKey || stats.type !== definition.kind) return null;
      if (definition.rate && !qualifiesForRate(stats, gamesByTeam[teamKey])) return null;
      const value = definition.value(stats);
      return value === null ? null : { player, teamKey, value };
    })
    .filter((entry): entry is RankingEntry => entry !== null)
    .sort((first, second) => {
      const difference = first.value - second.value;
      if (difference !== 0) return definition.direction === 'asc' ? difference : -difference;
      return first.player.name.localeCompare(second.player.name, 'ja');
    });

  const top10 = entries.slice(0, 10);
  const ownTeamEntries = entries
    .map((entry, leagueIndex) => ({ entry, leagueRank: leagueIndex + 1 }))
    .filter(({ entry }) => entry.teamKey === playerTeam)
    .slice(0, 3);

  return (
    <Card ariaLabel={`${definition.label}ランキング`}>
      <SectionTitle>{definition.label}</SectionTitle>
      {!top10.length ? (
        <EmptyState>対象となる成績がありません。</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table" aria-label={`${definition.label}上位10選手`}>
            <thead>
              <tr>
                <th scope="col">順</th>
                <th scope="col" style={{ textAlign: 'left' }}>選手</th>
                <th scope="col">球団</th>
                <th scope="col">記録</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((entry, index) => (
                <tr
                  key={entry.player.id}
                  style={{
                    background:
                      entry.teamKey === playerTeam
                        ? 'var(--color-accent-soft)'
                        : 'transparent',
                  }}
                >
                  <td style={{ textAlign: 'center', fontWeight: 900 }}>{index + 1}</td>
                  <th scope="row" style={{ textAlign: 'left' }}>
                    <button
                      className="roster-player-button"
                      type="button"
                      aria-label={`${entry.player.name}の詳細を表示`}
                      onClick={() => onSelect(entry.player)}
                    >
                      {entry.player.name}
                    </button>
                  </th>
                  <td style={{ textAlign: 'center', color: teamTextColor(TINFO[entry.teamKey].c) }}>
                    {TINFO[entry.teamKey].ab}
                  </td>
                  <td
                    className={index === 0 ? 'rank-leader-value' : undefined}
                    style={{ textAlign: 'center', fontWeight: 900 }}
                  >
                    {definition.format(entry.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div style={{ color: 'var(--color-text-faint)', fontSize: 11, marginBottom: 6 }}>
          自球団内順位
        </div>
        {!ownTeamEntries.length ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>対象選手なし</div>
        ) : (
          <div style={{ display: 'grid', gap: 5 }}>
            {ownTeamEntries.map(({ entry, leagueRank }, teamIndex) => (
              <div
                key={entry.player.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  color: 'var(--color-text-muted)',
                  fontSize: 12,
                }}
              >
                <button
                  type="button"
                  className="roster-player-button"
                  aria-label={`${entry.player.name}の詳細を表示`}
                  onClick={() => onSelect(entry.player)}
                >
                  {teamIndex + 1}位 {entry.player.name}
                </button>
                <span>
                  リーグ{leagueRank}位 / {definition.format(entry.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function RankingTab() {
  const game = useGameState();
  const [league, setLeague] = useState<League | null>(null);
  if (!game.teams || !game.playerTeam) return null;

  const teams = game.teams;
  const playerTeam = game.playerTeam;
  const activeLeague = league ?? leagueOf(playerTeam);
  const leagueTeamSet = new Set<TeamKey>(LEAGUE_TEAMS[activeLeague]);
  const players = Object.entries(teams)
    .filter(([teamKey]) => leagueTeamSet.has(teamKey as TeamKey))
    .flatMap(([, team]) => [...team.fielders, ...team.pitchers]);
  const gamesByTeam = Object.fromEntries(
    (Object.keys(game.standings) as TeamKey[]).map((teamKey) => [
      teamKey,
      game.standings[teamKey].g,
    ]),
  ) as Record<TeamKey, number>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Card ariaLabel="ランキングの対象リーグ">
        <SectionTitle>League</SectionTitle>
        <SegmentedControl<League>
          ariaLabel="ランキングを表示するリーグ"
          value={activeLeague}
          onChange={setLeague}
          options={[
            { id: 'central', label: 'セ・リーグ', ariaLabel: 'セ・リーグのランキングを表示' },
            { id: 'pacific', label: 'パ・リーグ', ariaLabel: 'パ・リーグのランキングを表示' },
          ]}
        />
      </Card>

      <section aria-label={`${LEAGUE_LABEL[activeLeague]} 打者タイトルランキング`}>
        <SectionTitle>
          Batter Rankings
          <span style={{ marginLeft: 8, color: 'var(--color-text-faint)', fontSize: 12, fontWeight: 700 }}>
            {LEAGUE_LABEL[activeLeague]}
          </span>
        </SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: 12,
          }}
        >
          {BATTER_RANKINGS.map((definition) => (
            <RankingCard
              key={definition.id}
              definition={definition}
              players={players}
              playerTeam={playerTeam}
              gamesByTeam={gamesByTeam}
              statsByPlayer={game.leagueAccumulated}
              onSelect={game.selectPlayer}
            />
          ))}
        </div>
      </section>

      <section aria-label={`${LEAGUE_LABEL[activeLeague]} 投手タイトルランキング`}>
        <SectionTitle>
          Pitcher Rankings
          <span style={{ marginLeft: 8, color: 'var(--color-text-faint)', fontSize: 12, fontWeight: 700 }}>
            {LEAGUE_LABEL[activeLeague]}
          </span>
        </SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: 12,
          }}
        >
          {PITCHER_RANKINGS.map((definition) => (
            <RankingCard
              key={definition.id}
              definition={definition}
              players={players}
              playerTeam={playerTeam}
              gamesByTeam={gamesByTeam}
              statsByPlayer={game.leagueAccumulated}
              onSelect={game.selectPlayer}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
