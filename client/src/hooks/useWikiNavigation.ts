import { useCallback, useEffect, useRef } from 'react';

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

function extractTitleFromPathname(pathname: string): string | null {
  if (pathname.startsWith('/wiki/')) {
    return decodeURIComponent(pathname.replace('/wiki/', '')).replace(
      /_/g,
      ' '
    );
  }
  if (pathname.startsWith('/api/rest_v1/page/summary/')) {
    return decodeURIComponent(
      pathname.replace('/api/rest_v1/page/summary/', '')
    ).replace(/_/g, ' ');
  }
  return null;
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

  const isPlayingRef = useRef(isPlaying);
  const startTitleRef = useRef(startTitle);
  const targetTitleRef = useRef(targetTitle);
  const sendMoveRef = useRef(sendMove);
  isPlayingRef.current = isPlaying;
  startTitleRef.current = startTitle;
  targetTitleRef.current = targetTitle;
  sendMoveRef.current = sendMove;

  const resetRefs = () => {
    lastProcessedPageUrlRef.current = '';
    hasLeftStartArticleRef.current = false;
  };

  const processNavigation = useCallback((href: string) => {
    if (!isPlayingRef.current) return;

    try {
      const url = new URL(href);
      const title = extractTitleFromPathname(url.pathname);
      if (!title) return;

      const pageUrl = `${url.origin}${url.pathname}${url.search}${url.hash}`;
      if (pageUrl === lastProcessedPageUrlRef.current) return;

      const isStartArticle =
        title.toLowerCase() === startTitleRef.current.toLowerCase();
      if (isStartArticle && !hasLeftStartArticleRef.current) {
        lastProcessedPageUrlRef.current = pageUrl;
        return;
      }

      lastProcessedPageUrlRef.current = pageUrl;

      if (!isStartArticle) {
        hasLeftStartArticleRef.current = true;
      }

      sendMoveRef.current(title, pageUrl);
    } catch (e) {
      console.log(e);
    }
  }, []);

  const onWikiFrameLoad = () => {
    if (!isPlaying) return;
    const frame = wikiRef.current;
    if (!frame) return;

    try {
      const href = frame.contentWindow?.location?.href;
      if (href) processNavigation(href);
    } catch {
      // Cross-origin — handled by postMessage bridge instead.
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
          processNavigation(href);
        }
      } catch {
        // Ignore malformed message payloads.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onIframeSrcChange, processNavigation]);

  return { wikiRef, onWikiFrameLoad, resetRefs };
}
