import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { GameService } from '../../services/game.service';
import { SoundService } from '../../services/sound.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="header-left">
        <div class="logo-group">
          <span class="game-icon">{{ themeService.currentTheme().icon }}</span>
          <div>
            <h1 class="logo-title">{{ themeService.currentTheme().labels.gameTitle }}</h1>
            <p class="logo-tagline">{{ themeService.currentTheme().labels.tagline }}</p>
          </div>
        </div>
      </div>

      <div class="header-center" *ngIf="gameService.state().roomCode">
        <div class="room-pill" (click)="copyInviteLink()">
          <span class="label">ROOM:</span>
          <span class="code">{{ gameService.state().roomCode }}</span>
          <span class="copy-icon" [title]="copyNotification ? 'Copied!' : 'Copy Link'">{{ copyNotification ? '✓' : '🔗' }}</span>
        </div>
        <span class="player-count">
          👥 {{ gameService.state().players.length }}/8 PLAYERS
        </span>
      </div>

      <div class="header-right">
        <!-- THEME SWITCHER -->
        <div class="theme-switcher">
          <label class="theme-label">THEME:</label>
          <div class="theme-buttons">
            <button 
              *ngFor="let theme of themeService.getAvailableThemes()"
              class="theme-btn" 
              [class.active]="theme.id === themeService.currentTheme().id"
              (click)="themeService.setTheme(theme.id)"
              [title]="theme.name">
              {{ theme.icon }} {{ theme.name }}
            </button>
          </div>
        </div>

        <!-- AUDIO TOGGLE -->
        <button class="icon-btn" (click)="toggleAudio()" [title]="soundService.soundEnabled ? 'Mute' : 'Unmute'">
          {{ soundService.soundEnabled ? '🔊' : '🔇' }}
        </button>

        <!-- RULES MODAL TRIGGER -->
        <button class="rules-btn" (click)="openRules.emit()">
          <span>📖 RULES</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px 20px;
      background: var(--color-surface, #111422);
      border-bottom: 2px solid var(--color-border, #1f2945);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-left .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .game-icon {
      font-size: 28px;
      filter: drop-shadow(0 0 8px var(--color-primary-glow));
    }

    .logo-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: var(--color-primary);
      margin: 0;
      text-transform: uppercase;
      font-family: var(--font-main);
      text-shadow: 0 0 10px var(--color-primary-glow);
    }

    @media (min-width: 768px) {
      .logo-title {
        font-size: 19px;
      }
    }

    .logo-tagline {
      font-size: 11px;
      color: var(--color-text-muted);
      margin: 2px 0 0 0;
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .room-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid var(--color-primary);
      padding: 5px 12px;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .room-pill:hover {
      box-shadow: 0 0 12px var(--color-primary-glow);
      transform: scale(1.03);
    }

    .room-pill .label {
      font-size: 10px;
      color: var(--color-text-muted);
      font-weight: bold;
    }

    .room-pill .code {
      font-size: 14px;
      font-weight: 900;
      color: var(--color-primary);
      letter-spacing: 2px;
      font-family: var(--font-main);
    }

    .player-count {
      font-size: 11px;
      font-weight: bold;
      color: var(--color-text-muted);
      background: var(--color-surface-elevated);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--color-border);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .theme-switcher {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .theme-label {
      font-size: 10px;
      font-weight: bold;
      color: var(--color-text-muted);
      letter-spacing: 1px;
    }

    .theme-buttons {
      display: flex;
      gap: 4px;
      background: rgba(0, 0, 0, 0.4);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }

    .theme-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: var(--font-main);
      font-weight: bold;
      transition: all 0.2s ease;
    }

    .theme-btn:hover {
      color: var(--color-text);
      background: rgba(255, 255, 255, 0.05);
    }

    .theme-btn.active {
      background: var(--color-primary);
      color: #0b0f19;
      box-shadow: 0 0 10px var(--color-primary-glow);
    }

    .icon-btn, .rules-btn {
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      font-family: var(--font-main);
      transition: all 0.2s ease;
    }

    .rules-btn:hover, .icon-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
      box-shadow: 0 0 10px var(--color-primary-glow);
    }
  `]
})
export class HeaderComponent {
  @Output() openRules = new EventEmitter<void>();
  copyNotification = false;

  constructor(
    public themeService: ThemeService,
    public gameService: GameService,
    public soundService: SoundService
  ) {}

  toggleAudio(): void {
    this.soundService.soundEnabled = !this.soundService.soundEnabled;
  }

  copyInviteLink(): void {
    const url = window.location.origin + window.location.pathname + '?room=' + this.gameService.state().roomCode;
    navigator.clipboard.writeText(url).then(() => {
      this.copyNotification = true;
      setTimeout(() => (this.copyNotification = false), 2000);
    });
  }
}
