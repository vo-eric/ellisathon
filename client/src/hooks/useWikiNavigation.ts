import { useEffect, useRef } from 'react';

interface WikiNavigationOptions {
  /** Current match status — only processes navigation when 'playing'. */
  isPlaying: boolean;
  startTitle: string;
  targetTitle: string;
  /** Send a move message over the WebSocket. */
  sendMove: (article: string, url: string) => void;
  /** Called when the iframe navigates to a new wiki page (updates iframeSrc). */
  onIframeSrcChange: (href: string) => void;
}

export function useWikiNavigation({
  isPlaying,
  startTitle,
  targetTitle,
  sendMove,
  onIframeSrcChange,
}: WikiNavigationOptions) {
  const wikiRef = useRef<HTMLIFrameElement>(null);
  const lastProcessedPageUrlRef = useRef('');
  const hasLeftStartArticleRef = useRef(false);

  const resetRefs = () => {
    lastProcessedPageUrlRef.current = '';
    hasLeftStartArticleRef.current = false;
  };

  const onWikiFrameLoad = () => {
    if (!isPlaying) return;

    const frame = wikiRef.current;
    if (!frame) return;

    try {
      let href = frame.src;
      try {
        if (frame.contentWindow?.location?.href) {
          href = frame.contentWindow.location.href;
        }
      } catch {
        console.log('cross-origin iframe; falling back to frame.src');
      }
      if (!href) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;

      let rawTitle: string | null = null;
      if (url.pathname.startsWith('/wiki/')) {
        rawTitle = decodeURIComponent(url.pathname.replace('/wiki/', ''));
      } else if (url.pathname.startsWith('/api/rest_v1/page/summary/')) {
        rawTitle = decodeURIComponent(
          url.pathname.replace('/api/rest_v1/page/summary/', '')
        );
      } else {
        return;
      }

      if (!rawTitle) return;

      const title = rawTitle.replace(/_/g, ' ');
      const pageUrl = `${url.origin}${url.pathname}${url.search}${url.hash}`;
      if (pageUrl === lastProcessedPageUrlRef.current) return;

      const isStartArticle = title.toLowerCase() === startTitle.toLowerCase();
      if (isStartArticle && !hasLeftStartArticleRef.current) {
        lastProcessedPageUrlRef.current = pageUrl;
        return;
      }

      lastProcessedPageUrlRef.current = pageUrl;

      const isTargetUrl = title.toLowerCase() === targetTitle.toLowerCase();

      sendMove(title, pageUrl);

      if (!isStartArticle) {
        hasLeftStartArticleRef.current = true;
      }

      if (isTargetUrl) return;
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; href?: string } | null;
      if (!data || data.type !== 'wiki:navigated' || !data.href) return;

      try {
        const url = new URL(data.href);
        if (url.pathname.startsWith('/wiki/')) {
          const href = `${url.origin}${url.pathname}${url.search}${url.hash}`;
          onIframeSrcChange(href);
        }
      } catch {
        // Ignore malformed message payloads.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onIframeSrcChange]);

  return { wikiRef, onWikiFrameLoad, resetRefs };
}
