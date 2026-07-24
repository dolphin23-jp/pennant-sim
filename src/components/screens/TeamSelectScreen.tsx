import { CENTRAL, PACIFIC, TINFO } from '../../data';
import type { TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { Button, Card, PageShell, SectionTitle } from '../ui';

const STRENGTH_MIN = 55;
const STRENGTH_MAX = 85;

function TeamPennant({ color }: { color: string }) {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
      <path d="M4 2 L4 32 L27 17 Z" fill={color} stroke="var(--color-bg)" strokeWidth="1.2" />
      <line x1="4" y1="2" x2="4" y2="32" stroke="var(--color-text-faint)" strokeWidth="1.6" />
    </svg>
  );
}

function StrengthMeter({ value, color }: { value: number; color: string }) {
  const percentage = Math.min(100, Math.max(0, ((value - STRENGTH_MIN) / (STRENGTH_MAX - STRENGTH_MIN)) * 100));
  return (
    <div style={{ margin: '8px 0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>初期地力</span>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 12 }}>{value}</strong>
      </div>
      <div
        role="meter"
        aria-label={`初期地力 ${value}`}
        aria-valuemin={STRENGTH_MIN}
        aria-valuemax={STRENGTH_MAX}
        aria-valuenow={value}
        style={{
          height: 6,
          overflow: 'hidden',
          borderRadius: 999,
          background: 'var(--color-surface-muted)',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            borderRadius: 'inherit',
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function LeagueChoices({ title, teams }: { title: string; teams: readonly TeamKey[] }) {
  const { chooseTeam } = useGameState();
  return (
    <section style={{ marginBottom: 20 }} aria-label={`${title}の球団選択`}>
      <SectionTitle>{title}</SectionTitle>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
          gap: 10,
        }}
      >
        {teams.map((teamKey) => {
          const team = TINFO[teamKey];
          return (
            <Card key={teamKey} style={{ borderColor: team.c }} ariaLabel={team.n}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TeamPennant color={team.c} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: team.c }}>{team.ab}</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{team.n}</div>
                </div>
              </div>
              <StrengthMeter value={team.bd} color={team.c} />
              <Button
                onClick={() => chooseTeam(teamKey)}
                color={team.c}
                ariaLabel={`${team.n}で新規ゲームを開始`}
              >
                この球団で開始
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function TeamSelectScreen() {
  return (
    <PageShell ariaLabel="球団選択画面">
      <h1 style={{ marginTop: 0 }}>球団選択</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
        選択した球団で新しいペナントレースが始まります。全球団の選手・日程が自動生成されます。
      </p>
      <LeagueChoices title="Central League" teams={CENTRAL} />
      <LeagueChoices title="Pacific League" teams={PACIFIC} />
    </PageShell>
  );
}
