import { useState } from 'react';

import { TINFO } from '../../data';
import type { GamePlayLog, PlayLogDecision, PlayLogHalfInning } from '../../engine';
import { Button, Card, SectionTitle, teamTextColor } from '../ui';

const DECISION_LABEL: Record<PlayLogDecision['type'], string> = {
  pitchingChange: '継投',
  bunt: 'バント',
  steal: '盗塁',
};

function Bases({ bases }: { bases?: [boolean, boolean, boolean] }) {
  if (!bases) return null;
  const label = bases.every((occupied) => !occupied)
    ? '走者なし'
    : `走者${bases
        .map((occupied, index) => (occupied ? `${index + 1}` : ''))
        .filter(Boolean)
        .join('・')}塁`;
  return (
    <span className="pbp-bases" aria-label={label} title={label}>
      {[1, 2, 0].map((index) => (
        <span
          key={index}
          className={`pbp-base pbp-base--${index + 1}${bases[index] ? ' pbp-base--on' : ''}`}
        />
      ))}
    </span>
  );
}

function HalfInning({ half, log }: { half: PlayLogHalfInning; log: GamePlayLog }) {
  const team = TINFO[half.battingTeam];
  return (
    <section className="pbp-half" aria-label={`${half.inning}回${half.isBot ? '裏' : '表'}`}>
      <header className="pbp-half__header">
        <strong>
          {half.inning}回{half.isBot ? '裏' : '表'}
        </strong>
        <span style={{ color: teamTextColor(team.c), fontWeight: 800 }}>{team.ab}の攻撃</span>
        <span className="pbp-half__runs">{half.runs > 0 ? `${half.runs}点` : '無得点'}</span>
      </header>
      <ol className="pbp-events">
        {half.events.map((event, index) =>
          'play' in event ? (
            <li key={index} className="pbp-play">
              <span className="pbp-play__situation">
                {event.play.outsBefore !== undefined && `${event.play.outsBefore}死`}
                <Bases bases={event.play.basesBefore} />
              </span>
              <span className="pbp-play__desc">{event.play.desc}</span>
              {event.play.rbi > 0 && (
                <span className="pbp-play__score">
                  {TINFO[log.awayKey].ab} {event.play.away} - {event.play.home}{' '}
                  {TINFO[log.homeKey].ab}
                </span>
              )}
            </li>
          ) : (
            <li key={index} className="pbp-decision">
              <span className="pbp-decision__label">
                {TINFO[event.decision.teamKey].ab}・{DECISION_LABEL[event.decision.type]}
              </span>
              <span>
                {event.decision.type === 'pitchingChange'
                  ? `${event.decision.playerName}が登板`
                  : `${event.decision.playerName}`}
                {event.decision.success === true && '（成功）'}
                {event.decision.success === false && '（失敗）'}
                <span className="pbp-decision__reason">{event.decision.reason}</span>
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/**
 * The game half-inning by half-inning, with the managers' moves where they happened.
 * 観戦モード reveals one half-inning at a time, so a game can be followed as it went.
 */
export function PlayByPlay({ log }: { log: GamePlayLog }) {
  const [watching, setWatching] = useState(false);
  const [shown, setShown] = useState(1);
  const halves = watching ? log.halves.slice(0, shown) : log.halves;
  const finished = !watching || shown >= log.halves.length;
  return (
    <Card ariaLabel="プレイバイプレイ">
      <div className="pbp-toolbar">
        <SectionTitle>プレイバイプレイ</SectionTitle>
        <div className="pbp-toolbar__actions">
          {watching ? (
            <Button
              onClick={() => setWatching(false)}
              color="var(--color-surface-muted)"
              ariaLabel="観戦モードを終えて全体を表示"
            >
              全体を表示
            </Button>
          ) : (
            <Button
              onClick={() => {
                setShown(1);
                setWatching(true);
              }}
              ariaLabel="1イニングずつ観戦する"
            >
              1イニングずつ観る
            </Button>
          )}
        </div>
      </div>
      <div className="pbp-list">
        {halves.map((half) => (
          <HalfInning key={`${half.inning}:${half.isBot}`} half={half} log={log} />
        ))}
      </div>
      {watching && (
        <div className="pbp-toolbar__actions" style={{ marginTop: 10 }}>
          <Button
            onClick={() => setShown((count) => Math.min(log.halves.length, count + 1))}
            disabled={finished}
            ariaLabel="次の攻撃を表示"
          >
            {finished ? '試合終了' : '次の攻撃へ'}
          </Button>
          {!finished && (
            <Button
              onClick={() => setShown(log.halves.length)}
              color="var(--color-surface-muted)"
              ariaLabel="試合の最後まで表示"
            >
              最後まで
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
