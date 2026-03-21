const RANDOM_API =
  'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=2&format=json';

export interface RandomArticle {
  id: number;
  title: string;
}

export async function getRandomArticles(): Promise<{
  start: RandomArticle;
  target: RandomArticle;
}> {
  const res = await fetch(RANDOM_API, {
    headers: {
      'User-Agent': 'WikiSpeedrun/1.0 (hackathon project)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Wikipedia API responded with ${res.status}`);
  }

  const data = (await res.json()) as {
    query: { random: { id: number; title: string }[] };
  };

  const [first, second] = data.query.random;
  return {
    start: { id: first.id, title: first.title },
    target: { id: second.id, title: second.title },
  };
}
