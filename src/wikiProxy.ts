const WIKI_BASE = 'https://en.wikipedia.org';

const navBridgeScript = `<script>(function(){var post=function(href){try{window.parent&&window.parent.postMessage({type:'wiki:navigated',href:href},'*');}catch(_){}};var postCurrent=function(){post(window.location.href);};postCurrent();window.addEventListener('pageshow',postCurrent);window.addEventListener('popstate',postCurrent);window.addEventListener('hashchange',postCurrent);document.addEventListener('click',function(ev){var target=ev.target;if(!(target instanceof Element))return;var link=target.closest('a[href]');if(!link)return;var href=link.getAttribute('href');if(!href)return;try{post(new URL(href,window.location.href).href);}catch(_){}} ,true);})();</script>`;

export async function handleWikiProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wikiPath = url.pathname.replace(/^\/wiki/, '');
  const targetUrl = `${WIKI_BASE}/wiki${wikiPath}${url.search}`;

  try {
    const wikiRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'WikiSpeedrun/1.0 (hackathon project)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    const contentType = wikiRes.headers.get('content-type') || 'text/html';
    const html = await wikiRes.text();

    const rewritten = html
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
      .replace(/href="\/w\//g, `href="${WIKI_BASE}/w/`)
      .replace(/href='\/w\//g, `href='${WIKI_BASE}/w/`)
      .replace(/href="\/\/upload/g, `href="https://upload`)
      .replace(/href='\/\/upload/g, `href='https://upload`);

    const bridged = rewritten.includes('</body>')
      ? rewritten.replace('</body>', `${navBridgeScript}</body>`)
      : `${rewritten}${navBridgeScript}`;

    return new Response(bridged, {
      status: wikiRes.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('Wiki proxy error:', err);
    return new Response('Failed to load Wikipedia page.', { status: 502 });
  }
}

export async function handleWikiAssetProxy(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${WIKI_BASE}${url.pathname}${url.search}`;

  try {
    const wikiRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'WikiSpeedrun/1.0 (hackathon project)',
        Accept: '*/*',
      },
      redirect: 'follow',
    });

    const headers = new Headers();
    const contentType = wikiRes.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    const cacheControl = wikiRes.headers.get('cache-control');
    if (cacheControl) headers.set('Cache-Control', cacheControl);

    return new Response(wikiRes.body, {
      status: wikiRes.status,
      headers,
    });
  } catch (err) {
    console.error('Wiki asset proxy error:', err);
    return new Response('Failed to load Wikipedia asset.', { status: 502 });
  }
}
