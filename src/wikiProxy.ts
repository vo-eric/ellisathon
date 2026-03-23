import { Router, Request, Response } from 'express';

const WIKI_BASE = 'https://en.wikipedia.org';

export function createWikiProxy(): Router {
  const router = Router();

  router.get('/*path', async (req: Request, res: Response) => {
    const wikiPath = req.originalUrl.replace(/^\/wiki/, '');
    const targetUrl = `${WIKI_BASE}/wiki${wikiPath}`;

    try {
      const wikiRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'WikiSpeedrun/1.0 (hackathon project)',
          Accept: 'text/html',
        },
        redirect: 'follow',
      });

      const contentType = wikiRes.headers.get('content-type') || 'text/html';
      res.setHeader('Content-Type', contentType);

      const html = await wikiRes.text();

      const rewritten = html
        .replace(/href="\/wiki\//g, 'href="/wiki/')
        .replace(
          /href="\/api\/rest_v1\/page\/summary\/([^"]+)"/g,
          'href="/wiki/$1"'
        )
        .replace(/href="\/w\//g, `href="${WIKI_BASE}/w/`)
        .replace(/href="\/\/upload/g, `href="https://upload`);

      res.send(rewritten);
    } catch (err) {
      console.error('Wiki proxy error:', err);
      res.status(502).send('Failed to load Wikipedia page.');
    }
  });

  return router;
}

export function createWikiAssetProxy(): Router {
  const router = Router();

  router.get('/*path', async (req: Request, res: Response) => {
    const targetUrl = `${WIKI_BASE}${req.originalUrl}`;

    try {
      const wikiRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'WikiSpeedrun/1.0 (hackathon project)',
          Accept: '*/*',
        },
        redirect: 'follow',
      });

      res.status(wikiRes.status);
      const contentType = wikiRes.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      const cacheControl = wikiRes.headers.get('cache-control');
      if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
      }

      const body = Buffer.from(await wikiRes.arrayBuffer());
      res.send(body);
    } catch (err) {
      console.error('Wiki asset proxy error:', err);
      res.status(502).send('Failed to load Wikipedia asset.');
    }
  });

  return router;
}
