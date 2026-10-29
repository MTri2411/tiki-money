export type ThemeTokens = {
  paper: string;
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  pos: string;
  neg: string;
  islandBg: string;
  islandInk: string;
  islandDim: string;
  islandLine: string;
};

export const light: ThemeTokens = {
  paper: '#FAF9F5',
  surface: '#FFFFFF',
  surface2: '#F1EFE7',
  ink: '#1D1C19',
  ink2: '#5E5C55',
  ink3: '#918E85',
  line: 'rgba(29,28,25,0.11)',
  line2: 'rgba(29,28,25,0.06)',
  accent: '#C15F3C',
  accentInk: '#FFFFFF',
  accentSoft: 'rgba(193,95,60,0.10)',
  pos: '#2E6F53',
  neg: '#C4473A',
  islandBg: '#141310',
  islandInk: '#F7F5EF',
  islandDim: 'rgba(247,245,239,0.52)',
  islandLine: 'rgba(247,245,239,0.14)',
};

export const dark: ThemeTokens = {
  paper: '#1C1B18',
  surface: '#242320',
  surface2: '#2C2B27',
  ink: '#F0EEE7',
  ink2: '#A9A69D',
  ink3: '#7D7A71',
  line: 'rgba(240,238,231,0.13)',
  line2: 'rgba(240,238,231,0.07)',
  accent: '#E08A67',
  accentInk: '#231409',
  accentSoft: 'rgba(224,138,103,0.14)',
  pos: '#6CB795',
  neg: '#E07A6C',
  islandBg: '#000000',
  islandInk: '#F7F5EF',
  islandDim: 'rgba(247,245,239,0.52)',
  islandLine: 'rgba(247,245,239,0.16)',
};
