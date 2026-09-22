export interface InitialListState<T> {
  items: T[];
  loading: boolean;
}

export function initialListState<T>(items: T[]): InitialListState<T> {
  return { items, loading: false };
}
