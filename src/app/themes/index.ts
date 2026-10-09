export * from './theme.interface';
export * from './cyberpunk.theme';
export * from './tarot.theme';
export * from './classic.theme';

import { CyberpunkTheme } from './cyberpunk.theme';
import { TarotTheme } from './tarot.theme';
import { ClassicTheme } from './classic.theme';
import { ThemeConfig } from './theme.interface';

export const AVAILABLE_THEMES: Record<string, ThemeConfig> = {
  cyberpunk: CyberpunkTheme,
  tarot: TarotTheme,
  classic: ClassicTheme
};
