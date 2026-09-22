export interface PostListFilter {
  type?: string;
  status?: string;
  neighborhood?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
}

export function buildPostQuery(filter: PostListFilter = {}): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.type) query.set("type", filter.type);
  if (filter.status) query.set("status", filter.status);
  if (filter.neighborhood) query.set("neighborhood", filter.neighborhood);
  if (filter.authorId) query.set("author_id", filter.authorId);
  query.set("limit", String(filter.limit ?? 20));
  query.set("offset", String(filter.offset ?? 0));
  return query;
}
