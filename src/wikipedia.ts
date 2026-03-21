import vitalData from './vitalArticles.json';
import type { Article } from './types';

const vitalArticles = vitalData.articles as Article[];

export async function getRandomArticles(): Promise<{
  start: Article;
  target: Article;
}> {
  const start = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
  const target =
    vitalArticles[Math.floor(Math.random() * vitalArticles.length)];

  return { start, target };
}
