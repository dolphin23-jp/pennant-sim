import { useEffect, useMemo, useState } from 'react';

import { FIELD_POSITIONS, SPECIAL_INDEX } from '../../data';
import { calcOVR, displayOVR, effectiveOVR } from '../../engine';
import type { AccumulatedStats, Player, Team } from '../../engine';
import { Button, Card, EmptyState, SectionTitle, TermTooltip } from '../ui';
import { DisplayOVRValue } from './DisplayOVRValue';
import { PlayerCompareModal } from './PlayerCompareModal';
import { PlayerStatusBadges } from './PlayerStatusBadges';
import { matchesAge, matchesPositionFilter, type AgeFilter, type PositionFilter } from './playerFilters';
import { hasGoldSpecial } from './specialDisplay';
import { BatterStatLine, PitcherStatLine } from './StatLine';
import './phaseB.css';

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
    return { average: '.---', homeRuns: '-', runsBattedIn: '-' };
  }
  return {
    average: stats.ab > 0 ? (stats.h / stats.ab).toFixed(3).replace(/^0/, '') : '.---',
    homeRuns: String(stats.hr),
    runsBattedIn: String(stats.rbi),
  };
}

function pitcherValues(player: Player, accumulated: AccumulatedStats) {
  const stats = accumulated[player.id];
  if (!stats || stats.type !== 'pit') {
    return { era: '-.--', record: '-', saves: '-' };
  }
  return {
    era: stats.ip3 > 0 ? ((stats.er * 27) / stats.ip3).toFixed(2) : '-.--',
    record: `${stats.w}-${stats.l}`,
    saves: String(stats.sv),
  };
}

function SpecialSummary({ player }: { player: Player }) {
  const specials = player.specials ?? [];
  const hasGold = hasGoldSpecial(player);
  if (!specials.length) return <span style={{ color: 'var(--color-text-faint)' }}>なし</span>;
  return (
    <span
      aria-label={`特殊能力${specials.length}個${hasGold ? '、ゴールド特殊能力あり' : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
    >
      <strong>{specials.length}</strong>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 3 }}>
        {specials.map((special) => {
          const definition = SPECIAL_INDEX[special.id] ?? special;
          return (
            <span
              key={special.id}
              title={definition.n}
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: definition.c,
              }}
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
      style={{
        padding: 0,
        border: 0,
        color: selected ? 'var(--color-accent)' : 'var(--color-text-faint)',
        background: 'transparent',
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      {label}{selected ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
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
        { label: 'セーブ', value: pitching.saves },
      ]
    : [
        { label: '打率', value: batting.average },
        { label: '本塁打', value: batting.homeRuns },
        { label: '打点', value: batting.runsBattedIn },
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
            {player.age}歳 / {player.isP ? player.role : player._assignedPos ?? player.pos}
            {gold ? ' / ★ゴールド特殊能力' : ''}
          </div>
          <div style={{ marginTop: 5 }}>
            <PlayerStatusBadges player={player} compact />
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
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
              position={player.isP ? undefined : player._assignedPos ?? player.pos}
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
          <dd><SpecialSummary player={player} /></dd>
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
        <SectionTitle>Roster</SectionTitle>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'end',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
            投打
            <select
              aria-label="投手と野手で絞り込む"
              value={kindFilter}
              onChange={(event) => {
                const next = event.target.value as KindFilter;
                setKindFilter(next);
                if (next === 'pitcher') setPositionFilter('all');
              }}
              style={{
                minHeight: 38,
                padding: '7px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-text)',
                background: 'var(--color-bg-soft)',
              }}
            >
              <option value="all">すべて</option>
              <option value="fielder">野手</option>
              <option value="pitcher">投手</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
            守備位置
            <select
              aria-label="守備位置で絞り込む"
              value={positionFilter}
              onChange={(event) => {
                const next = event.target.value as PositionFilter;
                setPositionFilter(next);
                if (next !== 'all') setKindFilter('fielder');
              }}
              style={{
                minHeight: 38,
                padding: '7px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-text)',
                background: 'var(--color-bg-soft)',
              }}
            >
              <option value="all">すべて</option>
              {FIELD_POSITIONS.map((position) => (
                <option key={position} value={position}>{position}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
            年齢帯
            <select
              aria-label="年齢帯で絞り込む"
              value={ageFilter}
              onChange={(event) => setAgeFilter(event.target.value as AgeFilter)}
              style={{
                minHeight: 38,
                padding: '7px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                color: 'var(--color-text)',
                background: 'var(--color-bg-soft)',
              }}
            >
              <option value="all">すべて</option>
              <option value="under24">24歳以下</option>
              <option value="25to29">25〜29歳</option>
              <option value="over30">30歳以上</option>
            </select>
          </label>
          <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
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
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`現在${sort.direction === 'asc' ? '昇順' : '降順'}。順序を反転`}
                onClick={() => setSort((current) => ({
                  ...current,
                  direction: current.direction === 'asc' ? 'desc' : 'asc',
                }))}
              >
                {sort.direction === 'asc' ? '昇順 ↑' : '降順 ↓'}
              </button>
            </div>

            <div className="roster-table-wrap desktop-table-view">
              <table className="roster-table" aria-label={`${team.n}の選手一覧`}>
                <caption>選手名を選択すると詳細を表示します。基本総合値から特殊込み総合値への変化を表示します。</caption>
                <thead>
                  <tr>
                    <th scope="col">比較</th>
                    <th scope="col" style={{ textAlign: 'left' }}>
                      <SortHeader sortKey="name" label="選手" activeKey={sort.key} direction={sort.direction} onSort={handleSort} />
                    </th>
                    <th scope="col">
                      <SortHeader sortKey="age" label="年齢" activeKey={sort.key} direction={sort.direction} onSort={handleSort} />
                    </th>
                    <th scope="col">役割</th>
                    <th scope="col">
                      <TermTooltip term="能力値OVR" description="守備位置適性と特殊能力を含めない能力値ベースのOVRです。" />{' '}
                      <SortHeader sortKey="ovr" label="並替" activeKey={sort.key} direction={sort.direction} onSort={handleSort} />
                    </th>
                    <th scope="col">
                      <TermTooltip term="基本 → 特殊込み" description="従来の実効OVRから、特殊能力を表示上だけ加減した総合値への変化です。" />{' '}
                      <SortHeader sortKey="display" label="並替" activeKey={sort.key} direction={sort.direction} onSort={handleSort} />
                    </th>
                    <th scope="col">
                      <SortHeader sortKey="status" label="状態" activeKey={sort.key} direction={sort.direction} onSort={handleSort} />
                    </th>
                    <th scope="col">特殊</th>
                    <th scope="col" style={{ textAlign: 'left' }}>今季</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => {
                    const overall = playerOVR(player);
                    const selected = selectedIds.includes(player.id);
                    const selectionDisabled = selectedIds.length >= 3 && !selected;
                    return (
                      <tr key={player.id}>
                        <td style={{ textAlign: 'center' }}>
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
                        <td style={{ textAlign: 'center' }}>{player.age}</td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          {player.isP ? player.role : player._assignedPos ?? player.pos}
                        </td>
                        <td
                          className={overall >= 80 ? 'metric-highlight' : undefined}
                          style={{ textAlign: 'center', fontWeight: 900 }}
                        >
                          {overall}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <DisplayOVRValue
                            player={player}
                            position={player.isP ? undefined : player._assignedPos ?? player.pos}
                            compact
                          />
                        </td>
                        <td style={{ textAlign: 'center' }} title={statusText(player)}>
                          <PlayerStatusBadges player={player} compact />
                          {!((player.injuryDays ?? 0) > 0) && !player.fatigue && (
                            <span style={{ color: 'var(--color-text-faint)' }}>通常</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <SpecialSummary player={player} />
                        </td>
                        <td style={{ color: 'var(--color-text-muted)' }}>
                          {player.isP ? (
                            <PitcherStatLine player={player} accumulated={accumulated} />
                          ) : (
                            <BatterStatLine player={player} accumulated={accumulated} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list" role="list" aria-label={`${team.n}のモバイル選手一覧`}>
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
        <div
          role="region"
          aria-label="選手比較の操作"
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            left: 12,
            zIndex: 80,
            display: 'flex',
            width: 'min(720px,calc(100% - 24px))',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            margin: '0 auto',
            padding: 12,
            border: '1px solid var(--color-border-strong)',
            borderRadius: 12,
            background: 'var(--color-surface-raised)',
            boxShadow: '0 14px 36px rgb(0 0 0 / 32%)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <strong>{selectedIds.length}人を選択中</strong>
            <div
              style={{
                overflow: 'hidden',
                color: 'var(--color-text-muted)',
                fontSize: 11,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {comparePlayers.map((player) => player.name).join('、')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
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
