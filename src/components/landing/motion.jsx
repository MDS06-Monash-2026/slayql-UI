import React, { useEffect, useRef, useState } from 'react';

// Shared scroll motion for the landing page. Everything here uses IntersectionObserver
// (no scroll listeners) and shows the final state at once when reduced motion is requested.

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// True once the element has scrolled into view (and stays true).
export function useInView(options = { threshold: 0.25 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return undefined;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  return [ref, inView];
}

// Fades an element in as it enters the viewport. `variant` picks the entrance:
// up (default), blur, scale, left or right. `delay` staggers siblings (ms).
export function Reveal({ as: Tag = 'div', variant = 'up', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView({ threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  return (
    <Tag
      ref={ref}
      className={`rv rv-${variant} ${inView ? 'rv-in' : ''} ${className}`}
      style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Animates a number from `from` to `to` once `active` is true.
export function useCountFromTo(from, to, active, duration = 1400) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : from));
  useEffect(() => {
    if (!active || prefersReducedMotion()) { if (active || prefersReducedMotion()) setValue(to); return undefined; }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, active, duration]);
  return value;
}

// A thin reading-progress bar driven by CSS scroll timelines (hidden where unsupported).
export function ScrollProgress() {
  return <div aria-hidden="true" className="scroll-progress" />;
}

// Cursor-following glow for cards: sets --mx / --my on the element (pointer only, no scroll).
export function spotlight(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
}
