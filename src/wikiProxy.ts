const WIKI_BASE = 'https://en.wikipedia.org';

const navBridgeScript = `<script>(function(){var post=function(href){try{window.parent&&window.parent.postMessage({type:'wiki:navigated',href:href},'*');}catch(_){}};var postCurrent=function(){post(window.location.href);};postCurrent();window.addEventListener('pageshow',postCurrent);window.addEventListener('popstate',postCurrent);window.addEventListener('hashchange',postCurrent);document.addEventListener('click',function(ev){var target=ev.target;if(!(target instanceof Element))return;var link=target.closest('a[href]');if(!link)return;var href=link.getAttribute('href');if(!href)return;try{post(new URL(href,window.location.href).href);}catch(_){}} ,true);})();</script>`;

// Injected into every proxied Wikipedia page.
// - Hides the table-of-contents sidebar (Vector 2022 + classic skin).
// - Hides the hover page-preview cards from the Popups extension.
const wikiChromeStyle = `<style id="wikispeedrun-chrome">
  /* Hide header / nav / search / menus (Vector + legacy). */
  header,
  #mw-head,
  #mw-head-base,
  #mw-header,
  #mw-top,
  .vector-header,
  .vector-header-container,
  .vector-sticky-header,
  .vector-sticky-header-container,
  .vector-main-menu,
  #vector-main-menu-dropdown,
  #vector-user-links,
  #vector-user-links-dropdown,
  #p-personal,
  #p-search,
  #right-navigation,
  #left-navigation,
  #mw-navigation { display: none !important; }

  /* Hide side rails / tools (incl. Appearance) so only article remains. */
  #mw-panel,
  .vector-sidebar,
  .vector-column-start,
  .vector-column-end,
  .vector-page-tools,
  .vector-page-tools-landmark,
  .vector-page-tools-container,
  .vector-appearance,
  #vector-appearance,
  #vector-page-tools-dropdown,
  #vector-page-tools { display: none !important; }

  /* Reclaim space when rails are hidden. */
  #content,
  #mw-content-text,
  .mw-body,
  .mw-body-content { margin: 0 auto !important; }

  /* Hide the "From Wikipedia, the free encyclopedia" line. */
  #siteSub,
  #contentSub { display: none !important; }

  /* Hide page protection indicator (semi-protected lock). */
  #mw-indicator-protectedpage,
  #mw-indicator-pp-protected,
  .mw-indicators,
  .mw-indicator,
  .mw-protection-indicator,
  .protection-indicator { display: none !important; }

  /* Hide inline citation markers like [1], [2], etc. */
  sup.reference,
  a[role="doc-noteref"],
  .mw-references-wrap,
  ol.references,
  .references { display: none !important; }

  #vector-toc,
  #mw-panel-toc,
  #vector-toc-pinned-container,
  .vector-toc-pinned-container,
  #vector-page-titlebar-toc,
  #vector-sticky-header-toc,
  #toc,
  .toc,
  .toc-sidebar { display: none !important; }

  .mwe-popups,
  .mwe-popups-container,
  .mwe-popups-type-page,
  .mwe-popups-type-generic,
  .mwe-popups-type-reference { display: none !important; pointer-events: none !important; }
</style>`;

// Disables the Popups extension hover listeners (defence in depth on top of CSS).
const disablePopupsScript = `<script>(function(){try{document.cookie='mwe-popups-enabled=0; path=/; max-age=31536000';}catch(_){}})();</script>`;

// Removes whole sections we don't want visible in the iframe (header + content).
const stripSectionsScript = `<script>(function(){
  function removeSectionById(id){
    var headline=document.getElementById(id);
    if(!headline) return;
    // Wikipedia typically uses: <h2><span class="mw-headline" id="...">...</span></h2>
    var h=headline.closest('h2, h3, h4');
    if(!h) return;
    var node=h;
    while(node){
      var next=node.nextElementSibling;
      node.remove();
      if(!next) break;
      if(next.matches && next.matches('h2, h3, h4')) break;
      node=next;
    }
  }
  function run(){
    removeSectionById('References');
    removeSectionById('External_links');
    removeSectionById('Further_reading');
    removeSectionById('Citations');
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();</script>`;

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

    const withChrome = rewritten.includes('</head>')
      ? rewritten.replace(
          '</head>',
          `${wikiChromeStyle}${disablePopupsScript}${stripSectionsScript}</head>`
        )
      : `${wikiChromeStyle}${disablePopupsScript}${stripSectionsScript}${rewritten}`;

    const bridged = withChrome.includes('</body>')
      ? withChrome.replace('</body>', `${navBridgeScript}</body>`)
      : `${withChrome}${navBridgeScript}`;

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
