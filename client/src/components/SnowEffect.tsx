import { useEffect, useState } from "react";

export function SnowEffect() {
  const [snowflakes, setSnowflakes] = useState<Array<{ 
    id: number; 
    left: number; 
    animationDuration: number; 
    opacity: number;
    size: number;
    delay: number;
  }>>([]);

  useEffect(() => {
    const count = 30; // Capped at 30 as requested
    const newSnowflakes = Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      animationDuration: Math.random() * 15 + 15, // Much slower: 15-30s
      opacity: Math.random() * 0.5 + 0.2,
      size: Math.random() * 0.6 + 0.4, // 0.4rem to 1rem
      delay: Math.random() * 20,
    }));
    setSnowflakes(newSnowflakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute top-[-50px] text-cyan-400/60 animate-snow select-none terminal-text"
          style={{
            left: `${flake.left}%`,
            fontSize: `${flake.size}rem`,
            opacity: flake.opacity,
            animationDuration: `${flake.animationDuration}s`,
            animationDelay: `-${flake.delay}s`,
            textShadow: '0 0 8px rgba(0, 255, 255, 0.5), 0 0 12px rgba(0, 255, 255, 0.3)',
            filter: 'hue-rotate(180deg)',
          }}
        >
          {Math.random() > 0.5 ? '❄' : '✦'}
        </div>
      ))}
    </div>
  );
}
