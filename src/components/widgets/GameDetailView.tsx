import type { ReactNode } from 'react';
import { TINFO } from '../../data';
import type { BatterLine, GameBoxScore, GameSummary, PitcherLine } from '../../engine';
import { Card, EmptyState, SectionTitle, teamTextColor } from '../ui';
import { Linescore } from './Linescore';

function StatusBadge({ tone, children }: { tone: 'accent' | 'warning' | 'muted'; children: ReactNode }) {
  const color =
    tone === 'accent'
      ? 'var(--color-accent)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-text-muted)';
  return (
    <span
      style={{
        padding: '3px 8px',
        border: `1px solid ${color}`,
        borderRadius: 6,
        color,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

export function DecisionsRow({ decisions }: { decisions: GameSummary['decisions'] }) {
  const parts = [decisions.winnerText, decisions.loserText, decisions.saveText].filter(
    (text): text is string => Boolean(text),
  );
  if (!parts.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
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
  { key: 'gdp', label: '併殺打' },
];

function BatterTable({ title, lines }: { title: string; lines: BatterLine[] }) {
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
                <th scope="col" style={{ textAlign: 'left' }}>選手</th>
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
                  <td style={{ textAlign: 'center' }}>{line.battingOrder}</td>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 800 }}>
                    {line.name}
                  </th>
                  <td style={{ textAlign: 'center' }}>{line.position ?? '-'}</td>
                  {BATTER_COLUMNS.map((column) => (
                    <td key={column.key} style={{ textAlign: 'center' }}>
                      {line[column.key]}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {line.seasonAvgAfter.toFixed(3).replace(/^0/, '')}（{line.seasonHrAfter}本{line.seasonRbiAfter}点）
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
];

function ipText(ip3: number): string {
  const outs = ip3 % 3;
  return `${Math.floor(ip3 / 3)}${outs > 0 ? ` ${outs}/3` : ''}`;
}

function PitcherTable({ title, lines }: { title: string; lines: PitcherLine[] }) {
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
                <th scope="col" style={{ textAlign: 'left' }}>選手</th>
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
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 800 }}>
                    {line.name}
                    {line.role === 'start' && (
                      <span style={{ marginLeft: 6, color: 'var(--color-text-faint)', fontSize: 10 }}>
                        先発
                      </span>
                    )}
                  </th>
                  <td
                    style={{
                      textAlign: 'center',
                      fontWeight: line.decision ? 900 : 400,
                      color: line.decision ? 'var(--color-leader)' : 'var(--color-text-muted)',
                    }}
                  >
                    {line.decision ?? '-'}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{ipText(line.ip3)}</td>
                  {PITCHER_COLUMNS.map((column) => (
                    <td key={column.key} style={{ textAlign: 'center' }}>
                      {line[column.key]}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
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

export function GameDetailView({ box }: { box: GameSummary | GameBoxScore }) {
  const home = TINFO[box.homeKey];
  const away = TINFO[box.awayKey];
  const fullBox = box.hasBoxScore ? (box as GameBoxScore) : null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card ariaLabel={`${away.n}対${home.n}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--color-text-faint)', fontSize: 11 }}>{box.date}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 900 }}>
              <span style={{ color: teamTextColor(away.c) }}>{away.n}</span>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>{box.awayScore} - {box.homeScore}</span>
              <span style={{ color: teamTextColor(home.c) }}>{home.n}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {box.tie && <StatusBadge tone="muted">引分</StatusBadge>}
            {box.extraInnings && <StatusBadge tone="accent">延長{box.innings.length}回</StatusBadge>}
            {box.walkoff && <StatusBadge tone="warning">サヨナラ</StatusBadge>}
            {box.shutoutTeam && (
              <StatusBadge tone="accent">{TINFO[box.shutoutTeam].ab}完封</StatusBadge>
            )}
          </div>
        </div>
        {box.headline && (
          <div style={{ marginTop: 8, color: 'var(--color-leader)', fontSize: 13, fontWeight: 700 }}>
            {box.headline}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <Linescore
            homeAbbreviation={home.ab}
            awayAbbreviation={away.ab}
            innings={box.innings}
            homeScore={box.homeScore}
            awayScore={box.awayScore}
            homeHits={box.homeHits}
            awayHits={box.awayHits}
          />
        </div>
        <div style={{ marginTop: 10 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 12 }}>
            <BatterTable title={`${away.n} 打者成績`} lines={fullBox.batterLines.filter((line) => line.teamKey === box.awayKey)} />
            <BatterTable title={`${home.n} 打者成績`} lines={fullBox.batterLines.filter((line) => line.teamKey === box.homeKey)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 12 }}>
            <PitcherTable title={`${away.n} 投手成績`} lines={fullBox.pitcherLines.filter((line) => line.teamKey === box.awayKey)} />
            <PitcherTable title={`${home.n} 投手成績`} lines={fullBox.pitcherLines.filter((line) => line.teamKey === box.homeKey)} />
          </div>
          {fullBox.notableEvents.length > 0 && (
            <Card ariaLabel="注目記録">
              <SectionTitle>Notable Events</SectionTitle>
              <div style={{ display: 'grid', gap: 6 }}>
                {fullBox.notableEvents.map((event, index) => (
                  <div
                    key={`${event.type}-${index}`}
                    style={{
                      padding: '6px 9px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 7,
                      background: 'var(--color-surface-raised)',
                      fontSize: 12,
                    }}
                  >
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
