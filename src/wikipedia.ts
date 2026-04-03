import vitalData from './vitalArticles.json';

const vitalArticles = vitalData.articles;

export interface RandomArticle {
  url: string;
  title: string;
}

export async function getRandomArticles(): Promise<{
  start: RandomArticle;
  target: RandomArticle;
}> {
  const start = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
  const target =
    vitalArticles[Math.floor(Math.random() * vitalArticles.length)];

  return {
    start: { title: start.title, url: start.url },
    target: { title: target.title, url: start.url },
  };
}
