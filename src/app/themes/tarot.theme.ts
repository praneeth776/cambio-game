import { ThemeConfig } from './theme.interface';

export const TarotTheme: ThemeConfig = {
  id: 'tarot',
  name: 'Arcane Tarot',
  badge: 'CELESTIAL ARCANA',
  icon: '🔮',
  fontFamily: "'Cinzel', 'Georgia', serif",
  palette: {
    primary: '#ffd700',           // Celestial Gold
    primaryGlow: 'rgba(255, 215, 0, 0.4)',
    secondary: '#b388ff',         // Amethyst Purple
    secondaryGlow: 'rgba(179, 136, 255, 0.4)',
    accent: '#ff6e40',            // Astral Coral
    background: '#0d0914',        // Deep Velvet Night
    backgroundGradient: 'radial-gradient(ellipse at 50% 30%, #1e1333 0%, #08050e 100%)',
    surface: '#171126',
    surfaceElevated: '#241a3c',
    border: '#3d2b63',
    borderActive: '#ffd700',
    text: '#f3e8ff',
    textMuted: '#9e8bb8',
    textDim: '#524569',
    danger: '#ff5252',
    success: '#69f0ae',
    warning: '#ffd740',

    cardBackBg: '#130c24',
    cardBackBorder: '#ffd700',
    cardBackPattern: '#ffd70020',
    cardFrontBg: '#1c1530',
    cardFrontBorder: '#b388ff',
    cardRedSuit: '#ff5252',
    cardBlackSuit: '#ffd700'
  },
  labels: {
    gameTitle: 'CAMBIO // ARCANE ECLIPSE',
    tagline: 'Divination, alchemy, and shadowplay',
    cambioButton: 'INVOKE ECLIPSE',
    cambioWarning: 'ECLIPSE INVOKED // THE VEIL CLOSES',
    drawPile: 'ASTRAL DECK',
    discardPile: 'SACRIFICE ALTAR',
    snapButton: 'ALCHEMICAL SYNAPSE',
    initialPeekPrompt: 'REVEAL 2 SACRED ARCANA',
    actions: {
      peekSelf: 'INNER VISION',
      peekSelfDesc: 'Gaze into 1 of your hidden arcana (Rank 7-8)',
      peekOther: 'THIRD EYE',
      peekOtherDesc: 'Peer into an opponent’s hidden fate (Rank 9-10)',
      blindSwap: 'ASTRAL SHIFT',
      blindSwapDesc: 'Transmute and swap two fates in the circle (Rank J-Q)'
    },
    roundComplete: 'RITUAL CONCLUDED',
    victoryTitle: 'GRAND ARCH-MAGE'
  },
  cardBackSvg: `
    <svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="140" rx="8" fill="#130c24" stroke="#ffd700" stroke-width="2"/>
      <circle cx="50" cy="70" r="30" fill="none" stroke="#ffd700" stroke-dasharray="3 3" opacity="0.6"/>
      <circle cx="50" cy="70" r="22" fill="#241a3c" stroke="#b388ff" stroke-width="1"/>
      <path d="M 50 45 L 53 65 L 70 70 L 53 75 L 50 95 L 47 75 L 30 70 L 47 65 Z" fill="#ffd700"/>
      <circle cx="50" cy="70" r="4" fill="#ffffff"/>
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="#ffd700" stroke-width="0.5" opacity="0.5"/>
    </svg>
  `
};
