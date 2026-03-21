import vitalData from './vitalArticles.json';

const vitalArticles = vitalData.articles;

export interface RandomArticle {
  id: number;
  title: string;
}

export async function getRandomArticles(): Promise<{
  start: RandomArticle;
  target: RandomArticle;
}> {
  const start = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
  const target = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];

  return {
    start: { id: 0, title: start.title },
    target: { id: 0, title: target.title },
  };
}
