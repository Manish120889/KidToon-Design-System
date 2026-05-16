import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {MascotKind} from './tokens';

interface Props {
  kind: MascotKind;
  bpm: number;
  /** horizontal center as % of 1920 */
  xPct?: number;
  /** vertical center as % of 1080 */
  yPct?: number;
  scale?: number;
}

// Character — bouncing, blinking, with subtle arm sway.
// Built entirely as inline SVG so no asset loading is needed.
export const Character: React.FC<Props> = ({
  kind,
  bpm,
  xPct = 50,
  yPct = 55,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  // Beat sync
  const beatFrames = (60 / bpm) * fps;
  const beat = Math.sin((frame / beatFrames) * Math.PI * 2);
  const squashY = 1 + beat * 0.04;
  const squashX = 1 - beat * 0.04;
  const bobY = Math.sin((frame / beatFrames) * Math.PI * 2) * 14;

  // Blink every ~90 frames
  const blinkCycle = frame % 90;
  const blinking = blinkCycle >= 86;
  const eyeScaleY = blinking ? 0.1 : 1;

  // Arm sway (slower than beat)
  const armSwing = Math.sin(frame / (beatFrames * 1.5)) * 8;

  // Spring entry on first 30 frames
  const entry = spring({frame, fps, config: {damping: 12, stiffness: 200, mass: 0.6}});

  const x = (xPct / 100) * 1920;
  const y = (yPct / 100) * 1080;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y + bobY,
          transform: `translate(-50%, -50%) scale(${scale * entry})`,
          transformOrigin: 'center bottom',
        }}
      >
        <div
          style={{
            transform: `scale(${squashX}, ${squashY})`,
            transformOrigin: 'center bottom',
          }}
        >
          {kind === 'star' && <StarBody armSwing={armSwing} eyeScaleY={eyeScaleY} />}
          {kind === 'bunny' && <BunnyBody armSwing={armSwing} eyeScaleY={eyeScaleY} />}
          {kind === 'sun' && <SunFace eyeScaleY={eyeScaleY} />}
          {kind === 'moon' && <MoonFace eyeScaleY={eyeScaleY} />}
          {kind === 'balloon' && <BalloonBody armSwing={armSwing} eyeScaleY={eyeScaleY} />}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StarBody: React.FC<{armSwing: number; eyeScaleY: number}> = ({armSwing, eyeScaleY}) => (
  <svg width="480" height="560" viewBox="0 0 480 560">
    {/* shadow */}
    <ellipse cx="240" cy="540" rx="120" ry="14" fill="#2A2440" opacity="0.18" />

    {/* legs */}
    <line x1="200" y1="440" x2="184" y2="516" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" />
    <line x1="280" y1="440" x2="296" y2="516" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" />
    <ellipse cx="184" cy="524" rx="28" ry="12" fill="#2A2440" />
    <ellipse cx="296" cy="524" rx="28" ry="12" fill="#2A2440" />

    {/* star body shadow */}
    <path
      d="M240 60 L300 200 L452 220 L336 312 L368 460 L240 384 L112 460 L144 312 L28 220 L180 200 Z"
      fill="#2A2440"
      transform="translate(0 10)"
    />
    {/* star body */}
    <path
      d="M240 60 L300 200 L452 220 L336 312 L368 460 L240 384 L112 460 L144 312 L28 220 L180 200 Z"
      fill="#FFD43D"
      stroke="#2A2440"
      strokeWidth="10"
      strokeLinejoin="round"
    />

    {/* arms */}
    <g transform={`translate(120, 320) rotate(${armSwing})`}>
      <line x1="0" y1="0" x2="-60" y2="40" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" />
      <circle cx="-62" cy="42" r="18" fill="#FFD43D" stroke="#2A2440" strokeWidth="7" />
    </g>
    <g transform={`translate(360, 320) rotate(${-armSwing})`}>
      <line x1="0" y1="0" x2="60" y2="-40" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" />
      <circle cx="62" cy="-42" r="18" fill="#FFD43D" stroke="#2A2440" strokeWidth="7" />
    </g>

    {/* face */}
    <g transform={`translate(200, 260) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <g transform={`translate(280, 260) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <path
      d="M200 304 Q240 340 280 304"
      stroke="#2A2440"
      strokeWidth="10"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="170" cy="296" r="12" fill="#FF6FB0" opacity="0.6" />
    <circle cx="310" cy="296" r="12" fill="#FF6FB0" opacity="0.6" />
  </svg>
);

const BunnyBody: React.FC<{armSwing: number; eyeScaleY: number}> = ({armSwing, eyeScaleY}) => (
  <svg width="440" height="540" viewBox="0 0 440 540">
    <ellipse cx="220" cy="520" rx="120" ry="12" fill="#2A2440" opacity="0.18" />
    {/* ears */}
    <ellipse cx="160" cy="80" rx="28" ry="80" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    <ellipse cx="280" cy="80" rx="28" ry="80" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    <ellipse cx="160" cy="90" rx="12" ry="56" fill="#FF6FB0" />
    <ellipse cx="280" cy="90" rx="12" ry="56" fill="#FF6FB0" />
    {/* body */}
    <ellipse cx="220" cy="380" rx="120" ry="100" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    {/* arms */}
    <g transform={`translate(120, 360) rotate(${armSwing - 20})`}>
      <ellipse cx="0" cy="0" rx="28" ry="46" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    </g>
    <g transform={`translate(320, 360) rotate(${-armSwing + 20})`}>
      <ellipse cx="0" cy="0" rx="28" ry="46" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    </g>
    {/* head */}
    <circle cx="220" cy="220" r="120" fill="#FFFFFF" stroke="#2A2440" strokeWidth="8" />
    {/* eyes */}
    <g transform={`translate(180, 210) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <g transform={`translate(260, 210) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    {/* nose & mouth */}
    <path d="M212 250 L228 250 L220 264 Z" fill="#FF6FB0" stroke="#2A2440" strokeWidth="5" />
    <path d="M220 266 L220 282" stroke="#2A2440" strokeWidth="5" strokeLinecap="round" />
    <path d="M220 282 Q200 298 192 282" stroke="#2A2440" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M220 282 Q240 298 248 282" stroke="#2A2440" strokeWidth="5" strokeLinecap="round" fill="none" />
    {/* cheeks */}
    <circle cx="140" cy="262" r="16" fill="#FF6FB0" opacity="0.55" />
    <circle cx="300" cy="262" r="16" fill="#FF6FB0" opacity="0.55" />
  </svg>
);

const SunFace: React.FC<{eyeScaleY: number}> = ({eyeScaleY}) => (
  <svg width="420" height="420" viewBox="0 0 420 420">
    <g stroke="#2A2440" strokeWidth="10" strokeLinecap="round">
      <line x1="210" y1="20" x2="210" y2="50" />
      <line x1="210" y1="370" x2="210" y2="400" />
      <line x1="20" y1="210" x2="50" y2="210" />
      <line x1="370" y1="210" x2="400" y2="210" />
      <line x1="70" y1="70" x2="90" y2="90" />
      <line x1="330" y1="330" x2="350" y2="350" />
      <line x1="70" y1="350" x2="90" y2="330" />
      <line x1="330" y1="90" x2="350" y2="70" />
    </g>
    <circle cx="210" cy="210" r="150" fill="#2A2440" transform="translate(0 8)" />
    <circle cx="210" cy="210" r="150" fill="#FFD43D" stroke="#2A2440" strokeWidth="10" />
    <g transform={`translate(170, 196) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <g transform={`translate(250, 196) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="14" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <path d="M160 250 Q210 290 260 250" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" fill="none" />
    <circle cx="130" cy="240" r="14" fill="#FF6FB0" opacity="0.6" />
    <circle cx="290" cy="240" r="14" fill="#FF6FB0" opacity="0.6" />
  </svg>
);

const MoonFace: React.FC<{eyeScaleY: number}> = ({eyeScaleY}) => (
  <svg width="420" height="420" viewBox="0 0 420 420">
    <circle cx="210" cy="210" r="180" fill="#2A2440" transform="translate(0 8)" />
    <circle cx="210" cy="210" r="180" fill="#FFF7E6" stroke="#2A2440" strokeWidth="10" />
    <circle cx="260" cy="210" r="160" fill="#5470B8" />
    <g transform={`translate(120, 200) scale(1, ${eyeScaleY})`}>
      <path d="M-20 0 Q-10 14 0 0" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" fill="none" />
    </g>
    <g transform={`translate(190, 200) scale(1, ${eyeScaleY})`}>
      <path d="M-20 0 Q-10 14 0 0" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" fill="none" />
    </g>
    <path d="M120 260 Q160 290 200 260" stroke="#2A2440" strokeWidth="10" strokeLinecap="round" fill="none" />
  </svg>
);

const BalloonBody: React.FC<{armSwing: number; eyeScaleY: number}> = ({armSwing, eyeScaleY}) => (
  <svg width="380" height="500" viewBox="0 0 380 500">
    <ellipse cx="190" cy="190" rx="140" ry="170" fill="#FF6FB0" stroke="#2A2440" strokeWidth="8" />
    <ellipse cx="140" cy="140" rx="30" ry="50" fill="#FFF7E6" opacity="0.5" />
    <path d="M180 360 L200 360 L190 380 Z" fill="#2A2440" />
    <path
      d={`M190 380 Q${170 + armSwing} 430 ${200 - armSwing} 480`}
      stroke="#2A2440"
      strokeWidth="6"
      strokeLinecap="round"
      fill="none"
    />
    <g transform={`translate(170, 180) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="12" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <g transform={`translate(220, 180) scale(1, ${eyeScaleY})`}>
      <circle cx="0" cy="0" r="12" fill="#2A2440" />
      <circle cx="4" cy="-4" r="4" fill="#FFFFFF" />
    </g>
    <path d="M170 220 Q195 240 220 220" stroke="#2A2440" strokeWidth="8" strokeLinecap="round" fill="none" />
  </svg>
);
