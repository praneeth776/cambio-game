import { ThemeConfig } from './theme.interface';

export const ClassicTheme: ThemeConfig = {
  id: 'classic',
  name: 'Classic Speakeasy',
  badge: 'TABLE 1920',
  icon: '♠️',
  fontFamily: "'Georgia', 'Times New Roman', serif",
  palette: {
    primary: '#d4af37',           // Classic Brass Gold
    primaryGlow: 'rgba(212, 175, 55, 0.35)',
    secondary: '#8a1c14',         // Velvet Crimson
    secondaryGlow: 'rgba(138, 28, 20, 0.35)',
    accent: '#2e7d32',            // Emerald Green
    background: '#0a1d17',        // Felt Green Dark
    backgroundGradient: 'radial-gradient(ellipse at 50% 30%, #12382c 0%, #06120e 100%)',
    surface: '#0f2920',
    surfaceElevated: '#173c30',
    border: '#2b5243',
    borderActive: '#d4af37',
    text: '#f7f4ea',
    textMuted: '#a2b5ab',
    textDim: '#566e63',
    danger: '#d32f2f',
    success: '#388e3c',
    warning: '#f57c00',

    cardBackBg: '#1b263b',
    cardBackBorder: '#d4af37',
    cardBackPattern: '#d4af3715',
    cardFrontBg: '#fefefe',
    cardFrontBorder: '#d4af37',
    cardRedSuit: '#c62828',
    cardBlackSuit: '#1a1a1a'
  },
  labels: {
    gameTitle: 'CAMBIO // SPEAKEASY',
    tagline: 'High stakes, poker faces, and swift hands',
    cambioButton: 'CALL CAMBIO!',
    cambioWarning: 'CAMBIO CALLED // FINAL ROUND FOR ALL',
    drawPile: 'DECK',
    discardPile: 'DISCARD PILE',
    snapButton: 'SLAP DOWN!',
    initialPeekPrompt: 'MEMORIZE 2 CARDS',
    actions: {
      peekSelf: 'PEEK OWN',
      peekSelfDesc: 'Look at 1 of your own face-down cards (Rank 7-8)',
      peekOther: 'PEEK RIVAL',
      peekOtherDesc: 'Look at 1 card of another player (Rank 9-10)',
      blindSwap: 'BLIND SWAP',
      blindSwapDesc: 'Swap any two cards without looking (Rank J-Q)'
    },
    roundComplete: 'ROUND FINISHED',
    victoryTitle: 'CASINO CHAMPION'
  },
  cardBackSvg: `
    <svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="140" rx="8" fill="#1e3a8a" stroke="#d4af37" stroke-width="2"/>
      <rect x="6" y="6" width="88" height="128" rx="6" fill="#172554" stroke="#d4af37" stroke-width="0.75"/>
      <circle cx="50" cy="70" r="26" fill="none" stroke="#d4af37" stroke-width="1.5"/>
      <polygon points="50,48 57,63 72,70 57,77 50,92 43,77 28,70 43,63" fill="#d4af37"/>
    </svg>
  `
};
