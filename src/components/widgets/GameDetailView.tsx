import type { ReactNode } from 'react';
import { TINFO } from '../../data';
import type { BatterLine, GameBoxScore, GameSummary, PitcherLine } from '../../engine';
import { Card, EmptyState, SectionTitle, teamTextColor } from '../ui';
import { Linescore } from './Linescore';

function StatusBadge({
  tone,
  children,
}: {
  tone: 'accent' | 'warning' | 'muted';
  children: ReactNode;
}) {
  return <span className={`game-detail-badge game-detail-badge--${tone}`}>{children}</span>;
}

export function DecisionsRow({ decisions }: { decisions: GameSummary['decisions'] }) {
  const parts = [decisions.winnerText, decisions.loserText, decisions.saveText].filter(
    (text): text is string => Boolean(text),
  );
  if (!parts.length) return null;
  return (
    <div className="game-detail-decisions">
      {parts.map((text) => (
        <span key={text}>{text}</span>
      ))}
    </div>
  );
}

const BATTER_COLUMNS: Array<{ key: keyof BatterLine; label: string }> = [
  { key: 'ab', label: '打数' },
  { key: 'r', label: '得点' },
  { key: 'h', label: '安打' },
  { key: 'd', label: '二塁打' },
  { key: 't', label: '三塁打' },
  { key: 'hr', label: '本塁打' },
  { key: 'rbi', label: '打点' },
  { key: 'bb', label: '四球' },
  { key: 'hbp', label: '死球' },
  { key: 'k', label: '三振' },
  { key: 'sb', label: '盗塁' },
  { key: 'cs', label: '盗塁死' },
  { key: 'sh', label: '犠打' },
  { key: 'sf', label: '犠飛' },
  { key: 'gdp', label: '併殺打' },
  { key: 'e', label: '失策' },
];

type SelectBoxScorePlayer = (playerId: string, teamKey: BatterLine['teamKey']) => void;

function BatterTable({
  title,
  lines,
  onSelectPlayer,
}: {
  title: string;
  lines: BatterLine[];
  onSelectPlayer?: SelectBoxScorePlayer;
}) {
  return (
    <Card ariaLabel={`${title}の打者成績`}>
      <SectionTitle>{title}</SectionTitle>
      {!lines.length ? (
        <EmptyState>打者成績がありません。</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table" aria-label={`${title}打者成績`}>
            <thead>
              <tr>
                <th scope="col">打順</th>
                <th scope="col" className="game-detail-table__player-head">
                  選手
                </th>
                <th scope="col">守備</th>
                {BATTER_COLUMNS.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
                <th scope="col">試合後打率</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.playerId}>
                  <td className="game-detail-table__cell">{line.battingOrder}</td>
                  <th scope="row" className="game-detail-table__player">
                    {onSelectPlayer ? (
                      <button
                        type="button"
                        className="roster-player-button"
                        aria-label={`${line.name}の選手詳細を表示`}
                        onClick={() => onSelectPlayer(line.playerId, line.teamKey)}
                      >
                        {line.name}
                      </button>
                    ) : (
                      line.name
                    )}
                  </th>
                  <td className="game-detail-table__cell">{line.position ?? '-'}</td>
                  {BATTER_COLUMNS.map((column) => (
                    <td key={column.key} className="game-detail-table__cell">
                      {line[column.key]}
                    </td>
                  ))}
                  <td className="game-detail-table__cell game-detail-table__cell--nowrap">
                    {line.seasonAvgAfter.toFixed(3).replace(/^0/, '')}（{line.seasonHrAfter}本
                    {line.seasonRbiAfter}点）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const PITCHER_COLUMNS: Array<{ key: keyof PitcherLine; label: string }> = [
  { key: 'pitches', label: '球数' },
  { key: 'battersFaced', label: '打者数' },
  { key: 'h', label: '被安打' },
  { key: 'hr', label: '被本塁打' },
  { key: 'bb', label: '与四球' },
  { key: 'k', label: '奪三振' },
  { key: 'r', label: '失点' },
  { key: 'er', label: '自責点' },
  { key: 'hbp', label: '与死球' },
];

function ipText(ip3: number): string {
  const outs = ip3 % 3;
  return `${Math.floor(ip3 / 3)}${outs > 0 ? ` ${outs}/3` : ''}`;
}

function PitcherTable({
  title,
  lines,
  onSelectPlayer,
}: {
  title: string;
  lines: PitcherLine[];
  onSelectPlayer?: SelectBoxScorePlayer;
}) {
  return (
    <Card ariaLabel={`${title}の投手成績`}>
      <SectionTitle>{title}</SectionTitle>
      {!lines.length ? (
        <EmptyState>投手成績がありません。</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table" aria-label={`${title}投手成績`}>
            <thead>
              <tr>
                <th scope="col" className="game-detail-table__player-head">
                  選手
                </th>
                <th scope="col">結果</th>
                <th scope="col">投球回</th>
                {PITCHER_COLUMNS.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
                <th scope="col">試合後防御率</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.playerId}>
                  <th scope="row" className="game-detail-table__player">
                    {onSelectPlayer ? (
                      <button
                        type="button"
                        className="roster-player-button"
                        aria-label={`${line.name}の選手詳細を表示`}
                        onClick={() => onSelectPlayer(line.playerId, line.teamKey)}
                      >
                        {line.name}
                      </button>
                    ) : (
                      line.name
                    )}
                    {line.role === 'start' && <span className="game-detail-table__role">先発</span>}
                  </th>
                  <td
                    className={
                      line.decision
                        ? 'game-detail-table__decision game-detail-table__decision--active'
                        : 'game-detail-table__decision'
                    }
                  >
                    {line.decision ?? '-'}
                  </td>
                  <td className="game-detail-table__cell game-detail-table__cell--nowrap">
                    {ipText(line.ip3)}
                  </td>
                  {PITCHER_COLUMNS.map((column) => (
                    <td key={column.key} className="game-detail-table__cell">
                      {line[column.key]}
                    </td>
                  ))}
                  <td className="game-detail-table__cell">
                    {line.seasonWAfter}勝{line.seasonLAfter}敗 {line.seasonEraAfter.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function GameDetailView({
  box,
  onSelectPlayer,
}: {
  box: GameSummary | GameBoxScore;
  onSelectPlayer?: SelectBoxScorePlayer;
}) {
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  const fullBox = box.hasBoxScore ? (box as GameBoxScore) : null;

  return (
    <div className="game-detail">
      <Card ariaLabel={`${away.n}対${home.n}`}>
        <div className="game-detail__header">
          <div>
            <div className="game-detail__date">{box.date}</div>
            <div className="game-detail__matchup">
              <span style={{ color: teamTextColor(away.c) }}>{away.n}</span>
              <span className="game-detail__score">
                {box.awayScore} - {box.homeScore}
              </span>
              <span style={{ color: teamTextColor(home.c) }}>{home.n}</span>
            </div>
          </div>
          <div className="game-detail__badges">
            {box.tie && <StatusBadge tone="muted">引分</StatusBadge>}
            {box.extraInnings && (
              <StatusBadge tone="accent">延長{box.innings.length}回</StatusBadge>
            )}
            {box.walkoff && <StatusBadge tone="warning">サヨナラ</StatusBadge>}
            {box.shutoutTeam && (
              <StatusBadge tone="accent">{TINFO[box.shutoutTeam].ab}完封</StatusBadge>
            )}
          </div>
        </div>
        {box.headline && <div className="game-detail__headline">{box.headline}</div>}
        <div className="game-detail__section">
          <Linescore
            homeAbbreviation={home.ab}
            awayAbbreviation={away.ab}
            innings={box.innings}
            homeScore={box.homeScore}
            awayScore={box.awayScore}
            homeHits={box.homeHits}
            awayHits={box.awayHits}
            homeErrors={box.homeErrors}
            awayErrors={box.awayErrors}
          />
        </div>
        <div className="game-detail__section">
          <DecisionsRow decisions={box.decisions} />
        </div>
      </Card>

      {!fullBox ? (
        <Card>
          <EmptyState>
            この試合の打者・投手別の詳細ログは保存対象外です（自チームの試合、または注目試合のみ詳細を保存しています）。
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="game-detail__table-grid">
            <BatterTable
              title={`${away.n} 打者成績`}
              lines={fullBox.batterLines.filter((line) => line.teamKey === box.awayKey)}
              onSelectPlayer={onSelectPlayer}
            />
            <BatterTable
              title={`${home.n} 打者成績`}
              lines={fullBox.batterLines.filter((line) => line.teamKey === box.homeKey)}
              onSelectPlayer={onSelectPlayer}
            />
          </div>
          <div className="game-detail__table-grid">
            <PitcherTable
              title={`${away.n} 投手成績`}
              lines={fullBox.pitcherLines.filter((line) => line.teamKey === box.awayKey)}
              onSelectPlayer={onSelectPlayer}
            />
            <PitcherTable
              title={`${home.n} 投手成績`}
              lines={fullBox.pitcherLines.filter((line) => line.teamKey === box.homeKey)}
              onSelectPlayer={onSelectPlayer}
            />
          </div>
          {fullBox.notableEvents.length > 0 && (
            <Card ariaLabel="注目記録">
              <SectionTitle>試合のポイント</SectionTitle>
              <div className="game-detail__events">
                {fullBox.notableEvents.map((event, index) => (
                  <div key={`${event.type}-${index}`} className="game-detail__event">
                    {event.description}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
