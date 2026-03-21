/**
 * Fetches English Wikipedia "Wikipedia:Vital articles/Level 3" wikitext,
 * extracts main-namespace article links (same entries as the on-wiki list),
 * and writes src/vitalArticles.json with { articles: [{ title, url }] }.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', 'vitalArticles.json');
const API =
  'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&titles=Wikipedia:Vital%20articles/Level%203&rvprop=content&format=json&rvslots=main&formatversion=2';

const NON_MAIN_NS =
  /^(Wikipedia|File|Image|Category|Template|Help|User|Talk|Module|MediaWiki|Draft|Special|Portal):/i;

/** Match lobby.ts wikipediaArticleUrl */
function wikipediaArticleUrl(title) {
  const segment = title.trim().replace(/ /g, '_');
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(segment)}`;
}

function extractTitles(wikitext) {
  const seen = new Set();
  const titles = [];
  const linkRe = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
  // Only list rows (nested bullets), matching the on-page Level 3 vital entries.
  const bulletLine = /^\s*(\*{1,6})\s/m;

  for (const line of wikitext.split('\n')) {
    if (!bulletLine.test(line)) continue;
    let m;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(line)) !== null) {
      const target = m[1].trim();
      if (!target || NON_MAIN_NS.test(target)) continue;
      if (seen.has(target)) continue;
      seen.add(target);
      titles.push(target);
    }
  }
  return titles;
}

const res = await fetch(API, {
  headers: {
    'User-Agent': 'Ellisathon/1.0 (local dev; vital articles JSON sync)',
    Accept: 'application/json',
  },
});
if (!res.ok) throw new Error(`API ${res.status}`);
const data = await res.json();
const page = data.query?.pages?.[0];
const wikitext = page?.revisions?.[0]?.slots?.main?.content;
if (!wikitext) throw new Error('No wikitext in API response');

const titles = extractTitles(wikitext);
const payload = {
  articles: titles.map((title) => ({
    title,
    url: wikipediaArticleUrl(title),
  })),
};

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${titles.length} articles to ${OUT}`);
