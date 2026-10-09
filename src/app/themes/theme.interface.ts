export interface ThemePalette {
  primary: string;
  primaryGlow: string;
  secondary: string;
  secondaryGlow: string;
  accent: string;
  background: string;
  backgroundGradient: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderActive: string;
  text: string;
  textMuted: string;
  textDim: string;
  danger: string;
  success: string;
  warning: string;

  // Card specific colors
  cardBackBg: string;
  cardBackBorder: string;
  cardBackPattern: string;
  cardFrontBg: string;
  cardFrontBorder: string;
  cardRedSuit: string;
  cardBlackSuit: string;
}

export interface ThemeLabels {
  gameTitle: string;
  tagline: string;
  cambioButton: string;
  cambioWarning: string;
  drawPile: string;
  discardPile: string;
  snapButton: string;
  initialPeekPrompt: string;
  actions: {
    peekSelf: string;
    peekSelfDesc: string;
    peekOther: string;
    peekOtherDesc: string;
    blindSwap: string;
    blindSwapDesc: string;
  };
  roundComplete: string;
  victoryTitle: string;
}

export interface ThemeConfig {
  id: 'cyberpunk' | 'tarot' | 'classic';
  name: string;
  badge: string;
  icon: string;
  fontFamily: string;
  palette: ThemePalette;
  labels: ThemeLabels;
  cardBackSvg: string;
}
