export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const fromIndex = ids.indexOf(activeId);
  const toIndex = ids.indexOf(overId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids;
  const reordered = [...ids];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) return ids;
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

export function swapRecordValues<Key extends string, Value>(
  record: Record<Key, Value>,
  firstKey: Key,
  secondKey: Key,
): Record<Key, Value> {
  if (firstKey === secondKey) return record;
  return {
    ...record,
    [firstKey]: record[secondKey],
    [secondKey]: record[firstKey],
  };
}
