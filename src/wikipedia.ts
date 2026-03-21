import vitalArticles from './vitalArticles.json';

export interface RandomArticle {
  id: number;
  title: string;
}

export async function getRandomArticles(): Promise<{
  start: RandomArticle;
  target: RandomArticle;
}> {
  const startTitle = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
  const targetTitle = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];

  return {
    start: { id: 0, title: startTitle },
    target: { id: 0, title: targetTitle },
  };
}
