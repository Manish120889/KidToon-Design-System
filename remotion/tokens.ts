// KidToon brand tokens — mirrors colors_and_type.css from the design system.
// Keep in sync with /colors_and_type.css.

export const COLORS = {
  // primary palette
  sunshine: '#FFD43D',
  sunshineDeep: '#E8A100',
  sunshineSoft: '#FFF2B8',

  sky: '#4FB8FF',
  skyDeep: '#1A6FB8',
  skySoft: '#D9F0FF',

  grass: '#5DCB6E',
  grassDeep: '#2A8C3A',
  grassSoft: '#D9F5DD',

  berry: '#FF6FB0',
  berryDeep: '#C73B7E',
  berrySoft: '#FFD9E8',

  candy: '#FF5252',
  candyDeep: '#C53030',

  // neutrals
  cream: '#FFF7E6',
  cloud: '#FFFFFF',
  mist: '#ECE4D2',
  ink: '#2A2440',
} as const;

export const PALETTES = {
  day: {
    skyTop: '#A5DCFF',
    skyMid: '#D9F0FF',
    skyBottom: '#FFF2B8',
    hillBack: '#A8E0AA',
    hillMid: '#7FD08A',
    grass: '#5DCB6E',
  },
  night: {
    skyTop: '#2A3A78',
    skyMid: '#5470B8',
    skyBottom: '#A5BFE8',
    hillBack: '#3A5090',
    hillMid: '#2A3F78',
    grass: '#1F2F60',
  },
  pink: {
    skyTop: '#FFD9E8',
    skyMid: '#FFE8F0',
    skyBottom: '#FFF7E6',
    hillBack: '#FFC0D8',
    hillMid: '#FF6FB0',
    grass: '#C73B7E',
  },
  grass: {
    skyTop: '#D9F5DD',
    skyMid: '#EAF8EC',
    skyBottom: '#FFF7E6',
    hillBack: '#A8E0AA',
    hillMid: '#5DCB6E',
    grass: '#2A8C3A',
  },
  cream: {
    skyTop: '#FFF2B8',
    skyMid: '#FFF7E6',
    skyBottom: '#FFF7E6',
    hillBack: '#FFD43D',
    hillMid: '#E8A100',
    grass: '#5DCB6E',
  },
} as const;

export type PaletteName = keyof typeof PALETTES;
export type MascotKind = 'star' | 'bunny' | 'sun' | 'moon' | 'balloon';

export const FONTS = {
  display: '"Fredoka", "Baloo 2", system-ui, sans-serif',
  body: '"Nunito", system-ui, sans-serif',
} as const;

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;
