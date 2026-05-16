import React from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import {Background} from './Background';
import {Character} from './Character';
import {Subtitles, LyricEvent} from './Subtitles';
import {PaletteName, MascotKind} from './tokens';

export interface MainCompositionProps {
  songId: string;
  title: string;
  palette: PaletteName;
  mascot: MascotKind;
  bpm: number;
  lyricEvents: LyricEvent[];
  audioSrc: string; // public-folder path
}

export const MainComposition: React.FC<MainCompositionProps> = ({
  palette,
  mascot,
  bpm,
  lyricEvents,
  audioSrc,
}) => {
  return (
    <AbsoluteFill style={{background: '#FFF7E6'}}>
      <Background palette={palette} bpm={bpm} />
      <Character kind={mascot} bpm={bpm} xPct={50} yPct={50} scale={0.85} />
      <Subtitles events={lyricEvents} />
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};
