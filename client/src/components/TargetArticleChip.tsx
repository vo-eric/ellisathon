import { useEffect, useRef, useState } from 'react';

interface Props {
  title: string;
}

export function TargetArticleChip({ title }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!title) return;
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.extract) setSummary(d.extract.split('. ')[0] + '.');
      })
      .catch(() => {});
  }, [title]);

  const handleMouseEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  };

  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  };

  const handleClick = () => {
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
      title.replace(/ /g, '_')
    )}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <span
      className='target-chip-wrapper'
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className='game-article-name target'
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
        }}
      >
        {title}
      </span>
      {visible && summary && <span className='target-tooltip'>{summary}</span>}
    </span>
  );
}
