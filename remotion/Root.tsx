import React from 'react';
import {Composition, getInputProps} from 'remotion';
import {MainComposition, MainCompositionProps} from './MainComposition';
import {VIDEO} from './tokens';

// Default preview props (used when running Remotion Studio)
const DEFAULT_PROPS: MainCompositionProps = {
  songId: 'twinkle-twinkle',
  title: 'Twinkle, Twinkle, Little Star',
  palette: 'night',
  mascot: 'star',
  bpm: 100,
  audioSrc: 'audio/twinkle-twinkle.wav',
  lyricEvents: [
    {word: 'Twinkle,', startFrame: 0, endFrame: 30},
    {word: 'twinkle,', startFrame: 30, endFrame: 60},
    {word: 'little', startFrame: 60, endFrame: 90},
    {word: 'star!', startFrame: 90, endFrame: 150},
  ],
};

export const RemotionRoot: React.FC = () => {
  // CLI/render passes --props='{...}' which arrives via getInputProps.
  const inputProps = getInputProps() as Partial<MainCompositionProps>;
  const props = {...DEFAULT_PROPS, ...inputProps};

  // Calculate duration from last lyric event + 2-sec tail.
  const lastEnd = props.lyricEvents.reduce((m, e) => Math.max(m, e.endFrame), 0);
  const durationInFrames = Math.max(lastEnd + 60, 180);

  return (
    <>
      <Composition
        id="KidToonSong"
        component={MainComposition}
        durationInFrames={durationInFrames}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={props}
      />
    </>
  );
};
