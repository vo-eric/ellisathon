import { Router, Request, Response } from 'express';

const WIKI_BASE = 'https://en.wikipedia.org';

export function createWikiProxy(): Router {
  const router = Router();
  const navBridgeScript = `<script>(function(){var post=function(href){try{window.parent&&window.parent.postMessage({type:'wiki:navigated',href:href},'*');}catch(_){}};var postCurrent=function(){post(window.location.href);};postCurrent();window.addEventListener('pageshow',postCurrent);window.addEventListener('popstate',postCurrent);window.addEventListener('hashchange',postCurrent);document.addEventListener('click',function(ev){var target=ev.target;if(!(target instanceof Element))return;var link=target.closest('a[href]');if(!link)return;var href=link.getAttribute('href');if(!href)return;try{post(new URL(href,window.location.href).href);}catch(_){}} ,true);})();</script>`;

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
        // Keep article navigation same-origin so iframe URL can be read client-side.
        .replace(/href="\/wiki\//g, 'href="/wiki/')
        .replace(/href='\/wiki\//g, "href='/wiki/")
        .replace(
          /href="\/api\/rest_v1\/page\/summary\/([^"]+)"/g,
          'href="/wiki/$1"'
        )
        .replace(
          /href='\/api\/rest_v1\/page\/summary\/([^']+)'/g,
          "href='/wiki/$1'"
        )
        .replace(/href="https:\/\/en\.wikipedia\.org\/wiki\//g, 'href="/wiki/')
        .replace(/href='https:\/\/en\.wikipedia\.org\/wiki\//g, "href='/wiki/")
        .replace(/href="\/\/en\.wikipedia\.org\/wiki\//g, 'href="/wiki/')
        .replace(/href='\/\/en\.wikipedia\.org\/wiki\//g, "href='/wiki/")
        .replace(/href="http:\/\/en\.wikipedia\.org\/wiki\//g, 'href="/wiki/')
        .replace(/href='http:\/\/en\.wikipedia\.org\/wiki\//g, "href='/wiki/")
        // Non-article assets can remain direct.
        .replace(/href="\/w\//g, `href="${WIKI_BASE}/w/`)
        .replace(/href='\/w\//g, `href='${WIKI_BASE}/w/`)
        .replace(/href="\/\/upload/g, `href="https://upload`)
        .replace(/href='\/\/upload/g, `href='https://upload`);

      const bridged = rewritten.includes('</body>')
        ? rewritten.replace('</body>', `${navBridgeScript}</body>`)
        : `${rewritten}${navBridgeScript}`;

      res.send(bridged);
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
