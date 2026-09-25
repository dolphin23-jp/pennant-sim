import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { sound } from '../../audio/sound';
import { TINFO } from '../../data';
import type { GamePlayLog, TeamKey } from '../../engine';
import { useSettings } from '../../state/settings';
import { useFocusTrap } from '../widgets/useFocusTrap';
import {
  BASE_POINTS,
  FIELDER_POINTS,
  HOME_PLATE,
  buildLiveGame,
  finalLine,
  pitchSequence,
  type LiveFrame,
  type LiveMoment,
} from './liveTimeline';

type Speed = 1 | 2 | 4;

/** Where the replay is: before the first pitch (-1), or a frame with some of its pitches
 * shown and, once `resolved`, the play itself. */
interface Stage {
  frame: number;
  pitch: number;
  resolved: boolean;
}

const MOMENT_TEXT: Record<Exclude<LiveMoment, 'final'>, string> = {
  tie: '同点！',
  goAhead: '勝ち越し！',
  leadChange: '逆転！',
  walkoff: 'サヨナラ！',
  grandSlam: '満塁ホームラン！',
};

function bannerFor(frame: LiveFrame): string | null {
  if (frame.moments.includes('walkoff')) return 'サヨナラ！';
  if (frame.moments.includes('grandSlam')) return MOMENT_TEXT.grandSlam;
  if (frame.result === 'HR') return 'ホームラン！';
  if (frame.moments.includes('leadChange')) return MOMENT_TEXT.leadChange;
  if (frame.moments.includes('goAhead')) return MOMENT_TEXT.goAhead;
  if (frame.moments.includes('tie')) return MOMENT_TEXT.tie;
  if (frame.moments.includes('final')) return 'ゲームセット';
  if (frame.result === 'DP') return 'ゲッツー';
  if (frame.result === 'K' && frame.outs >= 3) return '三振！チェンジ';
  return null;
}

function flightMs(frame: LiveFrame): number {
  if (!frame.ball) return 0;
  if (frame.ball.gone) return 1500;
  if (frame.ball.kind === 'ground') return 650;
  if (frame.ball.kind === 'line') return 550;
  return 1150;
}

/** How long a resolved play stays up before the next batter. */
function holdMs(frame: LiveFrame): number {
  let hold = 1300 + flightMs(frame);
  if (bannerFor(frame)) hold += 1300;
  if (frame.notes.length) hold += 400;
  return hold;
}

function ballPath(frame: LiveFrame): string {
  const ball = frame.ball!;
  const { x, y } = ball.to;
  const start = `M ${HOME_PLATE.x} ${HOME_PLATE.y - 1}`;
  if (ball.kind === 'ground') return `${start} L ${x} ${y}`;
  const lift = ball.kind === 'line' ? 6 : ball.kind === 'popup' ? 34 : 22;
  const controlX = (HOME_PLATE.x + x) / 2;
  const controlY = Math.min(HOME_PLATE.y, y) - lift;
  return `${start} Q ${controlX} ${controlY} ${x} ${y}`;
}

function halfLabel(frame: LiveFrame | undefined): string {
  if (!frame) return 'プレイボール前';
  return `${frame.inning}回${frame.isBot ? '裏' : '表'}`;
}

export function LiveGameViewer({
  log,
  ownTeam,
  onClose,
}: {
  log: GamePlayLog;
  ownTeam: TeamKey | null;
  onClose(): void;
}) {
  const game = useMemo(() => buildLiveGame(log), [log]);
  const { reduceEffects } = useSettings();
  const [stage, setStage] = useState<Stage>({ frame: -1, pitch: 0, resolved: false });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const chanceHalf = useRef<string | null>(null);
  const frame = stage.frame >= 0 ? game.frames[stage.frame] : undefined;
  const pitches = useMemo(
    () => (frame ? pitchSequence(game.gameId, frame) : []),
    [frame, game.gameId],
  );
  const finished = stage.frame === game.frames.length - 1 && stage.resolved;

  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    sound.startCrowd();
    return () => {
      document.body.style.overflow = previousOverflow;
      sound.stopCrowd();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === ' ' && event.target === dialogRef.current) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Sounds for each step of the replay.
  useEffect(() => {
    if (!frame) return;
    if (!stage.resolved) {
      if (stage.pitch === 0) {
        const half = `${frame.inning}:${frame.isBot}`;
        const scoring = frame.basesBefore[1] || frame.basesBefore[2];
        const before = game.frames[stage.frame - 1];
        const close = Math.abs((before?.home ?? 0) - (before?.away ?? 0)) <= 2;
        if (frame.battingTeam === ownTeam && scoring && close && chanceHalf.current !== half) {
          chanceHalf.current = half;
          sound.play('chance');
        }
      } else if (stage.pitch > 0) sound.play('mitt');
      return;
    }
    if (frame.ball) sound.play(frame.result === 'HR' ? 'homeRun' : 'bat');
    else if (frame.result === 'K') sound.play('mitt');
    const own = frame.battingTeam === ownTeam;
    if (frame.result !== 'HR') {
      if (frame.runs > 0 || frame.moments.some((moment) => moment !== 'final'))
        sound.play(own || !ownTeam ? 'roar' : 'groan');
      else if (['1B', '2B', '3B', 'E', 'SB'].includes(frame.result)) sound.play('cheer');
    }
    if (frame.moments.includes('final')) {
      const ownWon =
        ownTeam &&
        ((ownTeam === game.homeKey && frame.home > frame.away) ||
          (ownTeam === game.awayKey && frame.away > frame.home));
      window.setTimeout(() => {
        sound.play('siren');
        if (ownTeam) sound.play(ownWon ? 'win' : 'lose');
      }, 900);
    }
  }, [frame, stage.frame, stage.pitch, stage.resolved, ownTeam, game]);

  // The replay clock.
  useEffect(() => {
    if (!playing || finished) return;
    let delay: number;
    let next: Stage;
    if (stage.frame < 0) {
      delay = 1400;
      next = { frame: 0, pitch: 0, resolved: false };
    } else if (!frame) return;
    else if (!stage.resolved) {
      const shown = Math.max(0, pitches.length - 1);
      const step = Math.min(320, 1500 / Math.max(1, shown));
      if (stage.pitch < shown) {
        delay = stage.pitch === 0 ? 700 : step;
        next = { ...stage, pitch: stage.pitch + 1 };
      } else {
        delay = stage.pitch === 0 ? 700 : step;
        next = { ...stage, pitch: pitches.length, resolved: true };
      }
    } else {
      delay = holdMs(frame);
      next = { frame: stage.frame + 1, pitch: 0, resolved: false };
    }
    const timer = window.setTimeout(() => setStage(next), delay / speed);
    return () => window.clearTimeout(timer);
  }, [stage, playing, speed, finished, frame, pitches.length]);

  const jumpTo = useCallback((index: number) => {
    setStage({ frame: index, pitch: 0, resolved: false });
  }, []);

  const nextHalf = () => {
    const current = frame ?? game.frames[0];
    if (!current) return;
    const index = game.frames.findIndex(
      (candidate) =>
        candidate.index > (frame?.index ?? -1) &&
        (candidate.inning !== current.inning || candidate.isBot !== current.isBot),
    );
    if (index >= 0) jumpTo(index);
    else toEnd();
  };

  const toEnd = () => {
    setStage({ frame: game.frames.length - 1, pitch: 99, resolved: true });
    setPlaying(false);
  };

  const shownFrame = frame;
  const line = shownFrame
    ? stage.resolved
      ? shownFrame.line
      : game.frames[stage.frame - 1]?.isBot === shownFrame.isBot &&
          game.frames[stage.frame - 1]?.inning === shownFrame.inning
        ? game.frames[stage.frame - 1]!.line
        : (() => {
            // The first batter of a half-inning: light the lamp for the new half at 0.
            const previous = game.frames[stage.frame - 1]?.line ?? {
              away: Array.from({ length: game.innings }, () => null),
              home: Array.from({ length: game.innings }, () => null),
            };
            const side = shownFrame.isBot ? 'home' : 'away';
            const lamps = [...previous[side]];
            lamps[shownFrame.inning - 1] = 0;
            return { ...previous, [side]: lamps };
          })()
    : {
        away: Array.from({ length: game.innings }, () => null),
        home: Array.from({ length: game.innings }, () => null),
      };
  const previousFrame = stage.frame > 0 ? game.frames[stage.frame - 1] : undefined;
  const score = shownFrame
    ? stage.resolved
      ? { away: shownFrame.away, home: shownFrame.home }
      : { away: previousFrame?.away ?? 0, home: previousFrame?.home ?? 0 }
    : { away: 0, home: 0 };
  const shownPitches = stage.resolved ? pitches : pitches.slice(0, stage.pitch);
  const count = shownPitches.reduce(
    (tally, pitch) => {
      if (pitch === 'ball') tally.balls = Math.min(3, tally.balls + 1);
      else if (pitch === 'strike' || tally.strikes < 2)
        tally.strikes = Math.min(2, tally.strikes + 1);
      return tally;
    },
    { balls: 0, strikes: 0 },
  );
  const outs = shownFrame ? (stage.resolved ? shownFrame.outs : shownFrame.outsBefore) : 0;
  const bases = shownFrame
    ? stage.resolved
      ? shownFrame.bases
      : shownFrame.basesBefore
    : ([false, false, false] as const);
  const banner = shownFrame && stage.resolved ? bannerFor(shownFrame) : null;
  const bigMoment =
    shownFrame &&
    stage.resolved &&
    (shownFrame.result === 'HR' || shownFrame.moments.includes('walkoff'));
  const ownWon =
    finished &&
    ownTeam &&
    ((ownTeam === game.homeKey && game.final.home > game.final.away) ||
      (ownTeam === game.awayKey && game.final.away > game.final.home));
  const confetti =
    !reduceEffects &&
    shownFrame &&
    stage.resolved &&
    (shownFrame.moments.includes('walkoff') || Boolean(ownWon));
  const battingKey = shownFrame?.battingTeam ?? game.awayKey;
  const fieldingKey = battingKey === game.homeKey ? game.awayKey : game.homeKey;
  const ending = finalLine(game);

  return (
    <div className="live-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className={reduceEffects ? 'live live--calm' : 'live'}
        role="dialog"
        aria-modal="true"
        aria-label={`${TINFO[game.awayKey].ab}対${TINFO[game.homeKey].ab} ライブ観戦`}
        tabIndex={-1}
        style={
          {
            '--live-bat': TINFO[battingKey].c,
            '--live-field': TINFO[fieldingKey].c,
          } as CSSProperties
        }
      >
        <header className="live__board" aria-label="スコアボード">
          <table className="live__line">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">球団</span>
                </th>
                {Array.from({ length: game.innings }, (_, index) => (
                  <th scope="col" key={index}>
                    {index + 1}
                  </th>
                ))}
                <th scope="col" className="live__total">
                  R
                </th>
              </tr>
            </thead>
            <tbody>
              {(['away', 'home'] as const).map((side) => {
                const key = side === 'away' ? game.awayKey : game.homeKey;
                return (
                  <tr key={side} className={battingKey === key ? 'live__batting' : ''}>
                    <th scope="row" style={{ '--team': TINFO[key].c } as CSSProperties}>
                      {TINFO[key].ab}
                    </th>
                    {line[side].map((runs, index) => {
                      const current =
                        shownFrame &&
                        shownFrame.inning === index + 1 &&
                        (side === 'home') === shownFrame.isBot;
                      const x =
                        finished && side === 'home' && ending.homeX && index === game.innings - 1;
                      return (
                        <td key={index} className={current ? 'live__lamp--now' : ''}>
                          {x ? 'X' : (runs ?? '')}
                        </td>
                      );
                    })}
                    <td className="live__total">{score[side]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            className="live__bso"
            aria-label={`${count.balls}ボール${count.strikes}ストライク${outs}アウト`}
          >
            {(
              [
                ['B', count.balls, 3, 'ball'],
                ['S', count.strikes, 2, 'strike'],
                ['O', outs, 2, 'out'],
              ] as const
            ).map(([label, value, lamps, tone]) => (
              <div key={label} className="live__bso-row">
                <span>{label}</span>
                {Array.from({ length: lamps }, (_, index) => (
                  <i
                    key={index}
                    className={
                      index < value ? `live__bso-lamp live__bso-lamp--${tone}` : 'live__bso-lamp'
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </header>

        <div
          key={bigMoment ? `shake-${stage.frame}` : 'stage'}
          className={bigMoment && !reduceEffects ? 'live__stage live__stage--shake' : 'live__stage'}
        >
          <svg className="live__field" viewBox="0 -12 100 104" aria-hidden="true">
            <defs>
              <pattern
                id="live-mow"
                width="9"
                height="9"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(28)"
              >
                <rect width="4.5" height="9" fill="var(--field-mow-line)" />
              </pattern>
            </defs>
            <rect x="0" y="-12" width="100" height="104" className="live__stands" />
            <g className="live__crowd">
              {Array.from({ length: 70 }, (_, index) => (
                <circle
                  key={index}
                  cx={(index * 37) % 100}
                  cy={-10 + ((index * 53) % 11)}
                  r={0.9}
                />
              ))}
            </g>
            <path d="M 50 92 L 0 8 Q 50 -22 100 8 Z" className="live__grass" />
            <path d="M 50 92 L 0 8 Q 50 -22 100 8 Z" fill="url(#live-mow)" />
            <path d="M 0 8 Q 50 -22 100 8" className="live__fence" />
            <polygon points="50,88 74,65 50,49 26,65" className="live__dirt" />
            <circle cx="50" cy="71" r="4" className="live__dirt" />
            <line x1="50" y1="88" x2="0" y2="4" className="live__chalk" />
            <line x1="50" y1="88" x2="100" y2="4" className="live__chalk" />
            {Object.entries(FIELDER_POINTS).map(([slot, point]) => (
              <circle key={slot} cx={point.x} cy={point.y} r="1.7" className="live__fielder" />
            ))}
            {BASE_POINTS.map((point, index) => (
              <rect
                key={index}
                x={point.x - 1.8}
                y={point.y - 1.8}
                width="3.6"
                height="3.6"
                transform={`rotate(45 ${point.x} ${point.y})`}
                className={bases[index] ? 'live__base live__base--on' : 'live__base'}
              />
            ))}
            <circle cx={HOME_PLATE.x} cy={HOME_PLATE.y} r="1.9" className="live__batter" />
            {shownFrame && stage.resolved && shownFrame.ball && (
              <g key={`ball-${stage.frame}`}>
                <path d={ballPath(shownFrame)} className="live__trail" pathLength={1} />
                {reduceEffects ? (
                  <circle
                    cx={shownFrame.ball.to.x}
                    cy={shownFrame.ball.to.y}
                    r="1.3"
                    className="live__ball"
                  />
                ) : (
                  <circle r="1.3" className="live__ball">
                    <animateMotion
                      dur={`${flightMs(shownFrame) / speed}ms`}
                      fill="freeze"
                      path={ballPath(shownFrame)}
                    />
                  </circle>
                )}
              </g>
            )}
          </svg>
          {banner && (
            <div key={`banner-${stage.frame}`} className="live__banner" role="status">
              {banner}
            </div>
          )}
          {confetti && (
            <div className="live__confetti" aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => (
                <i
                  key={index}
                  style={
                    {
                      '--x': `${(index * 29) % 100}%`,
                      '--delay': `${(index % 9) * 90}ms`,
                      '--hue': `${(index * 47) % 360}`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="live__telop" aria-live="polite">
          <div className="live__telop-meta">
            <span className="live__half">{halfLabel(shownFrame)}</span>
            {shownFrame && (
              <span>
                打者 <strong>{shownFrame.batter}</strong> ・ 投手 {shownFrame.pitcher}
              </span>
            )}
          </div>
          {shownFrame?.notes.map((note) => (
            <div key={note} className="live__note">
              {note}
            </div>
          ))}
          <div className="live__desc">
            {!shownFrame
              ? `${TINFO[game.awayKey].n} 対 ${TINFO[game.homeKey].n}、まもなくプレイボール`
              : stage.resolved
                ? shownFrame.desc
                : `${shownFrame.batter}、打席に入る`}
          </div>
          {finished && (
            <div className="live__final">
              試合終了 {TINFO[game.awayKey].ab} {game.final.away} - {game.final.home}{' '}
              {TINFO[game.homeKey].ab}
            </div>
          )}
        </div>

        <nav className="live__controls" aria-label="再生操作">
          <button
            type="button"
            className="live__button live__button--primary"
            onClick={() => {
              sound.unlock();
              if (finished) {
                jumpTo(0);
                setPlaying(true);
              } else setPlaying((value) => !value);
            }}
          >
            {finished ? 'もう一度' : playing ? '一時停止' : '再生'}
          </button>
          <div className="live__speed" role="group" aria-label="再生速度">
            {([1, 2, 4] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={speed === value}
                className={speed === value ? 'live__button live__button--on' : 'live__button'}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <button type="button" className="live__button" onClick={nextHalf} disabled={finished}>
            次のイニング
          </button>
          <button type="button" className="live__button" onClick={toEnd} disabled={finished}>
            結果まで
          </button>
          <button type="button" className="live__button" onClick={onClose}>
            閉じる
          </button>
        </nav>
      </div>
    </div>
  );
}
