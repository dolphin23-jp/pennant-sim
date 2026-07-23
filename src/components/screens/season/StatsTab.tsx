import { Card, EmptyState, SectionTitle } from '../../ui';

export function StatsTab() {
  return (
    <Card ariaLabel="成績画面準備中">
      <SectionTitle>Player Stats</SectionTitle>
      <EmptyState>今季・通算・年度別の成績テーブルはフェーズ2で追加します。</EmptyState>
    </Card>
  );
}
