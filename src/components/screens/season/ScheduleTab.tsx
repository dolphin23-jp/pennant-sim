import { useMemo, useState } from 'react';

import { TINFO } from '../../../data';
import type { ScheduleGame, TeamKey } from '../../../engine';
import { useGameState } from '../../../state/gameState';
import { Card, EmptyState, SectionTitle, SegmentedControl, teamTextColor } from '../../ui';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${weekday}）`;
}

type Outcome = 'win' | 'loss' | 'tie';

function outcomeFor(game: ScheduleGame, team: TeamKey): Outcome | null {
  if (!game.played || game.hs === null || game.as === null) return null;
  const own = game.homeKey === team ? game.hs : game.as;
  const other = game.homeKey === team ? game.as : game.hs;
  return own > other ? 'win' : own < other ? 'loss' : 'tie';
}

const OUTCOME_MARK: Record<Outcome, string> = { win: '○', loss: '●', tie: '△' };
const OUTCOME_LABEL: Record<Outcome, string> = { win: '勝ち', loss: '負け', tie: '引き分け' };

/**
 * The user's own season, month by month: who they play, where, and how it went.
 * Played games open the same game detail as the results tab.
 */
export function ScheduleTab() {
  const game = useGameState();
  const team = game.playerTeam;

  const ownGames = useMemo(
    () =>
      team
        ? game.season.schedule
            .filter((entry) => entry.homeKey === team || entry.awayKey === team)
            .sort(
              (first, second) =>
                first.date.localeCompare(second.date) ||
                (first.doubleHeaderGame ?? 0) - (second.doubleHeaderGame ?? 0),
            )
        : [],
    [game.season.schedule, team],
  );
  const months = useMemo(
    () => [...new Set(ownGames.map((entry) => entry.date.slice(0, 7)))],
    [ownGames],
  );
  const nextGame = ownGames.find((entry) => !entry.played);
  const currentMonth = (nextGame ?? ownGames.at(-1))?.date.slice(0, 7) ?? months[0];
  const [manualMonth, setManualMonth] = useState<string | null>(null);
  const month = manualMonth && months.includes(manualMonth) ? manualMonth : currentMonth;

  if (!team || !month) {
    return (
      <Card ariaLabel="日程">
        <SectionTitle>日程</SectionTitle>
        <EmptyState>日程がありません。</EmptyState>
      </Card>
    );
  }

  const monthGames = ownGames.filter((entry) => entry.date.startsWith(month));
  const record = { win: 0, loss: 0, tie: 0 };
  for (const entry of monthGames) {
    const outcome = outcomeFor(entry, team);
    if (outcome) record[outcome] += 1;
  }
  const remaining = monthGames.filter((entry) => !entry.played).length;

  return (
    <Card ariaLabel="日程">
      <div className="schedule-toolbar">
        <SectionTitle>日程</SectionTitle>
        <SegmentedControl
          ariaLabel="表示する月"
          value={month}
          onChange={setManualMonth}
          options={months.map((id) => ({
            id,
            label: `${Number(id.slice(5))}月`,
            ariaLabel: `${Number(id.slice(5))}月の日程を表示`,
          }))}
        />
      </div>
      <p className="schedule-summary" role="status">
        {Number(month.slice(5))}月：{record.win}勝 {record.loss}敗 {record.tie}分
        {remaining > 0 && ` ／ 残り${remaining}試合`}
      </p>
      <div className="table-scroll">
        <table className="data-table schedule-table">
          <caption className="visually-hidden">{Number(month.slice(5))}月の自球団の日程</caption>
          <thead>
            <tr>
              <th scope="col">日付</th>
              <th scope="col">対戦</th>
              <th scope="col">結果</th>
              <th scope="col">備考</th>
            </tr>
          </thead>
          <tbody>
            {monthGames.map((entry) => {
              const home = entry.homeKey === team;
              const opponent = TINFO[home ? entry.awayKey : entry.homeKey];
              const outcome = outcomeFor(entry, team);
              const own = home ? entry.hs : entry.as;
              const other = home ? entry.as : entry.hs;
              const openable = Boolean(
                game.gameSummaries[entry.id] ?? game.gameBoxScores[entry.id],
              );
              const isNext = entry.id === nextGame?.id;
              const notes = [
                entry.isInterleague && '交流戦',
                entry.postponedFrom && `${dayLabel(entry.postponedFrom)}から振替`,
                entry.doubleHeaderGame && `ダブルヘッダー第${entry.doubleHeaderGame}試合`,
              ].filter(Boolean);
              return (
                <tr
                  key={entry.id}
                  className={isNext ? 'schedule-table__next' : undefined}
                  aria-current={isNext ? 'date' : undefined}
                >
                  <td>{dayLabel(entry.date)}</td>
                  <td>
                    <span className="schedule-table__venue">{home ? 'vs' : '@'}</span>
                    <span style={{ color: teamTextColor(opponent.c), fontWeight: 800 }}>
                      {opponent.ab}
                    </span>
                  </td>
                  <td>
                    {outcome ? (
                      openable ? (
                        <button
                          type="button"
                          className={`schedule-result schedule-result--${outcome} schedule-result--link`}
                          onClick={() => game.selectGame(entry.id)}
                          aria-label={`${dayLabel(entry.date)} ${opponent.n}戦 ${own}対${other}で${OUTCOME_LABEL[outcome]}。試合詳細を表示`}
                        >
                          {OUTCOME_MARK[outcome]} {own}-{other}
                        </button>
                      ) : (
                        <span className={`schedule-result schedule-result--${outcome}`}>
                          {OUTCOME_MARK[outcome]} {own}-{other}
                        </span>
                      )
                    ) : isNext ? (
                      <span className="schedule-table__upcoming">次の試合</span>
                    ) : (
                      <span className="schedule-table__upcoming">—</span>
                    )}
                  </td>
                  <td className="schedule-table__notes">{notes.join('・')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
