import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONTS} from './tokens';

export interface LyricEvent {
  word: string;
  startFrame: number;
  endFrame: number;
}

interface Props {
  events: LyricEvent[];
}

// Karaoke-style bouncy lyrics in the bottom third.
// Active word scales up with spring + Sunshine-Deep color.
export const Subtitles: React.FC<Props> = ({events}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Find the currently-active line (group of words sharing the same line index)
  // For simplicity, each event has startFrame/endFrame; we render the current line.
  // A "line" is the contiguous run of events whose ranges cover this frame.
  const activeEventIndex = events.findIndex((e) => frame >= e.startFrame && frame < e.endFrame);
  if (activeEventIndex === -1) return null;

  // Find the line boundaries — walk left & right while events are adjacent (gap < 6 frames).
  let lineStart = activeEventIndex;
  while (
    lineStart > 0 &&
    events[lineStart].startFrame - events[lineStart - 1].endFrame < 6
  ) {
    lineStart--;
  }
  let lineEnd = activeEventIndex;
  while (
    lineEnd < events.length - 1 &&
    events[lineEnd + 1].startFrame - events[lineEnd].endFrame < 6
  ) {
    lineEnd++;
  }
  const line = events.slice(lineStart, lineEnd + 1);

  return (
    <AbsoluteFill>
      {/* Protection gradient at bottom */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '40%',
          background: `linear-gradient(180deg, transparent, ${COLORS.cream}E6 60%, ${COLORS.cream})`,
        }}
      />

      {/* Lyric line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 120,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          padding: '0 80px',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {line.map((event, i) => {
          const isActive = frame >= event.startFrame && frame < event.endFrame;
          const localFrame = frame - event.startFrame;
          const pop = spring({
            frame: localFrame,
            fps,
            config: {damping: 9, stiffness: 220, mass: 0.5},
          });
          const scale = isActive ? 0.5 + pop * 0.5 + Math.sin(localFrame / 2) * 0.02 : 1;
          const rotation = isActive ? (1 - pop) * -8 : 0;
          const past = frame >= event.endFrame;

          return (
            <span
              key={i}
              style={{
                fontFamily: FONTS.display,
                fontWeight: 700,
                fontSize: 92,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                color: isActive ? COLORS.sunshineDeep : past ? COLORS.ink : COLORS.ink,
                WebkitTextStroke: `14px ${COLORS.cream}`,
                paintOrder: 'stroke fill',
                textShadow: `0 6px 0 rgba(42,36,64,0.2), 0 12px 24px rgba(42,36,64,0.25)`,
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: 'center bottom',
                display: 'inline-block',
              }}
            >
              {event.word}
            </span>
          );
        })}
      </div>

      {/* KidToon watermark — bottom right */}
      <div
        style={{
          position: 'absolute',
          right: 40,
          bottom: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: COLORS.cream,
          padding: '8px 18px',
          borderRadius: 999,
          border: `3px solid ${COLORS.ink}`,
          boxShadow: '0 4px 0 rgba(42,36,64,0.2)',
          opacity: 0.92,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 96 96">
          <path
            d="M48 8 L60 32 L86 36 L66 54 L72 80 L48 66 L24 80 L30 54 L10 36 L36 32 Z"
            fill={COLORS.sunshine}
            stroke={COLORS.ink}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <circle cx="38" cy="46" r="4" fill={COLORS.ink} />
          <circle cx="58" cy="46" r="4" fill={COLORS.ink} />
        </svg>
        <span
          style={{
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: '-0.02em',
            color: COLORS.ink,
          }}
        >
          <span style={{color: COLORS.skyDeep}}>Kid</span>
          <span style={{color: COLORS.berry}}>Toon</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
