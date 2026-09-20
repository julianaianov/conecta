export function initialListState<T>(items: T[]): { items: T[]; loading: boolean } {
  return { items, loading: false };
}
