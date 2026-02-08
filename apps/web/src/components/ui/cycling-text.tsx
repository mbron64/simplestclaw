'use client';
import { useState, useEffect } from 'react';
import { TextRoll } from './text-roll';

export type CyclingTextProps = {
  words: string[];
  interval?: number;
  className?: string;
};

export function CyclingText({ 
  words, 
  interval = 2500, 
  className 
}: CyclingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
      setKey((prev) => prev + 1);
    }, interval);

    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <TextRoll 
      key={key} 
      className={className}
      duration={0.3}
      getEnterDelay={(i) => i * 0.03}
      getExitDelay={(i) => i * 0.03}
    >
      {words[currentIndex]}
    </TextRoll>
  );
}
