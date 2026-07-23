import { CENTRAL, PACIFIC, TINFO } from '../../data';
import type { TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { Button, Card, PageShell, SectionTitle } from '../ui';

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
              <div style={{ fontSize: 18, fontWeight: 900, color: team.c }}>{team.ab}</div>
              <div style={{ fontSize: 13, marginTop: 5 }}>{team.n}</div>
              <div style={{ color: 'var(--color-text-faint)', fontSize: 11, margin: '8px 0 12px' }}>
                初期地力 {team.bd}
              </div>
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
        選択後はPhase Bエンジンで日程とCPU試合を生成します。
      </p>
      <LeagueChoices title="Central League" teams={CENTRAL} />
      <LeagueChoices title="Pacific League" teams={PACIFIC} />
    </PageShell>
  );
}
