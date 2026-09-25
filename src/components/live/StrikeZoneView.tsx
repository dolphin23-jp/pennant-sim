import { useEffect, useRef, type CSSProperties } from 'react';

import { PITCH_CALL_LABEL, type PitchCall, type ReplayAtBat } from './pitchReplay';

/** Zone units to the drawing: the zone is 36 wide and 44 tall, centered at (50, 46). */
const ZONE = { cx: 50, cz: 46, halfWidth: 18, halfHeight: 22 };
const toX = (x: number) => ZONE.cx + x * ZONE.halfWidth;
const toY = (z: number) => ZONE.cz - z * ZONE.halfHeight;

const CALL_TONE: Record<PitchCall, string> = {
  ball: 'ball',
  calledStrike: 'strike',
  swingingStrike: 'strike',
  foul: 'foul',
  inPlay: 'play',
  hitByPitch: 'hbp',
};

/** A batter at the plate, drawn as a simple silhouette facing the plate. */
function BatterSilhouette({ side }: { side: 'R' | 'L' }) {
  // Drawn for a right-handed batter (left of the plate), mirrored for a left-hander.
  return (
    <g
      className="zone__batter"
      transform={side === 'L' ? 'translate(100 0) scale(-1 1)' : undefined}
      aria-hidden="true"
    >
      <ellipse cx="17" cy="16" rx="5.2" ry="5.8" />
      <path d="M 12 12 Q 17 6 23 12 L 24 14 L 11 14 Z" className="zone__helmet" />
      <path d="M 10 24 Q 17 20 25 24 L 27 52 Q 20 55 12 52 Z" />
      <path d="M 13 52 L 10 86 L 16 86 L 19 60 L 22 86 L 28 86 L 26 52 Z" />
      <path d="M 24 27 L 30 36 L 28 38 L 22 30 Z" />
      <line x1="29" y1="37" x2="16" y2="4" className="zone__bat" />
    </g>
  );
}

export function StrikeZoneView({
  atBat,
  shown,
  batter,
  pitcher,
  animate,
}: {
  atBat: ReplayAtBat;
  /** How many pitches have been thrown so far. */
  shown: number;
  batter: string;
  pitcher: string;
  animate: boolean;
}) {
  const pitches = atBat.pitches.slice(0, shown);
  const latest = pitches.at(-1);
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the newest pitch in view when the list scrolls (phones).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [shown]);
  return (
    <div className="zone">
      <div className="zone__header">
        <span>
          <strong>{batter}</strong>（{atBat.batterSide === 'R' ? '右打' : '左打'}）
        </span>
        <span className="zone__vs">対</span>
        <span>
          <strong>{pitcher}</strong>（{atBat.throws === 'R' ? '右投' : '左投'}）
        </span>
      </div>
      <div className="zone__body">
        <svg
          className="zone__plate"
          viewBox="0 0 100 100"
          role="img"
          aria-label="ストライクゾーンと投球コース"
        >
          <rect x="0" y="0" width="100" height="100" className="zone__backdrop" />
          <path d="M 0 78 L 100 78 L 100 100 L 0 100 Z" className="zone__dirt" />
          <rect x="4" y="70" width="24" height="22" className="zone__box" />
          <rect x="72" y="70" width="24" height="22" className="zone__box" />
          <path d="M 41 80 L 59 80 L 59 83 L 50 87 L 41 83 Z" className="zone__home" />
          <BatterSilhouette side={atBat.batterSide} />
          <rect
            x={toX(-1)}
            y={toY(1)}
            width={ZONE.halfWidth * 2}
            height={ZONE.halfHeight * 2}
            className="zone__frame"
          />
          {[-1 / 3, 1 / 3].map((split) => (
            <g key={split} className="zone__grid">
              <line x1={toX(split)} y1={toY(1)} x2={toX(split)} y2={toY(-1)} />
              <line x1={toX(-1)} y1={toY(split)} x2={toX(1)} y2={toY(split)} />
            </g>
          ))}
          {pitches.map((pitch) => {
            const isLatest = pitch === latest;
            return (
              <g
                key={pitch.n}
                className={[
                  'zone__pitch',
                  `zone__pitch--${CALL_TONE[pitch.call]}`,
                  isLatest ? 'zone__pitch--latest' : '',
                  isLatest && animate ? 'zone__pitch--incoming' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    '--dx': `${ZONE.cx - toX(pitch.x)}px`,
                    '--dy': `${ZONE.cz - 18 - toY(pitch.z)}px`,
                  } as CSSProperties
                }
                transform={`translate(${toX(pitch.x)} ${toY(pitch.z)})`}
              >
                <g className="zone__pitch-body">
                  <circle r="3.4" />
                  <text y="1.3">{pitch.n}</text>
                </g>
              </g>
            );
          })}
        </svg>
        <ol ref={listRef} className="zone__list" aria-label="この打席の投球">
          {pitches.map((pitch) => (
            <li key={pitch.n} className={`zone__row zone__row--${CALL_TONE[pitch.call]}`}>
              <span className="zone__n">{pitch.n}</span>
              <span className="zone__type">{pitch.type}</span>
              <span className="zone__speed">{pitch.kmh}km/h</span>
              <span className="zone__call">{PITCH_CALL_LABEL[pitch.call]}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="zone__legend" aria-hidden="true">
        <span className="zone__key zone__key--ball">ボール</span>
        <span className="zone__key zone__key--strike">ストライク</span>
        <span className="zone__key zone__key--foul">ファウル</span>
        <span className="zone__key zone__key--play">打球</span>
        <span className="zone__note">投球は打席結果からの再現です</span>
      </div>
    </div>
  );
}
