const WP_ORIGIN = 'https://en.wikipedia.org';

/**
 * Resolves a stored move URL or article title to a full Wikipedia href (new-tab safe).
 */
export function wikiArticleHref(
  url: string | undefined | null,
  article: string
): string {
  const u = url?.trim() ?? '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/wiki/')) return `${WP_ORIGIN}${u}`;
  const segment = article.trim().replace(/ /g, '_');
  return `${WP_ORIGIN}/wiki/${encodeURIComponent(segment)}`;
}
