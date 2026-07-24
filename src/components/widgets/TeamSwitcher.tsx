import { TINFO } from '../../data';
import type { TeamKey } from '../../engine';
import { Card, SectionTitle } from '../ui';

export function TeamSwitcher({
  title,
  selectAriaLabel,
  cardAriaLabel,
  value,
  teamKeys,
  onChange,
}: {
  title: string;
  selectAriaLabel: string;
  cardAriaLabel: string;
  value: TeamKey;
  teamKeys: TeamKey[];
  onChange(teamKey: TeamKey): void;
}) {
  return (
    <Card style={{ marginBottom: 12 }} ariaLabel={cardAriaLabel}>
      <SectionTitle>{title}</SectionTitle>
      <select
        aria-label={selectAriaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value as TeamKey)}
        style={{
          background: 'var(--color-bg-soft)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 7,
          padding: '8px 10px',
        }}
      >
        {teamKeys.map((teamKey) => (
          <option key={teamKey} value={teamKey}>
            {TINFO[teamKey].n}
          </option>
        ))}
      </select>
    </Card>
  );
}
