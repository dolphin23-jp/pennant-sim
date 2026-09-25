import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { TINFO } from '../../data';
import type { RaceTimelinePoint, TeamKey } from '../../engine';
import { teamTextColor } from '../ui';

const HEIGHT = 240;
const MARGIN = { top: 14, right: 58, bottom: 26, left: 34 };
const LABEL_GAP = 13;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const gbText = (value: number) => (value === 0 ? '首位' : `${value.toFixed(1)}差`);
const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/**
 * Games behind the leader through the season, one line per club. The user's club is drawn
 * in its color and the rest in gray (the story is one club's race), each named at its line
 * end; a crosshair reads every club on a date, and a table view carries the same numbers.
 */
export function RaceChart({
  timeline,
  teams,
  ownTeam,
}: {
  timeline: RaceTimelinePoint[];
  teams: readonly TeamKey[];
  ownTeam: TeamKey;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxGb = useMemo(() => {
    const worst = Math.max(1, ...timeline.flatMap((point) => Object.values(point.gamesBehind)));
    return Math.ceil(worst / 5) * 5;
  }, [timeline]);
  const step = maxGb <= 10 ? 2 : maxGb <= 25 ? 5 : 10;
  const x = (index: number) =>
    MARGIN.left + (timeline.length <= 1 ? 0 : (index / (timeline.length - 1)) * plotWidth);
  const y = (gb: number) => MARGIN.top + (gb / maxGb) * plotHeight;

  const months = useMemo(() => {
    const ticks: Array<{ index: number; label: string }> = [];
    timeline.forEach((point, index) => {
      const month = point.date.slice(5, 7);
      if (index === 0 || timeline[index - 1]!.date.slice(5, 7) !== month)
        ticks.push({ index, label: `${Number(month)}月` });
    });
    return ticks;
  }, [timeline]);

  // End labels, nudged apart so clubs level on games behind don't print on top of each other.
  const endLabels = useMemo(() => {
    const last = timeline.at(-1);
    if (!last) return [];
    const placed = [...teams]
      .map((team) => ({ team, y: y(last.gamesBehind[team] ?? 0) }))
      .sort((first, second) => first.y - second.y);
    for (let index = 1; index < placed.length; index += 1) {
      const previous = placed[index - 1]!;
      if (placed[index]!.y - previous.y < LABEL_GAP) placed[index]!.y = previous.y + LABEL_GAP;
    }
    return placed;
    // y depends on maxGb and plotHeight only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, teams, maxGb, plotHeight]);

  if (timeline.length < 2) {
    return (
      <div className="race-chart" ref={ref}>
        <p className="race-chart__empty">試合が進むと、ゲーム差の推移がここに表示されます。</p>
      </div>
    );
  }

  const path = (team: TeamKey) =>
    timeline
      .map(
        (point, index) =>
          `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.gamesBehind[team] ?? 0).toFixed(1)}`,
      )
      .join('');
  const ownColor = teamTextColor(TINFO[ownTeam].c);
  const others = teams.filter((team) => team !== ownTeam);

  const indexAt = (clientX: number, element: SVGRectElement) => {
    const box = element.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    return Math.min(timeline.length - 1, Math.max(0, Math.round(ratio * (timeline.length - 1))));
  };
  const onPointer = (event: PointerEvent<SVGRectElement>) =>
    setActive(indexAt(event.clientX, event.currentTarget));
  const onKey = (event: KeyboardEvent<SVGRectElement>) => {
    const current = active ?? timeline.length - 1;
    const next =
      event.key === 'ArrowLeft'
        ? current - 1
        : event.key === 'ArrowRight'
          ? current + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? timeline.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(Math.min(timeline.length - 1, Math.max(0, next)));
  };

  const point = active === null ? null : timeline[active]!;
  const readout = point
    ? [...teams].sort((first, second) => point.gamesBehind[first]! - point.gamesBehind[second]!)
    : [];
  const tooltipLeft = active === null ? 0 : x(active);
  const tooltipOnLeft = tooltipLeft > width / 2;

  // Month-end rows for the table view.
  const tableRows = timeline.filter(
    (entry, index) => timeline[index + 1]?.date.slice(0, 7) !== entry.date.slice(0, 7),
  );

  return (
    <div className="race-chart" ref={ref}>
      <div className="race-chart__legend" aria-hidden="true">
        <span className="race-chart__key">
          <span className="race-chart__swatch" style={{ background: ownColor }} />
          {TINFO[ownTeam].ab}（自球団）
        </span>
        <span className="race-chart__key">
          <span className="race-chart__swatch race-chart__swatch--other" />
          他球団
        </span>
        <span className="race-chart__axis-note">縦軸：首位とのゲーム差</span>
      </div>
      <div className="race-chart__plot">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`ゲーム差の推移。最新：${[...teams]
            .map((team) => `${TINFO[team].ab} ${gbText(timeline.at(-1)!.gamesBehind[team] ?? 0)}`)
            .join('、')}`}
        >
          {Array.from({ length: Math.floor(maxGb / step) + 1 }, (_, index) => index * step).map(
            (gb) => (
              <g key={gb}>
                <line
                  className="race-chart__grid"
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={y(gb)}
                  y2={y(gb)}
                />
                <text
                  className="race-chart__tick"
                  x={MARGIN.left - 6}
                  y={y(gb) + 4}
                  textAnchor="end"
                >
                  {gb === 0 ? '首位' : gb}
                </text>
              </g>
            ),
          )}
          {months.map((tick) => (
            <text
              key={tick.index}
              className="race-chart__tick"
              x={x(tick.index)}
              y={HEIGHT - 8}
              textAnchor={tick.index === 0 ? 'start' : 'middle'}
            >
              {tick.label}
            </text>
          ))}
          {others.map((team) => (
            <path key={team} d={path(team)} className="race-chart__line race-chart__line--other" />
          ))}
          <path
            d={path(ownTeam)}
            className="race-chart__line race-chart__line--own"
            style={{ stroke: ownColor }}
          />
          {endLabels.map((label) => (
            <text
              key={label.team}
              x={MARGIN.left + plotWidth + 6}
              y={label.y + 4}
              className={`race-chart__end${label.team === ownTeam ? ' race-chart__end--own' : ''}`}
            >
              {TINFO[label.team].ab}
            </text>
          ))}
          {point && active !== null && (
            <g>
              <line
                className="race-chart__crosshair"
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
              />
              <circle
                cx={x(active)}
                cy={y(point.gamesBehind[ownTeam] ?? 0)}
                r={4.5}
                className="race-chart__dot"
                style={{ fill: ownColor }}
              />
            </g>
          )}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            tabIndex={0}
            role="slider"
            aria-label="日付を選んで各球団のゲーム差を見る"
            aria-valuemin={0}
            aria-valuemax={timeline.length - 1}
            aria-valuenow={active ?? timeline.length - 1}
            aria-valuetext={point ? monthDay(point.date) : monthDay(timeline.at(-1)!.date)}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(timeline.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
            className="race-chart__hit"
          />
        </svg>
        {point && (
          <div
            className="race-chart__tooltip"
            style={tooltipOnLeft ? { right: width - tooltipLeft + 10 } : { left: tooltipLeft + 10 }}
          >
            <div className="race-chart__tooltip-date">{monthDay(point.date)}</div>
            {readout.map((team) => (
              <div key={team} className="race-chart__tooltip-row">
                <span
                  className="race-chart__tooltip-key"
                  style={{ background: team === ownTeam ? ownColor : undefined }}
                />
                <span className={team === ownTeam ? 'race-chart__tooltip-own' : undefined}>
                  {TINFO[team].ab}
                </span>
                <span className="race-chart__tooltip-value">
                  {gbText(point.gamesBehind[team]!)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="race-chart__table">
        <summary>表で見る（月末時点のゲーム差）</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">日付</th>
                {teams.map((team) => (
                  <th key={team} scope="col">
                    {TINFO[team].ab}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.date}>
                  <th scope="row">{monthDay(row.date)}</th>
                  {teams.map((team) => (
                    <td key={team}>{gbText(row.gamesBehind[team] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
