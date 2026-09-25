import { useEffect, useMemo, useState } from 'react';

import { FIELD_POSITIONS, SPECIAL_INDEX } from '../../data';
import {
  averageText,
  calcOVR,
  displayOVR,
  earnedRunAverage,
  effectiveOVR,
  inningsText,
  ops,
  whip,
} from '../../engine';
import type { AccumulatedStats, Player, Team } from '../../engine';
import { Button, Card, EmptyState, SectionTitle, TermTooltip } from '../ui';
import { DisplayOVRValue } from './DisplayOVRValue';
import { PlayerCompareModal } from './PlayerCompareModal';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import {
  matchesAge,
  matchesPositionFilter,
  type AgeFilter,
  type PositionFilter,
} from './playerFilters';
import { hasGoldSpecial } from './specialDisplay';
import { BatterStatLine, PitcherStatLine } from './StatLine';

type SortKey = 'name' | 'age' | 'ovr' | 'effective' | 'display' | 'status';
type SortDirection = 'asc' | 'desc';
type KindFilter = 'all' | 'fielder' | 'pitcher';

const rosterSortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'display', label: '特殊込みOVR' },
  { key: 'effective', label: '基本OVR' },
  { key: 'ovr', label: '能力値OVR' },
  { key: 'name', label: '選手名' },
  { key: 'age', label: '年齢' },
  { key: 'status', label: '状態' },
];

function playerOVR(player: Player): number {
  return calcOVR(player);
}

function playerEffectiveOVR(player: Player): number {
  return player.isP ? calcOVR(player) : effectiveOVR(player, player._assignedPos ?? player.pos);
}

function playerDisplayOVR(player: Player): number {
  return displayOVR(player, player._assignedPos ?? player.pos);
}

function statusScore(player: Player): number {
  if ((player.injuryDays ?? 0) > 0) return 1000 + (player.injuryDays ?? 0);
  return player.fatigue ?? 0;
}

function statusText(player: Player): string {
  if ((player.injuryDays ?? 0) > 0) return `故障 ${player.injuryDays}日`;
  if (typeof player.fatigue === 'number') return `疲労 ${Math.round(player.fatigue)}`;
  return '通常';
}

function sortValue(player: Player, key: SortKey): number | string {
  if (key === 'name') return player.name;
  if (key === 'age') return player.age;
  if (key === 'ovr') return playerOVR(player);
  if (key === 'effective') return playerEffectiveOVR(player);
  if (key === 'display') return playerDisplayOVR(player);
  return statusScore(player);
}

function compareValues(
  first: number | string,
  second: number | string,
  direction: SortDirection,
): number {
  const comparison =
    typeof first === 'string' && typeof second === 'string'
      ? first.localeCompare(second, 'ja')
      : Number(first) - Number(second);
  return direction === 'asc' ? comparison : -comparison;
}

function batterValues(player: Player, accumulated: AccumulatedStats) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'bat') {
    return { average: '.---', homeRuns: '-', runsBattedIn: '-', ops: '.---' };
  }
  const onBasePlusSlugging = ops(stats);
  return {
    average: averageText(stats.h, stats.ab),
    homeRuns: String(stats.hr),
    runsBattedIn: String(stats.rbi),
    ops: onBasePlusSlugging === null ? '.---' : onBasePlusSlugging.toFixed(3).replace(/^0/, ''),
  };
}

function pitcherValues(player: Player, accumulated: AccumulatedStats) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'pit') {
    return { era: '-.--', record: '-', innings: '-', whip: '-.--' };
  }
  const era = earnedRunAverage(stats);
  const walksHitsPerInning = whip(stats);
  return {
    era: era === null ? '-.--' : era.toFixed(2),
    record: `${stats.w}-${stats.l}${stats.sv > 0 ? ` ${stats.sv}S` : ''}`,
    innings: inningsText(stats.ip3),
    whip: walksHitsPerInning === null ? '-.--' : walksHitsPerInning.toFixed(2),
  };
}

function SpecialSummary({ player }: { player: Player }) {
  const specials = player.specials ?? [];
  const hasGold = hasGoldSpecial(player);
  if (!specials.length) return <span className="roster-special-summary__none">なし</span>;
  return (
    <span
      aria-label={`特殊能力${specials.length}個${hasGold ? '、ゴールド特殊能力あり' : ''}`}
      className="roster-special-summary"
    >
      <strong>{specials.length}</strong>
      <span aria-hidden="true" className="roster-special-summary__dots">
        {specials.map((special) => {
          const definition = SPECIAL_INDEX[special.id] ?? special;
          return (
            <span
              key={special.id}
              title={definition.n}
              className="roster-special-summary__dot"
              style={{ background: definition.c }}
            />
          );
        })}
      </span>
      {hasGold && (
        <span className="special-badge special-badge--gold" aria-label="ゴールド特殊能力あり">
          ★
        </span>
      )}
    </span>
  );
}

function SortHeader({
  sortKey,
  label,
  activeKey,
  direction,
  onSort,
}: {
  sortKey: SortKey;
  label: string;
  activeKey: SortKey;
  direction: SortDirection;
  onSort(key: SortKey): void;
}) {
  const selected = sortKey === activeKey;
  const nextDirection = selected && direction === 'asc' ? '降順' : '昇順';
  return (
    <button
      type="button"
      aria-label={`${label}で${nextDirection}に並べ替え`}
      onClick={() => onSort(sortKey)}
      className={`roster-sort-button${selected ? ' roster-sort-button--active' : ''}`}
    >
      {label}
      {selected ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

function RosterMobileCard({
  player,
  accumulated,
  selected,
  selectionDisabled,
  onToggleCompare,
  onSelect,
}: {
  player: Player;
  accumulated: AccumulatedStats;
  selected: boolean;
  selectionDisabled: boolean;
  onToggleCompare(): void;
  onSelect(): void;
}) {
  const gold = hasGoldSpecial(player);
  const batting = batterValues(player, accumulated);
  const pitching = pitcherValues(player, accumulated);
  const metrics = player.isP
    ? [
        { label: '防御率', value: pitching.era },
        { label: '勝敗', value: pitching.record },
        { label: '投球回', value: pitching.innings },
        { label: 'WHIP', value: pitching.whip },
      ]
    : [
        { label: '打率', value: batting.average },
        { label: '本塁打', value: batting.homeRuns },
        { label: '打点', value: batting.runsBattedIn },
        { label: 'OPS', value: batting.ops },
      ];
  return (
    <article className={`player-summary-card${gold ? ' player-summary-card--gold' : ''}`}>
      <div className="player-summary-card__header">
        <div className="player-summary-card__identity">
          <button
            className="roster-player-button"
            type="button"
            onClick={onSelect}
            aria-label={`${player.name}の詳細を表示`}
          >
            {player.name}
          </button>
          <div className="player-summary-card__meta">
            {player.age}歳 / {player.isP ? player.role : (player._assignedPos ?? player.pos)}
            {gold ? ' / ★ゴールド特殊能力' : ''}
          </div>
          <div className="roster-card__badges">
            <PlayerStatusBadges player={player} compact />
          </div>
        </div>
        <label className="roster-card__compare">
          <input
            type="checkbox"
            aria-label={`${player.name}を比較対象に${selected ? '選択済み' : '追加'}`}
            checked={selected}
            disabled={selectionDisabled}
            onChange={onToggleCompare}
          />
          比較
        </label>
      </div>
      <div className="player-summary-card__metrics">
        {metrics.map((metric) => (
          <div className="player-summary-card__metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <dl className="player-summary-card__details">
        <div className="player-summary-card__detail">
          <dt>能力値OVR</dt>
          <dd>{playerOVR(player)}</dd>
        </div>
        <div className="player-summary-card__detail">
          <dt>基本 → 特殊込み</dt>
          <dd>
            <DisplayOVRValue
              player={player}
              position={player.isP ? undefined : (player._assignedPos ?? player.pos)}
              compact
            />
          </dd>
        </div>
        <div className="player-summary-card__detail">
          <dt>状態</dt>
          <dd>{statusText(player)}</dd>
        </div>
        <div className="player-summary-card__detail">
          <dt>特殊能力</dt>
          <dd>
            <SpecialSummary player={player} />
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function RosterTable({
  team,
  accumulated,
  onSelect,
}: {
  team: Team;
  accumulated: AccumulatedStats;
  onSelect(player: Player): void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'display',
    direction: 'desc',
  });
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const players = useMemo(() => [...team.fielders, ...team.pitchers], [team]);

  useEffect(() => {
    setSelectedIds([]);
    setCompareOpen(false);
  }, [team.key]);

  const filteredPlayers = useMemo(
    () =>
      players
        .filter((player) => {
          if (kindFilter === 'fielder' && player.isP) return false;
          if (kindFilter === 'pitcher' && !player.isP) return false;
          if (!matchesPositionFilter(player, positionFilter)) return false;
          return matchesAge(player, ageFilter);
        })
        .sort((first, second) => {
          const comparison = compareValues(
            sortValue(first, sort.key),
            sortValue(second, sort.key),
            sort.direction,
          );
          return comparison || first.name.localeCompare(second.name, 'ja');
        }),
    [ageFilter, kindFilter, players, positionFilter, sort.direction, sort.key],
  );

  const comparePlayers = selectedIds
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));

  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  };

  const toggleCompare = (playerId: string) => {
    setSelectedIds((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId);
      return current.length < 3 ? [...current, playerId] : current;
    });
  };

  if (!players.length) return <EmptyState>登録選手がいません。</EmptyState>;

  return (
    <>
      <Card ariaLabel={`${team.n}のロスター`}>
        <SectionTitle>選手一覧</SectionTitle>
        <div className="roster-filters">
          <label className="roster-filters__field">
            投打
            <select
              aria-label="投手と野手で絞り込む"
              value={kindFilter}
              onChange={(event) => {
                const next = event.target.value as KindFilter;
                setKindFilter(next);
                if (next === 'pitcher') setPositionFilter('all');
              }}
              className="roster-filters__select"
            >
              <option value="all">すべて</option>
              <option value="fielder">野手</option>
              <option value="pitcher">投手</option>
            </select>
          </label>
          <label className="roster-filters__field">
            守備位置
            <select
              aria-label="守備位置で絞り込む"
              value={positionFilter}
              onChange={(event) => {
                const next = event.target.value as PositionFilter;
                setPositionFilter(next);
                if (next !== 'all') setKindFilter('fielder');
              }}
              className="roster-filters__select"
            >
              <option value="all">すべて</option>
              {FIELD_POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
          </label>
          <label className="roster-filters__field">
            年齢帯
            <select
              aria-label="年齢帯で絞り込む"
              value={ageFilter}
              onChange={(event) => setAgeFilter(event.target.value as AgeFilter)}
              className="roster-filters__select"
            >
              <option value="all">すべて</option>
              <option value="under24">24歳以下</option>
              <option value="25to29">25〜29歳</option>
              <option value="over30">30歳以上</option>
            </select>
          </label>
          <span className="roster-filters__count">
            {filteredPlayers.length} / {players.length}名
          </span>
        </div>

        {!filteredPlayers.length ? (
          <EmptyState>条件に一致する選手がいません。</EmptyState>
        ) : (
          <>
            <div className="mobile-table-sort" aria-label="モバイル用ロスター並べ替え">
              <label>
                並び順
                <select
                  aria-label="ロスターの並び順"
                  value={sort.key}
                  onChange={(event) => {
                    const key = event.target.value as SortKey;
                    setSort({ key, direction: key === 'name' ? 'asc' : 'desc' });
                  }}
                >
                  {rosterSortOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`現在${sort.direction === 'asc' ? '昇順' : '降順'}。順序を反転`}
                onClick={() =>
                  setSort((current) => ({
                    ...current,
                    direction: current.direction === 'asc' ? 'desc' : 'asc',
                  }))
                }
              >
                {sort.direction === 'asc' ? '昇順 ↑' : '降順 ↓'}
              </button>
            </div>

            <div className="roster-table-wrap desktop-table-view">
              <table className="roster-table" aria-label={`${team.n}の選手一覧`}>
                <caption>
                  選手名を選択すると詳細を表示します。基本総合値から特殊込み総合値への変化を表示します。
                </caption>
                <thead>
                  <tr>
                    <th scope="col">比較</th>
                    <th scope="col" className="roster-cell--left">
                      <SortHeader
                        sortKey="name"
                        label="選手"
                        activeKey={sort.key}
                        direction={sort.direction}
                        onSort={handleSort}
                      />
                    </th>
                    <th scope="col">
                      <SortHeader
                        sortKey="age"
                        label="年齢"
                        activeKey={sort.key}
                        direction={sort.direction}
                        onSort={handleSort}
                      />
                    </th>
                    <th scope="col">役割</th>
                    <th scope="col">
                      <TermTooltip
                        term="能力値OVR"
                        description="守備位置適性と特殊能力を含めない能力値ベースのOVRです。"
                      />{' '}
                      <SortHeader
                        sortKey="ovr"
                        label="並替"
                        activeKey={sort.key}
                        direction={sort.direction}
                        onSort={handleSort}
                      />
                    </th>
                    <th scope="col">
                      <TermTooltip
                        term="基本 → 特殊込み"
                        description="従来の実効OVRから、特殊能力を表示上だけ加減した総合値への変化です。"
                      />{' '}
                      <SortHeader
                        sortKey="display"
                        label="並替"
                        activeKey={sort.key}
                        direction={sort.direction}
                        onSort={handleSort}
                      />
                    </th>
                    <th scope="col">
                      <SortHeader
                        sortKey="status"
                        label="状態"
                        activeKey={sort.key}
                        direction={sort.direction}
                        onSort={handleSort}
                      />
                    </th>
                    <th scope="col">特殊</th>
                    <th scope="col" className="roster-cell--left">
                      今季
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => {
                    const overall = playerOVR(player);
                    const selected = selectedIds.includes(player.id);
                    const selectionDisabled = selectedIds.length >= 3 && !selected;
                    return (
                      <tr key={player.id}>
                        <td className="roster-cell--center">
                          <input
                            type="checkbox"
                            aria-label={`${player.name}を比較対象に${selected ? '選択済み' : '追加'}`}
                            checked={selected}
                            disabled={selectionDisabled}
                            onChange={() => toggleCompare(player.id)}
                          />
                        </td>
                        <td className={hasGoldSpecial(player) ? 'gold-player-cell' : undefined}>
                          <button
                            className="roster-player-button"
                            type="button"
                            onClick={() => onSelect(player)}
                            aria-label={`${player.name}の詳細を表示`}
                          >
                            {player.name}
                          </button>
                        </td>
                        <td className="roster-cell--center">{player.age}</td>
                        <td className="roster-cell--center roster-cell--muted">
                          {player.isP ? player.role : (player._assignedPos ?? player.pos)}
                        </td>
                        <td
                          className={`roster-cell--center roster-cell--strong${overall >= 80 ? ' metric-highlight' : ''}`}
                        >
                          {overall}
                        </td>
                        <td className="roster-cell--center">
                          <DisplayOVRValue
                            player={player}
                            position={player.isP ? undefined : (player._assignedPos ?? player.pos)}
                            compact
                          />
                        </td>
                        <td className="roster-cell--center" title={statusText(player)}>
                          <PlayerStatusBadges player={player} compact />
                          {!((player.injuryDays ?? 0) > 0) && !player.fatigue && (
                            <span className="roster-status-normal">通常</span>
                          )}
                        </td>
                        <td className="roster-cell--center">
                          <SpecialSummary player={player} />
                        </td>
                        <td className="roster-cell--muted">
                          {player.isP ? (
                            <PitcherStatLine player={player} accumulated={accumulated} detailed />
                          ) : (
                            <BatterStatLine player={player} accumulated={accumulated} detailed />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className="mobile-card-list"
              role="list"
              aria-label={`${team.n}のモバイル選手一覧`}
            >
              {filteredPlayers.map((player) => {
                const selected = selectedIds.includes(player.id);
                return (
                  <div role="listitem" key={player.id}>
                    <RosterMobileCard
                      player={player}
                      accumulated={accumulated}
                      selected={selected}
                      selectionDisabled={selectedIds.length >= 3 && !selected}
                      onToggleCompare={() => toggleCompare(player.id)}
                      onSelect={() => onSelect(player)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {selectedIds.length > 0 && (
        <div role="region" aria-label="選手比較の操作" className="roster-compare-bar">
          <div className="roster-compare-bar__summary">
            <strong>{selectedIds.length}人を選択中</strong>
            <div className="roster-compare-bar__names">
              {comparePlayers.map((player) => player.name).join('、')}
            </div>
          </div>
          <div className="roster-compare-bar__actions">
            <Button
              onClick={() => setSelectedIds([])}
              color="var(--color-surface-muted)"
              ariaLabel="比較対象の選択をすべて解除"
            >
              解除
            </Button>
            <Button
              onClick={() => setCompareOpen(true)}
              disabled={selectedIds.length < 2}
              ariaLabel="選択した選手を比較"
            >
              比較する
            </Button>
          </div>
        </div>
      )}

      {compareOpen && (
        <PlayerCompareModal
          players={comparePlayers}
          accumulated={accumulated}
          onSelect={(player) => {
            setCompareOpen(false);
            onSelect(player);
          }}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </>
  );
}
