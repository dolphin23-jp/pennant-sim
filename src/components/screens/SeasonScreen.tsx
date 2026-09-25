import { useEffect, useState, type KeyboardEvent } from 'react';

import { useGameState } from '../../state/gameState';
import { useConfirm } from '../ConfirmDialog';
import { PageShell } from '../ui';
import { GameControlBar } from '../widgets/GameControlBar';
import { SeasonScoreboard } from '../widgets/SeasonScoreboard';
import { DashboardTab } from './season/DashboardTab';
import { GameResultsTab } from './season/GameResultsTab';
import { HistoryTab } from './season/HistoryTab';
import { LineupTab } from './season/LineupTab';
import { NarrativeTab } from './season/NarrativeTab';
import { RankingTab } from './season/RankingTab';
import { RosterTab } from './season/RosterTab';
import { RotationTab } from './season/RotationTab';
import { ScheduleTab } from './season/ScheduleTab';
import { SquadTab } from './season/SquadTab';
import { StandingsTab } from './season/StandingsTab';
import { StatsTab } from './season/StatsTab';
import { TeamReportTab } from './season/TeamReportTab';
import { YearReviewTab } from './season/YearReviewTab';

type SeasonTab =
  | 'dashboard'
  | 'yearReview'
  | 'news'
  | 'lineup'
  | 'rotation'
  | 'stats'
  | 'ranking'
  | 'standings'
  | 'schedule'
  | 'gameResults'
  | 'teamReport'
  | 'roster'
  | 'squad'
  | 'history';

type TabGroup = 'home' | 'team' | 'games' | 'league' | 'records';

const groups: Array<{
  id: TabGroup;
  label: string;
  tabs: Array<{ id: SeasonTab; label: string }>;
}> = [
  { id: 'home', label: 'ホーム', tabs: [{ id: 'dashboard', label: 'ダッシュボード' }] },
  {
    id: 'team',
    label: 'チーム',
    tabs: [
      { id: 'lineup', label: '野手編成' },
      { id: 'rotation', label: '投手編成' },
      { id: 'squad', label: '一軍・二軍' },
      { id: 'roster', label: '選手一覧' },
      { id: 'teamReport', label: '球団情報' },
    ],
  },
  {
    id: 'games',
    label: '試合',
    tabs: [
      { id: 'schedule', label: '日程' },
      { id: 'gameResults', label: '試合結果' },
    ],
  },
  {
    id: 'league',
    label: 'リーグ',
    tabs: [
      { id: 'standings', label: '順位表' },
      { id: 'stats', label: '成績' },
      { id: 'ranking', label: 'ランキング' },
    ],
  },
  {
    id: 'records',
    label: '記録',
    tabs: [
      { id: 'yearReview', label: '年度総括' },
      { id: 'news', label: 'ニュース' },
      { id: 'history', label: '歴代記録' },
    ],
  },
];

const groupOf = (tab: SeasonTab): TabGroup =>
  groups.find((group) => group.tabs.some((entry) => entry.id === tab))!.id;

export function SeasonScreen() {
  const game = useGameState();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<SeasonTab>('dashboard');
  /** The tab last open in each group, so returning to a group lands where the user left it. */
  const [lastInGroup, setLastInGroup] = useState<Partial<Record<TabGroup, SeasonTab>>>({});
  const [lineupDirty, setLineupDirty] = useState(false);
  const [rotationDirty, setRotationDirty] = useState(false);

  // On a phone the tab row scrolls sideways; keep the open tab in view.
  useEffect(() => {
    document
      .getElementById(`season-tab-${activeTab}`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  if (!game.teams || !game.playerTeam) return null;
  const activeGroup = groups.find((group) => group.id === groupOf(activeTab))!;

  const requestTabChange = async (nextTab: SeasonTab): Promise<boolean> => {
    if (nextTab === activeTab) return true;
    const editorDirty =
      activeTab === 'lineup' ? lineupDirty : activeTab === 'rotation' ? rotationDirty : false;
    const editorLabel = activeTab === 'rotation' ? '投手編成' : 'オーダー';
    if (
      editorDirty &&
      !(await confirm({
        title: `${editorLabel}に未保存の変更があります`,
        message: '変更を破棄して別の画面へ移動しますか？',
        confirmLabel: '破棄して移動',
        cancelLabel: '編集に戻る',
        danger: true,
      }))
    ) {
      return false;
    }
    if (activeTab === 'lineup') setLineupDirty(false);
    if (activeTab === 'rotation') setRotationDirty(false);
    setLastInGroup((current) => ({ ...current, [groupOf(nextTab)]: nextTab }));
    setActiveTab(nextTab);
    return true;
  };

  const openTab = (tab: SeasonTab) => void requestTabChange(tab);

  const handleTabKeyDown = async (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const tabs = activeGroup.tabs;
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const nextIndex = keys[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab || !(await requestTabChange(nextTab.id))) return;
    window.requestAnimationFrame(() =>
      document.getElementById(`season-tab-${nextTab.id}`)?.focus(),
    );
  };

  return (
    <PageShell ariaLabel={`${game.season.year}年シーズン画面`}>
      <SeasonScoreboard />

      <nav className="season-nav" aria-label="シーズン画面のメニュー">
        <div className="season-nav__groups" role="group" aria-label="表示する分類">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="season-nav__group"
              aria-pressed={group.id === activeGroup.id}
              onClick={() => openTab(lastInGroup[group.id] ?? group.tabs[0]!.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
        {activeGroup.tabs.length > 1 && (
          <div
            role="tablist"
            aria-label={`${activeGroup.label}の表示項目`}
            className="season-nav__tabs"
          >
            {activeGroup.tabs.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  id={`season-tab-${tab.id}`}
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="season-nav__tab"
                  aria-selected={selected}
                  aria-controls={`season-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => openTab(tab.id)}
                  onKeyDown={(event) => void handleTabKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <section
        id={`season-panel-${activeTab}`}
        {...(activeGroup.tabs.length > 1
          ? { role: 'tabpanel', 'aria-labelledby': `season-tab-${activeTab}` }
          : { 'aria-label': activeGroup.tabs[0]!.label })}
        tabIndex={0}
      >
        {activeTab === 'dashboard' && (
          <DashboardTab
            onSelectTeam={(teamKey) => {
              game.setViewTeam(teamKey);
              openTab('teamReport');
            }}
            onOpenYearReview={() => openTab('yearReview')}
          />
        )}
        {activeTab === 'yearReview' && <YearReviewTab />}
        {activeTab === 'news' && <NarrativeTab />}
        {activeTab === 'lineup' && <LineupTab onDirtyChange={setLineupDirty} />}
        {activeTab === 'rotation' && <RotationTab onDirtyChange={setRotationDirty} />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'ranking' && <RankingTab />}
        {activeTab === 'standings' && (
          <StandingsTab
            onSelectTeam={(teamKey) => {
              game.setViewTeam(teamKey);
              openTab('teamReport');
            }}
          />
        )}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'gameResults' && <GameResultsTab />}
        {activeTab === 'teamReport' && <TeamReportTab />}
        {activeTab === 'roster' && <RosterTab />}
        {activeTab === 'squad' && <SquadTab />}
        {activeTab === 'history' && <HistoryTab />}
      </section>
      <GameControlBar />
    </PageShell>
  );
}
