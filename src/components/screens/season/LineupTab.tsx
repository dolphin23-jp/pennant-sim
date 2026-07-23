import { Card, EmptyState, SectionTitle } from '../../ui';

export function LineupTab() {
  return (
    <Card ariaLabel="編成画面準備中">
      <SectionTitle>Lineup Editor</SectionTitle>
      <EmptyState>打順・守備位置の手動編成はフェーズ4で追加します。</EmptyState>
    </Card>
  );
}
