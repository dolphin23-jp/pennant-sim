import { useState, type KeyboardEvent } from 'react';

import { useGameState } from '../../state/gameState';
import { BackToTitleButton, Button, NewGameButton, PageShell, teamTextColor } from '../ui';
import { DashboardTab } from './season/DashboardTab';
import { GameResultsTab } from './season/GameResultsTab';
import { HistoryTab } from './season/HistoryTab';
import { LineupTab } from './season/LineupTab';
import { NarrativeTab } from './season/NarrativeTab';
import { RankingTab } from './season/RankingTab';
import { RosterTab } from './season/RosterTab';
import { RotationTab } from './season/RotationTab';
import { SquadTab } from './season/SquadTab';
import { StandingsTab } from './season/StandingsTab';
import { StatsTab } from './season/StatsTab';
import { TeamReportTab } from './season/TeamReportTab';

type SeasonTab =
  | 'dashboard'
  | 'news'
  | 'lineup'
  | 'rotation'
  | 'stats'
  | 'ranking'
  | 'standings'
  | 'gameResults'
  | 'teamReport'
  | 'roster'
  | 'squad'
  | 'history';

const tabs: Array<{ id: SeasonTab; label: string }> = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'news', label: 'ニュース' },
  { id: 'lineup', label: '野手編成' },
  { id: 'rotation', label: '投手編成' },
  { id: 'stats', label: '成績' },
  { id: 'ranking', label: 'ランキング' },
  { id: 'standings', label: '順位表' },
  { id: 'gameResults', label: '試合結果' },
  { id: 'teamReport', label: '球団情報' },
  { id: 'roster', label: '選手一覧' },
  { id: 'squad', label: '一軍・二軍' },
  { id: 'history', label: '記録' },
];

export function SeasonScreen() {
  const game = useGameState();
  const [saveStatus, setSaveStatus] = useState('');
  const [activeTab, setActiveTab] = useState<SeasonTab>('dashboard');
  const [lineupDirty, setLineupDirty] = useState(false);
  const [rotationDirty, setRotationDirty] = useState(false);

  if (!game.teams || !game.playerTeam) return null;
  const playerTeam = game.teams[game.playerTeam];
  const record = game.standings[game.playerTeam];

  const handleSave = async () => {
    const success = await game.saveCurrent();
    setSaveStatus(success ? '✓ 保存完了' : '✗ 保存失敗');
    window.setTimeout(() => setSaveStatus(''), 1800);
  };

  const requestTabChange = (nextTab: SeasonTab): boolean => {
    if (nextTab === activeTab) return true;
    const editorDirty =
      activeTab === 'lineup' ? lineupDirty : activeTab === 'rotation' ? rotationDirty : false;
    const editorLabel = activeTab === 'rotation' ? '投手編成' : 'オーダー';
    if (
      editorDirty &&
      !window.confirm(
        `${editorLabel}に未保存の変更があります。変更を破棄して別のタブへ移動しますか？`,
      )
    ) {
      return false;
    }
    if (activeTab === 'lineup') setLineupDirty(false);
    if (activeTab === 'rotation') setRotationDirty(false);
    setActiveTab(nextTab);
    return true;
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab || !requestTabChange(nextTab.id)) return;
    window.requestAnimationFrame(() =>
      document.getElementById(`season-tab-${nextTab.id}`)?.focus(),
    );
  };

  return (
    <PageShell ariaLabel={`${game.season.year}年シーズン画面`}>
      <header
        aria-labelledby="season-screen-title"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ color: teamTextColor(playerTeam.c), fontSize: 12, fontWeight: 900 }}>
            {playerTeam.ab}
          </div>
          <h1 id="season-screen-title" style={{ margin: '3px 0' }}>
            {game.season.year}年シーズン
          </h1>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            {record.rank ?? '-'}位 / {record.w}勝 {record.l}敗 {record.d}分
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="inline-status" role="status" aria-live="polite">
            {saveStatus}
          </span>
          <Button
            onClick={() => void handleSave()}
            color="var(--color-surface-muted)"
            ariaLabel="現在のゲームを保存"
          >
            保存
          </Button>
          <NewGameButton onStartNewGame={game.startNewGame} />
          <BackToTitleButton onGoToTitle={() => game.setScreen('welcome')} />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="シーズン画面の表示項目"
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14,
          paddingBottom: 4,
          overflowX: 'auto',
          borderBottom: '1px solid var(--color-border)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              id={`season-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-label={`${tab.label}タブを表示`}
              aria-selected={selected}
              aria-controls={`season-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => requestTabChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              style={{
                flex: '0 0 auto',
                minHeight: 42,
                padding: '9px 13px',
                border: '1px solid var(--color-border)',
                borderBottom: selected ? '3px solid var(--color-accent)' : '3px solid transparent',
                borderRadius: '8px 8px 0 0',
                color: selected ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background: selected ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id={`season-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`season-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'dashboard' && (
          <DashboardTab
            onSelectTeam={(teamKey) => {
              game.setViewTeam(teamKey);
              requestTabChange('teamReport');
            }}
          />
        )}
        {activeTab === 'news' && <NarrativeTab />}
        {activeTab === 'lineup' && <LineupTab onDirtyChange={setLineupDirty} />}
        {activeTab === 'rotation' && <RotationTab onDirtyChange={setRotationDirty} />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'ranking' && <RankingTab />}
        {activeTab === 'standings' && (
          <StandingsTab
            onSelectTeam={(teamKey) => {
              game.setViewTeam(teamKey);
              requestTabChange('teamReport');
            }}
          />
        )}
        {activeTab === 'gameResults' && <GameResultsTab />}
        {activeTab === 'teamReport' && <TeamReportTab />}
        {activeTab === 'roster' && <RosterTab />}
        {activeTab === 'squad' && <SquadTab />}
        {activeTab === 'history' && <HistoryTab />}
      </section>
    </PageShell>
  );
}
