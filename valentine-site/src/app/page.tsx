'use client';

import Image from 'next/image';
import { useState } from 'react';

const DISTANCE = 100;
const HEART_COUNT = 12;

type Offset = { x: number; y: number };

type Heart = {
  id: number;
  delay: number;
  left: number;
  duration: number;
  scale: number;
};

const generateHearts = (): Heart[] =>
  Array.from({ length: HEART_COUNT }).map((_, index) => ({
    id: index,
    delay: Math.random() * 4,
    left: Math.random() * 100,
    duration: 6 + Math.random() * 4,
    scale: 0.8 + Math.random() * 0.8,
  }));

const randomOffset = (): Offset => {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.round(Math.cos(angle) * DISTANCE),
    y: Math.round(Math.sin(angle) * DISTANCE),
  };
};

export default function Home() {
  const [noOffset, setNoOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saidYes, setSaidYes] = useState(false);
  const [floatingHearts] = useState<Heart[]>(generateHearts);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-200 via-pink-100 to-amber-100 px-4">
      <div className="absolute inset-0 overflow-hidden">
        {floatingHearts.map((heart) => (
          <span
            key={heart.id}
            className="absolute text-4xl text-rose-200"
            style={{
              left: `${heart.left}%`,
              animation: `float ${heart.duration}s ease-in-out ${heart.delay}s infinite`,
              transform: `scale(${heart.scale})`,
            }}
          >
            ❤
          </span>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md rounded-[32px] bg-white/90 p-8 text-center shadow-2xl backdrop-blur">
        <div className="mb-6 flex justify-center">
          <Image
            src="/valentine.gif"
            alt="Cute love animation"
            width={260}
            height={260}
            className="rounded-3xl border-4 border-white shadow-lg"
            priority
          />
        </div>

        <h1 className="text-3xl font-semibold text-rose-600 drop-shadow-sm">
          Bello, will u be mi valentine?
        </h1>

        {saidYes ? (
          <div className="mt-10 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 p-4 text-white shadow-lg">
            <p className="text-lg font-semibold">Yaayy, mi pook is mi valentine 💞</p>
          </div>
        ) : (
          <div className="relative mt-10 flex h-32 items-start justify-center gap-6">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setSaidYes(true)}
                className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
              >
                Yes 💗
              </button>
              <button
                onClick={() => setNoOffset(randomOffset())}
                className="rounded-full border border-rose-300 bg-white/80 px-8 py-3 text-lg font-semibold text-rose-500 shadow hover:bg-white"
                style={{
                  transform: `translate(${noOffset.x}px, ${noOffset.y}px)`,
                  transition: 'transform 0.2s ease',
                  position: 'relative',
                }}
              >
                No 🙈
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes float {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(-120px) scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
