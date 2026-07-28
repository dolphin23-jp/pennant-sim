import type { CSSProperties } from 'react';

import { FIELD_POSITIONS } from '../../data';
import type { AgeFilter, PositionFilter } from './playerFilters';

const selectStyle: CSSProperties = {
  minHeight: 38,
  padding: '7px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text)',
  background: 'var(--color-bg-soft)',
};

const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  color: 'var(--color-text-muted)',
  fontSize: 11,
};

/** Age-band (and, for batters, eligible-position) filter controls shared by every
 * player-picking list in the lineup/rotation editors - same convention as the Roster
 * tab's filters (RosterTable), just scoped to whichever candidate pool is showing. */
export function AgePositionFilterBar({
  ageFilter,
  onAgeFilterChange,
  positionFilter,
  onPositionFilterChange,
  matchCount,
  totalCount,
  ariaLabelPrefix,
}: {
  ageFilter: AgeFilter;
  onAgeFilterChange(next: AgeFilter): void;
  positionFilter?: PositionFilter;
  onPositionFilterChange?(next: PositionFilter): void;
  matchCount: number;
  totalCount: number;
  ariaLabelPrefix: string;
}) {
  const showPosition = positionFilter !== undefined && Boolean(onPositionFilterChange);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, marginBottom: 10 }}>
      {showPosition && (
        <label style={labelStyle}>
          可能ポジション
          <select
            aria-label={`${ariaLabelPrefix}を可能ポジションで絞り込む`}
            value={positionFilter}
            onChange={(event) => onPositionFilterChange?.(event.target.value as PositionFilter)}
            style={selectStyle}
          >
            <option value="all">すべて</option>
            {FIELD_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={labelStyle}>
        年齢帯
        <select
          aria-label={`${ariaLabelPrefix}を年齢帯で絞り込む`}
          value={ageFilter}
          onChange={(event) => onAgeFilterChange(event.target.value as AgeFilter)}
          style={selectStyle}
        >
          <option value="all">すべて</option>
          <option value="under24">24歳以下</option>
          <option value="25to29">25〜29歳</option>
          <option value="over30">30歳以上</option>
        </select>
      </label>
      <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>
        {matchCount} / {totalCount}名
      </span>
    </div>
  );
}
