import { Injectable, signal, effect } from '@angular/core';
import { ThemeConfig, AVAILABLE_THEMES, CyberpunkTheme } from '../themes';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'cambio_theme_id';
  
  // Active theme signal - defaults to Cyberpunk as requested
  readonly currentTheme = signal<ThemeConfig>(CyberpunkTheme);

  constructor() {
    // Restore saved theme from local storage if available
    const savedThemeId = localStorage.getItem(this.STORAGE_KEY);
    if (savedThemeId && AVAILABLE_THEMES[savedThemeId]) {
      this.currentTheme.set(AVAILABLE_THEMES[savedThemeId]);
    }

    // Effect to apply CSS variables to the document root whenever theme changes
    effect(() => {
      const theme = this.currentTheme();
      this.applyThemeCssVariables(theme);
    });
  }

  setTheme(themeId: 'cyberpunk' | 'tarot' | 'classic'): void {
    if (AVAILABLE_THEMES[themeId]) {
      this.currentTheme.set(AVAILABLE_THEMES[themeId]);
      localStorage.setItem(this.STORAGE_KEY, themeId);
    }
  }

  getAvailableThemes(): ThemeConfig[] {
    return Object.values(AVAILABLE_THEMES);
  }

  private applyThemeCssVariables(theme: ThemeConfig): void {
    const root = document.documentElement;
    const p = theme.palette;

    root.style.setProperty('--color-primary', p.primary);
    root.style.setProperty('--color-primary-glow', p.primaryGlow);
    root.style.setProperty('--color-secondary', p.secondary);
    root.style.setProperty('--color-secondary-glow', p.secondaryGlow);
    root.style.setProperty('--color-accent', p.accent);
    root.style.setProperty('--color-bg', p.background);
    root.style.setProperty('--color-bg-gradient', p.backgroundGradient);
    root.style.setProperty('--color-surface', p.surface);
    root.style.setProperty('--color-surface-elevated', p.surfaceElevated);
    root.style.setProperty('--color-border', p.border);
    root.style.setProperty('--color-border-active', p.borderActive);
    root.style.setProperty('--color-text', p.text);
    root.style.setProperty('--color-text-muted', p.textMuted);
    root.style.setProperty('--color-text-dim', p.textDim);
    root.style.setProperty('--color-danger', p.danger);
    root.style.setProperty('--color-success', p.success);
    root.style.setProperty('--color-warning', p.warning);

    root.style.setProperty('--card-back-bg', p.cardBackBg);
    root.style.setProperty('--card-back-border', p.cardBackBorder);
    root.style.setProperty('--card-front-bg', p.cardFrontBg);
    root.style.setProperty('--card-front-border', p.cardFrontBorder);
    root.style.setProperty('--card-red-suit', p.cardRedSuit);
    root.style.setProperty('--card-black-suit', p.cardBlackSuit);

    root.style.setProperty('--font-main', theme.fontFamily);
  }
}
