import { Component, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
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
        <span class="game-icon" aria-hidden="true">{{ themeService.currentTheme().icon }}</span>
        <h1 class="logo-title">{{ themeService.currentTheme().labels.gameTitle }}</h1>
      </div>

      <!-- Compact room pill ONLY during active match (Lobby shows its own invite card) -->
      <div class="header-center" *ngIf="gameService.state().roomCode && gameService.state().phase !== 'LOBBY'">
        <button class="room-pill" (click)="copyInviteLink()" [title]="copyNotification ? 'Copied!' : 'Copy Invite Link'">
          <span class="code">{{ gameService.state().roomCode }}</span>
          <span class="copy-icon">{{ copyNotification ? '✓' : '🔗' }}</span>
        </button>
        <span class="player-count">{{ gameService.state().players.length }}/8</span>
      </div>

      <div class="header-right">
        <!-- COMPACT THEME DROPDOWN -->
        <div class="theme-dropdown">
          <button
            class="ctrl-btn theme-trigger"
            (click)="themeMenuOpen = !themeMenuOpen"
            [attr.aria-expanded]="themeMenuOpen"
            title="Switch theme">
            <span>{{ themeService.currentTheme().icon }} {{ themeService.currentTheme().name }}</span>
            <span class="caret">▾</span>
          </button>

          <div class="theme-menu" *ngIf="themeMenuOpen" role="menu">
            <button
              *ngFor="let theme of themeService.getAvailableThemes()"
              class="theme-option"
              role="menuitem"
              [class.active]="theme.id === themeService.currentTheme().id"
              (click)="selectTheme(theme.id)">
              <span>{{ theme.icon }} {{ theme.name }}</span>
              <span *ngIf="theme.id === themeService.currentTheme().id">✓</span>
            </button>
          </div>
        </div>

        <button
          class="ctrl-btn icon-only"
          (click)="toggleAudio()"
          [title]="soundService.soundEnabled ? 'Mute audio' : 'Unmute audio'"
          [attr.aria-label]="soundService.soundEnabled ? 'Mute audio' : 'Unmute audio'">
          {{ soundService.soundEnabled ? '🔊' : '🔇' }}
        </button>

        <button class="ctrl-btn" (click)="openRules.emit()">
          📖 <span class="btn-lbl">Rules</span>
        </button>

        <button
          class="ctrl-btn danger-hover"
          *ngIf="gameService.state().roomCode"
          (click)="gameService.leaveRoom()"
          title="Leave room">
          🚪 <span class="btn-lbl">Exit</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      height: var(--header-height, 56px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 16px;
      background: var(--color-surface, #111422);
      border-bottom: 1px solid var(--color-border, #1f2945);
      position: sticky;
      top: 0;
      z-index: 200;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .game-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .logo-title {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 1px;
      color: var(--color-primary);
      margin: 0;
      text-transform: uppercase;
      font-family: var(--font-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (min-width: 768px) {
      .logo-title {
        font-size: 16px;
      }
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .room-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      padding: 4px 10px;
      border-radius: 16px;
      cursor: pointer;
      font-family: var(--font-main);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 1.5px;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    .room-pill:hover {
      border-color: var(--color-primary);
    }

    .player-count {
      font-size: 11px;
      font-weight: bold;
      color: var(--color-text-muted);
      background: var(--color-surface-elevated);
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid var(--color-border);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .theme-dropdown {
      position: relative;
    }

    .ctrl-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      padding: 5px 10px;
      height: 32px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      font-family: var(--font-main);
      transition: border-color 0.15s ease, color 0.15s ease;
    }

    .ctrl-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .ctrl-btn:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    .ctrl-btn.danger-hover:hover {
      border-color: var(--color-danger);
      color: var(--color-danger);
    }

    .ctrl-btn.icon-only {
      padding: 5px 8px;
    }

    .caret {
      font-size: 10px;
      opacity: 0.75;
    }

    .btn-lbl {
      display: none;
    }

    @media (min-width: 640px) {
      .btn-lbl {
        display: inline;
      }
    }

    .theme-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      min-width: 190px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      gap: 2px;
      z-index: 300;
    }

    .theme-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: transparent;
      border: none;
      color: var(--color-text);
      font-family: var(--font-main);
      font-size: 12px;
      font-weight: 700;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: background-color 0.12s ease;
    }

    .theme-option:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .theme-option.active {
      color: var(--color-primary);
      background: rgba(0, 240, 255, 0.1);
    }
  `]
})
export class HeaderComponent {
  @Output() openRules = new EventEmitter<void>();
  copyNotification = false;
  themeMenuOpen = false;

  constructor(
    public themeService: ThemeService,
    public gameService: GameService,
    public soundService: SoundService,
    private elRef: ElementRef<HTMLElement>
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.themeMenuOpen && !this.elRef.nativeElement.contains(event.target as Node)) {
      this.themeMenuOpen = false;
    }
  }

  selectTheme(id: 'cyberpunk' | 'tarot' | 'classic'): void {
    this.themeService.setTheme(id);
    this.themeMenuOpen = false;
  }

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
