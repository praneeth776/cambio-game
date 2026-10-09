import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="lobby-container">
      <div class="lobby-card">
        <!-- HEADER -->
        <div class="lobby-header">
          <div class="theme-badge">{{ themeService.currentTheme().badge }}</div>
          <h2 class="title">{{ themeService.currentTheme().labels.gameTitle }}</h2>
          <p class="subtitle">Multiplayer Cambio for 2 to 8 players • Serverless P2P WebRTC</p>
        </div>

        <!-- PLAYER NAME INPUT -->
        <div class="input-section">
          <label class="input-label">YOUR CODENAME</label>
          <div class="input-wrapper">
            <span class="prefix">></span>
            <input 
              type="text" 
              class="cyber-input" 
              [(ngModel)]="playerName" 
              (change)="updatePlayerName()"
              placeholder="e.g. Neo, Cipher, Alice" 
              maxlength="15" />
          </div>
        </div>

        <!-- ROOM SELECTION MODES (IF NOT IN A ROOM) -->
        <div class="actions-grid" *ngIf="!gameService.state().roomCode">
          <button class="btn btn-primary" (click)="onCreateRoom()">
            <span class="btn-icon">⚡</span>
            <span class="btn-text">
              <strong>CREATE NEW ROOM</strong>
              <small>Host a match for up to 8 players</small>
            </span>
          </button>

          <div class="join-box">
            <input 
              type="text" 
              class="room-code-input" 
              [(ngModel)]="joinCode" 
              placeholder="ROOM CODE" 
              maxlength="6" />
            <button class="btn btn-secondary" [disabled]="!joinCode.trim()" (click)="onJoinRoom()">
              JOIN ROOM
            </button>
          </div>
        </div>

        <!-- ACTIVE ROOM LOBBY ROSTER -->
        <div class="room-active-section" *ngIf="gameService.state().roomCode">
          <div class="room-info-banner">
            <div class="code-display">
              <span class="banner-lbl">ROOM CODE</span>
              <span class="banner-code">{{ gameService.state().roomCode }}</span>
            </div>
            <button class="copy-link-btn" (click)="copyShareLink()">
              {{ copied ? 'COPIED TO CLIPBOARD!' : '📋 COPY INVITE LINK' }}
            </button>
          </div>

          <div class="roster-header">
            <h3>CONNECTED OPERATIVES ({{ gameService.state().players.length }}/8)</h3>
            <button 
              *ngIf="gameService.isHost() && gameService.state().players.length < 8" 
              class="add-bot-btn" 
              (click)="gameService.addBotPlayer()">
              + ADD AI BOT
            </button>
          </div>

          <div class="roster-grid">
            <div 
              class="player-chip" 
              *ngFor="let p of gameService.state().players" 
              [class.is-self]="p.id === gameService.localPlayerId()">
              <div class="player-avatar">{{ p.isBot ? '🤖' : (p.isHost ? '👑' : '👤') }}</div>
              <div class="player-details">
                <span class="player-name">{{ p.name }}</span>
                <span class="player-role">
                  {{ p.isHost ? 'ROOM HOST' : (p.isBot ? 'AI BOT' : 'OPERATIVE') }}
                  <strong *ngIf="p.id === gameService.localPlayerId()"> (YOU)</strong>
                </span>
              </div>
              <button 
                *ngIf="gameService.isHost() && p.id !== gameService.localPlayerId()" 
                class="kick-btn" 
                (click)="gameService.removePlayer(p.id)" 
                title="Remove player">✕</button>
            </div>
          </div>

          <!-- LAUNCH GAME BUTTON (HOST ONLY) -->
          <div class="launch-actions" *ngIf="gameService.isHost()">
            <button 
              class="btn btn-launch" 
              [disabled]="gameService.state().players.length < 2" 
              (click)="gameService.startGame()">
              INITIALIZE MATCH ({{ gameService.state().players.length }} PLAYERS)
            </button>
            <p class="launch-hint" *ngIf="gameService.state().players.length < 2">
              Tip: Click "+ ADD AI BOT" to practice solo or share your room link with friends!
            </p>
          </div>

          <div class="waiting-message" *ngIf="!gameService.isHost()">
            <div class="spinner"></div>
            <span>Waiting for room host to initiate the game...</span>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .lobby-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 30px 16px;
      min-height: calc(100vh - 120px);
    }

    .lobby-card {
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-border, #1f2945);
      border-radius: 16px;
      padding: 32px;
      max-width: 650px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 20px var(--color-primary-glow);
    }

    .lobby-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .theme-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 2px;
      color: var(--color-accent);
      background: rgba(255, 230, 0, 0.1);
      padding: 3px 10px;
      border-radius: 12px;
      border: 1px solid var(--color-accent);
      margin-bottom: 8px;
    }

    .title {
      font-size: 24px;
      font-weight: 900;
      color: var(--color-primary);
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 0;
      font-family: var(--font-main);
      text-shadow: 0 0 12px var(--color-primary-glow);
    }

    .subtitle {
      font-size: 13px;
      color: var(--color-text-muted);
      margin: 6px 0 0 0;
    }

    .input-section {
      margin-bottom: 24px;
    }

    .input-label {
      display: block;
      font-size: 11px;
      font-weight: bold;
      color: var(--color-text-muted);
      margin-bottom: 6px;
      letter-spacing: 1px;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 0 12px;
      transition: border-color 0.2s;
    }

    .input-wrapper:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 0 10px var(--color-primary-glow);
    }

    .prefix {
      color: var(--color-primary);
      font-weight: bold;
      margin-right: 8px;
      font-family: var(--font-main);
    }

    .cyber-input {
      width: 100%;
      background: transparent;
      border: none;
      outline: none;
      color: var(--color-text);
      font-size: 15px;
      padding: 12px 0;
      font-family: var(--font-main);
    }

    .actions-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      padding: 14px 20px;
      cursor: pointer;
      font-family: var(--font-main);
      font-weight: bold;
      border: none;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--color-primary) 0%, #0088cc 100%);
      color: #050b14;
      gap: 12px;
      box-shadow: 0 4px 15px var(--color-primary-glow);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px var(--color-primary-glow);
    }

    .btn-icon {
      font-size: 22px;
    }

    .btn-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.2;
    }

    .btn-text small {
      font-size: 11px;
      opacity: 0.85;
      font-weight: normal;
    }

    .join-box {
      display: flex;
      gap: 8px;
    }

    .room-code-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      color: var(--color-primary);
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 2px;
      text-align: center;
      padding: 12px;
      outline: none;
      font-family: var(--font-main);
      text-transform: uppercase;
    }

    .room-code-input:focus {
      border-color: var(--color-primary);
    }

    .btn-secondary {
      background: var(--color-surface-elevated);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      padding: 12px 24px;
    }

    .btn-secondary:hover:not(:disabled) {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .btn-secondary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ROOM ACTIVE SECTION */
    .room-info-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.4);
      border: 1px dashed var(--color-primary);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
    }

    .code-display {
      display: flex;
      flex-direction: column;
    }

    .banner-lbl {
      font-size: 10px;
      color: var(--color-text-muted);
      font-weight: bold;
    }

    .banner-code {
      font-size: 22px;
      font-weight: 900;
      color: var(--color-primary);
      letter-spacing: 3px;
      font-family: var(--font-main);
    }

    .copy-link-btn {
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-primary);
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      font-family: var(--font-main);
      transition: all 0.2s;
    }

    .copy-link-btn:hover {
      box-shadow: 0 0 10px var(--color-primary-glow);
    }

    .roster-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .roster-header h3 {
      font-size: 12px;
      color: var(--color-text-muted);
      margin: 0;
      letter-spacing: 1px;
    }

    .add-bot-btn {
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      font-size: 11px;
      font-weight: bold;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-family: var(--font-main);
    }

    .add-bot-btn:hover {
      background: var(--color-primary);
      color: #0b0f19;
    }

    .roster-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px;
      margin-bottom: 24px;
    }

    .player-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      padding: 8px 12px;
      border-radius: 8px;
      position: relative;
    }

    .player-chip.is-self {
      border-color: var(--color-primary);
      background: rgba(0, 240, 255, 0.05);
    }

    .player-avatar {
      font-size: 18px;
    }

    .player-details {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .player-name {
      font-size: 13px;
      font-weight: bold;
      color: var(--color-text);
    }

    .player-role {
      font-size: 10px;
      color: var(--color-text-muted);
    }

    .kick-btn {
      background: transparent;
      border: none;
      color: var(--color-danger);
      font-size: 14px;
      cursor: pointer;
      padding: 2px 6px;
    }

    .btn-launch {
      width: 100%;
      background: linear-gradient(135deg, var(--color-secondary) 0%, #d80044 100%);
      color: #fff;
      font-size: 15px;
      letter-spacing: 1px;
      box-shadow: 0 4px 20px var(--color-secondary-glow);
    }

    .btn-launch:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px var(--color-secondary-glow);
    }

    .btn-launch:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .launch-hint {
      text-align: center;
      font-size: 11px;
      color: var(--color-accent);
      margin-top: 8px;
    }

    .waiting-message {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      font-size: 13px;
      color: var(--color-text-muted);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LobbyComponent implements OnInit {
  playerName: string = '';
  joinCode: string = '';
  copied: boolean = false;

  constructor(
    public gameService: GameService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.playerName = this.gameService.localPlayerName();

    // Auto join if room code is in query string
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        this.joinCode = roomParam.toUpperCase();
        this.onJoinRoom();
      }
    }
  }

  updatePlayerName(): void {
    if (this.playerName.trim()) {
      this.gameService.localPlayerName.set(this.playerName.trim());
    }
  }

  onCreateRoom(): void {
    this.updatePlayerName();
    this.gameService.createRoom();
  }

  onJoinRoom(): void {
    if (!this.joinCode.trim()) return;
    this.updatePlayerName();
    this.gameService.joinRoom(this.joinCode.trim(), this.playerName);
  }

  copyShareLink(): void {
    const url = window.location.origin + window.location.pathname + '?room=' + this.gameService.state().roomCode;
    navigator.clipboard.writeText(url).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2500);
    });
  }
}
