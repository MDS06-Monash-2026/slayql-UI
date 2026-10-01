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

// Where an element is relative to the viewport, updated both ways as you scroll:
// 'in' (on screen), 'below' (not reached yet) or 'above' (scrolled past).
export function useScrollPosition(options = { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(() => (prefersReducedMotion() ? 'in' : 'below'));
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') { setPosition('in'); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setPosition('in');
      else setPosition(entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) ? 'above' : 'below');
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, position];
}

// Animates an element in as it enters the viewport and out as it leaves, in either scroll
// direction: scrolling down it rises in from below, scrolling up it drops in from above.
// `variant`: up (default), blur, scale, left or right. `delay` staggers siblings (ms).
// `once` keeps it visible after the first reveal.
export function Reveal({ as: Tag = 'div', variant = 'up', delay = 0, once = false, className = '', children, ...rest }) {
  const [ref, position] = useScrollPosition();
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (position === 'in') setSeen(true); }, [position]);
  const shown = position === 'in' || (once && seen);
  return (
    <Tag
      ref={ref}
      className={`rv rv-${variant} ${shown ? 'rv-in' : position === 'above' ? 'rv-above' : ''} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// The same two-way behaviour for older sections that use the .reveal / .is-visible classes.
// Returns a cleanup function.
export function observeRevealClasses(elements, threshold = 0.1) {
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    elements.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => entries.forEach((e) => {
    const above = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0);
    e.target.classList.toggle('is-visible', e.isIntersecting);
    e.target.classList.toggle('is-above', above);
  }), { threshold });
  elements.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}

// Animates a number from `from` to `to` once `active` is true.
export function useCountFromTo(from, to, active, duration = 1400) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : from));
  useEffect(() => {
    if (!active || prefersReducedMotion()) { if (active || prefersReducedMotion()) setValue(to); return undefined; }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
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
