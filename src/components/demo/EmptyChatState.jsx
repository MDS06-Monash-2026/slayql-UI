import React, { useState, useEffect } from 'react';

const PHRASES = [
  { main: 'Back on', accent: 'it.' },
  { main: 'Ready to', accent: 'slay.' },
  { main: 'What shall we', accent: 'explore?' },
  { main: 'Ask your data', accent: 'anything.' },
  { main: 'No SQL?', accent: 'No problem.' },
];

export default function EmptyChatState() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % PHRASES.length);
        setFade(true);
      }, 350);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const current = PHRASES[index];

  return (
    <div className="w-full max-w-3xl mx-auto text-center flex flex-col items-center justify-center animate-fade-in-up select-none my-auto">
      {/* Large Fancy Minimal Typography — Vertically Centered */}
      <div className="min-h-[96px] sm:min-h-[120px] flex items-center justify-center">
        <h1
          className={`empty-chat-fancy-title text-5xl sm:text-6xl md:text-7xl font-bold transition-all duration-350 transform ${
            fade ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-3 scale-98'
          }`}
        >
          <span>{current.main} </span>
          <span className="fancy-accent">{current.accent}</span>
        </h1>
      </div>
    </div>
  );
}
