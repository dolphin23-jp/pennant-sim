import type { CSSProperties } from 'react';

import { CENTRAL, PACIFIC, TINFO } from '../../data';
import type { TeamKey } from '../../engine';
import { useGameState } from '../../state/gameState';
import { BackToTitleButton, Button, PageShell, SectionTitle, teamTextColor } from '../ui';

const STRENGTH_MIN = 55;
const STRENGTH_MAX = 85;

/** Where the club starts among all twelve, as a line a manager would say at the first
 * press conference. */
function outlook(teamKey: TeamKey): { label: string; tone: string } {
  const ranked = (Object.keys(TINFO) as TeamKey[]).sort(
    (first, second) => TINFO[second].bd - TINFO[first].bd,
  );
  const place = ranked.indexOf(teamKey);
  if (place < 2) return { label: '優勝候補', tone: 'favorite' };
  if (place < 6) return { label: 'Aクラス争い', tone: 'contender' };
  if (place < 10) return { label: '上位進出を狙う', tone: 'middle' };
  return { label: '下剋上に挑む', tone: 'underdog' };
}

function TeamPennant({ color }: { color: string }) {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
      <path d="M4 2 L4 32 L27 17 Z" fill={color} stroke="var(--color-bg)" strokeWidth="1.2" />
      <line x1="4" y1="2" x2="4" y2="32" stroke="var(--color-text-faint)" strokeWidth="1.6" />
    </svg>
  );
}

function StrengthMeter({ value }: { value: number }) {
  const percentage = Math.min(
    100,
    Math.max(0, ((value - STRENGTH_MIN) / (STRENGTH_MAX - STRENGTH_MIN)) * 100),
  );
  return (
    <div className="team-choice__strength">
      <div className="team-choice__strength-row">
        <span>初期地力</span>
        <strong>{value}</strong>
      </div>
      <div
        role="meter"
        aria-label={`初期地力 ${value}`}
        aria-valuemin={STRENGTH_MIN}
        aria-valuemax={STRENGTH_MAX}
        aria-valuenow={value}
        className="team-choice__meter"
      >
        <div className="team-choice__meter-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function LeagueChoices({ title, teams }: { title: string; teams: readonly TeamKey[] }) {
  const { chooseTeam } = useGameState();
  return (
    <section className="team-select__league" aria-label={`${title}の球団選択`}>
      <SectionTitle>{title}</SectionTitle>
      <div className="team-select__grid">
        {teams.map((teamKey) => {
          const team = TINFO[teamKey];
          const prospect = outlook(teamKey);
          return (
            <section
              key={teamKey}
              className="card team-choice"
              style={{ '--team-choice-color': team.c } as CSSProperties}
              aria-label={team.n}
            >
              <div className="team-choice__head">
                <TeamPennant color={team.c} />
                <div className="team-choice__names">
                  <div className="team-choice__abbr" style={{ color: teamTextColor(team.c) }}>
                    {team.ab}
                  </div>
                  <div className="team-choice__name">{team.n}</div>
                </div>
                <span className={`team-choice__outlook team-choice__outlook--${prospect.tone}`}>
                  {prospect.label}
                </span>
              </div>
              <StrengthMeter value={team.bd} />
              <Button
                onClick={() => chooseTeam(teamKey)}
                color={team.c}
                ariaLabel={`${team.n}で新規ゲームを開始`}
              >
                この球団で開始
              </Button>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function TeamSelectScreen() {
  const game = useGameState();
  return (
    <PageShell ariaLabel="球団選択画面">
      <header className="team-select__header">
        <div>
          <p className="team-select__eyebrow">NEW GAME</p>
          <h1 className="team-select__title">どの球団の歴史を見届けますか？</h1>
          <p className="team-select__lead">
            選んだ球団の監督として、新しいペナントレースが始まります。選手と日程は12球団すべて自動で作られます。
          </p>
        </div>
        <BackToTitleButton onGoToTitle={() => game.setScreen('welcome')} />
      </header>
      <LeagueChoices title="セ・リーグ" teams={CENTRAL} />
      <LeagueChoices title="パ・リーグ" teams={PACIFIC} />
    </PageShell>
  );
}
