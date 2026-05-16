import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {PALETTES, PaletteName} from './tokens';

interface Props {
  palette: PaletteName;
  bpm: number;
}

// Parallax landscape. Hills bob to the BPM. Sun/moon drifts slowly.
export const Background: React.FC<Props> = ({palette, bpm}) => {
  const frame = useCurrentFrame();
  const p = PALETTES[palette];
  const isNight = palette === 'night';

  // 30fps, beat period = 60 / bpm seconds = (60 / bpm) * 30 frames
  const beatFrames = (60 / bpm) * 30;
  const beat = Math.sin((frame / beatFrames) * Math.PI * 2);
  const beat2 = Math.sin((frame / beatFrames) * Math.PI * 2 + Math.PI / 3);

  // sun drifts left → right slowly across the loop
  const sunX = interpolate(frame, [0, 9000], [1500, 1700], {extrapolateRight: 'clamp'});
  const sunY = 200 + Math.sin(frame / 120) * 10;

  return (
    <AbsoluteFill>
      {/* Sky gradient */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyMid} 55%, ${p.skyBottom} 100%)`,
        }}
      />

      {/* Stars (night only) */}
      {isNight &&
        [...Array(40)].map((_, i) => {
          const x = (i * 137) % 1920;
          const y = ((i * 91) % 400) + 30;
          const r = 1.5 + ((i * 7) % 5) * 0.4;
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(frame / 30 + i));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                background: '#FFD43D',
                opacity: twinkle,
              }}
            />
          );
        })}

      {/* Sun or moon */}
      <svg
        width="320"
        height="320"
        viewBox="0 0 320 320"
        style={{position: 'absolute', left: sunX - 320, top: sunY}}
      >
        {isNight ? (
          <>
            <circle cx="160" cy="160" r="120" fill="#2A2440" opacity="0.2" transform="translate(0 10)" />
            <circle cx="160" cy="160" r="120" fill="#FFF7E6" stroke="#2A2440" strokeWidth="6" />
            <circle cx="190" cy="160" r="106" fill={p.skyMid} />
            <path d="M115 152 Q125 164 135 152" stroke="#2A2440" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M145 152 Q155 164 165 152" stroke="#2A2440" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M120 188 Q150 200 170 184" stroke="#2A2440" strokeWidth="6" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <circle cx="160" cy="160" r="100" fill="#2A2440" opacity="0.15" transform="translate(0 8)" />
            <circle cx="160" cy="160" r="100" fill="#FFD43D" stroke="#2A2440" strokeWidth="6" />
            <g stroke="#2A2440" strokeWidth="6" strokeLinecap="round">
              <line x1="160" y1="30" x2="160" y2="10" />
              <line x1="160" y1="290" x2="160" y2="310" />
              <line x1="30" y1="160" x2="10" y2="160" />
              <line x1="290" y1="160" x2="310" y2="160" />
              <line x1="68" y1="68" x2="54" y2="54" />
              <line x1="252" y1="252" x2="266" y2="266" />
              <line x1="68" y1="252" x2="54" y2="266" />
              <line x1="252" y1="68" x2="266" y2="54" />
            </g>
            <circle cx="130" cy="148" r="8" fill="#2A2440" />
            <circle cx="190" cy="148" r="8" fill="#2A2440" />
            <path d="M130 188 Q160 210 190 188" stroke="#2A2440" strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="108" cy="178" r="9" fill="#FF6FB0" opacity="0.6" />
            <circle cx="212" cy="178" r="9" fill="#FF6FB0" opacity="0.6" />
          </>
        )}
      </svg>

      {/* Clouds — drift right to left, wrap */}
      {[
        {y: 200, scale: 1, speed: 0.8, offset: 0},
        {y: 320, scale: 0.7, speed: 0.5, offset: 600},
        {y: 140, scale: 0.55, speed: 0.6, offset: 1200},
      ].map((c, i) => {
        const x = (((c.offset - frame * c.speed) % 2400) + 2400) % 2400 - 200;
        return (
          <svg
            key={i}
            viewBox="0 0 200 100"
            width={200 * c.scale}
            style={{position: 'absolute', left: x, top: c.y}}
          >
            <path
              d="M40 80 C10 80 0 50 30 40 C20 10 80 0 90 30 C110 10 160 20 150 50 C190 50 200 90 160 90 Z"
              fill={isNight ? '#5470B8' : '#FFFFFF'}
              stroke="#2A2440"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}

      {/* Back hills — bob slightly */}
      <svg
        viewBox="0 0 1920 400"
        width="1920"
        height="400"
        style={{position: 'absolute', left: 0, bottom: 280 + beat * 4}}
      >
        <path
          d="M-50 360 C 280 220 560 280 880 260 C 1200 240 1500 300 1970 220 L 1970 400 L -50 400 Z"
          fill={p.hillBack}
          stroke="#2A2440"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Mid hills */}
      <svg
        viewBox="0 0 1920 400"
        width="1920"
        height="400"
        style={{position: 'absolute', left: 0, bottom: 180 + beat2 * 6}}
      >
        <path
          d="M-50 380 C 320 280 660 360 1080 320 C 1380 290 1680 350 1970 310 L 1970 400 L -50 400 Z"
          fill={p.hillMid}
          stroke="#2A2440"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Front grass */}
      <svg
        viewBox="0 0 1920 300"
        width="1920"
        height="300"
        style={{position: 'absolute', left: 0, bottom: 0}}
      >
        <path
          d="M-50 200 C 380 150 820 190 1240 170 C 1520 156 1720 190 1970 170 L 1970 300 L -50 300 Z"
          fill={p.grass}
          stroke="#2A2440"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
    </AbsoluteFill>
  );
};
