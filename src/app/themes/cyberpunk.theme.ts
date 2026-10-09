import { ThemeConfig } from './theme.interface';

export const CyberpunkTheme: ThemeConfig = {
  id: 'cyberpunk',
  name: 'Cyberpunk Noir',
  badge: 'NETRUNNER v2.0',
  icon: '⚡',
  fontFamily: "'Courier New', 'JetBrains Mono', monospace",
  palette: {
    primary: '#00f0ff',           // Neon Cyan
    primaryGlow: 'rgba(0, 240, 255, 0.45)',
    secondary: '#ff0055',         // Hot Magenta
    secondaryGlow: 'rgba(255, 0, 85, 0.45)',
    accent: '#ffe600',            // Cyber Yellow
    background: '#090a10',        // Deep Obsidian Matrix
    backgroundGradient: 'radial-gradient(ellipse at 50% 20%, #151829 0%, #07080e 100%)',
    surface: '#111422',
    surfaceElevated: '#1a1f35',
    border: '#1f2945',
    borderActive: '#00f0ff',
    text: '#e2f3fe',
    textMuted: '#6f83a5',
    textDim: '#3a4763',
    danger: '#ff1744',
    success: '#00e676',
    warning: '#ffab00',

    cardBackBg: '#0b0f19',
    cardBackBorder: '#00f0ff',
    cardBackPattern: '#00f0ff22',
    cardFrontBg: '#121727',
    cardFrontBorder: '#ff0055',
    cardRedSuit: '#ff0055',
    cardBlackSuit: '#00f0ff'
  },
  labels: {
    gameTitle: 'CAMBIO // CYBER-EXTRACTION',
    tagline: 'Zero-trace card bluffing in the neural underground',
    cambioButton: 'TRIGGER EXTRACTION',
    cambioWarning: 'EXTRACTION INITIATED // FINAL CYCLE ACTIVE',
    drawPile: 'MEMORY BUFFER',
    discardPile: 'BURN CACHE',
    snapButton: 'QUICK SLAP [MATCH]',
    initialPeekPrompt: 'DECRYPT 2 MEMORY CHIPS BEFORE UPLINK',
    actions: {
      peekSelf: 'DECRYPT CORE',
      peekSelfDesc: 'Peek at 1 of your own encrypted memory chips (Rank 7-8)',
      peekOther: 'INFILTRATE TARGET',
      peekOtherDesc: 'Hack & inspect 1 opponent chip (Rank 9-10)',
      blindSwap: 'NEURAL SPOOF',
      blindSwapDesc: 'Swap any two chips in play without looking (Rank J-Q)'
    },
    roundComplete: 'CYCLE CONCLUDED',
    victoryTitle: 'ELITE NETRUNNER'
  },
  cardBackSvg: `
    <svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="cp-circuit" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 0 10 L 10 10 L 10 0 M 10 20 L 10 10 L 20 10" fill="none" stroke="#00f0ff" stroke-width="0.8" opacity="0.3"/>
          <circle cx="10" cy="10" r="1.5" fill="#00f0ff" opacity="0.4"/>
        </pattern>
        <linearGradient id="cp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0b101e"/>
          <stop offset="100%" stop-color="#140a20"/>
        </linearGradient>
      </defs>
      <rect width="100" height="140" rx="8" fill="url(#cp-grad)" stroke="#00f0ff" stroke-width="2"/>
      <rect x="5" y="5" width="90" height="130" rx="6" fill="url(#cp-circuit)"/>
      <polygon points="50,45 68,70 50,95 32,70" fill="none" stroke="#ff0055" stroke-width="2"/>
      <polygon points="50,55 60,70 50,85 40,70" fill="#00f0ff" opacity="0.7"/>
      <text x="50" y="73" font-family="monospace" font-size="7" font-weight="bold" fill="#0b101e" text-anchor="middle">CHIP</text>
      <line x1="12" y1="20" x2="88" y2="20" stroke="#00f0ff" stroke-width="0.8" opacity="0.6"/>
      <line x1="12" y1="120" x2="88" y2="120" stroke="#ff0055" stroke-width="0.8" opacity="0.6"/>
    </svg>
  `
};
