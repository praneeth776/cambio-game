import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardComponent } from '../card/card.component';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Card, Player } from '../../models/game.models';

@Component({
  selector: 'app-arena',
  standalone: true,
  imports: [CommonModule, CardComponent],
  template: `
    <div class="arena-container">
      
      <!-- CAMBIO INITIATED ALERT BANNER -->
      <div class="cambio-banner" *ngIf="gameService.state().cambioCallerId !== null">
        <span class="siren">🚨</span>
        <div class="banner-text">
          <strong>{{ themeService.currentTheme().labels.cambioWarning }}</strong>
          <span>FINAL TURNS REMAINING: {{ gameService.state().finalTurnsRemaining }}</span>
        </div>
        <span class="siren">🚨</span>
      </div>

      <!-- ACTIVE ACTION DIRECTIVE PROMPT -->
      <div class="directive-banner" *ngIf="gameService.state().activeAction as action">
        <div class="directive-content">
          <span class="directive-icon">⚡</span>
          <span class="directive-text">{{ action.message }}</span>
          <button 
            *ngIf="action.sourcePlayerId === gameService.localPlayerId()" 
            class="skip-btn" 
            (click)="gameService.skipAction()">
            SKIP POWER
          </button>
        </div>
      </div>

      <!-- 1. OPPONENTS CARDS SECTION (RADIAL / HORIZONTAL GRID) -->
      <div class="opponents-wrapper">
        <div 
          class="opponent-mat" 
          *ngFor="let opp of gameService.otherPlayers()"
          [class.active-turn]="opp.id === gameService.state().currentTurnPlayerId">
          
          <div class="opponent-hud">
            <span class="opp-avatar">{{ opp.isBot ? '🤖' : '👤' }}</span>
            <span class="opp-name">{{ opp.name }}</span>
            <span class="turn-indicator" *ngIf="opp.id === gameService.state().currentTurnPlayerId">TURN</span>
          </div>

          <div class="opponent-cards-grid">
            <div 
              *ngFor="let c of opp.cards; let idx = index" 
              class="opp-card-slot"
              (click)="onCardClicked(opp.id, idx)">
              <app-card 
                [card]="c" 
                [isFaceUp]="isCardKnown(c) || gameService.state().phase === 'GAME_OVER'"
                [isSelectable]="isCardSelectableForAction(opp.id, idx)"
                [slotIndex]="idx">
              </app-card>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. CENTER TABLE: DRAW DECK, DISCARD PILE & DRAWN CARD HUD -->
      <div class="center-table">
        <div class="piles-wrapper">
          
          <!-- DRAW PILE -->
          <div class="pile-container draw-pile" (click)="onDrawDeckClicked()">
            <div class="pile-label">{{ themeService.currentTheme().labels.drawPile }}</div>
            <div class="deck-stack" [class.can-draw]="canDrawFromDeck">
              <div class="deck-card-layer layer-3"></div>
              <div class="deck-card-layer layer-2"></div>
              <div class="deck-card-layer layer-1">
                <app-card [isFaceUp]="false" [isSelectable]="canDrawFromDeck"></app-card>
              </div>
            </div>
            <div class="pile-count">{{ gameService.state().drawPileCount }} left</div>
          </div>

          <!-- DISCARD PILE -->
          <div class="pile-container discard-pile" (click)="onDrawDiscardClicked()">
            <div class="pile-label">{{ themeService.currentTheme().labels.discardPile }}</div>
            <div class="discard-stack" [class.can-draw]="canDrawFromDiscard">
              <app-card 
                *ngIf="topDiscardCard" 
                [card]="topDiscardCard" 
                [isFaceUp]="true" 
                [isSelectable]="canDrawFromDiscard">
              </app-card>
              <div class="empty-discard" *ngIf="!topDiscardCard">
                <span>EMPTY CACHE</span>
              </div>
            </div>
            <div class="pile-count">{{ gameService.state().discardPile.length }} chips</div>
          </div>

        </div>

        <!-- DRAWN CARD ACTION MODAL / HUD -->
        <div class="drawn-hud" *ngIf="gameService.state().drawnCard as drawn">
          <div class="drawn-header">
            <span class="drawn-tag">CURRENTLY HOLDING:</span>
            <h3>{{ drawn.label }} of {{ drawn.suit }} ({{ drawn.pointValue }} pts)</h3>
          </div>
          
          <div class="drawn-preview">
            <app-card [card]="drawn" [isFaceUp]="true"></app-card>
          </div>

          <div class="drawn-actions">
            <button class="drawn-btn discard" (click)="gameService.discardDrawnCard()">
              🗑️ DISCARD DRAWN CARD
              <small *ngIf="drawn.action !== 'NONE'">Activates {{ drawn.action }} power!</small>
            </button>
            <p class="swap-hint">OR: Click one of your cards below to replace it!</p>
          </div>
        </div>

      </div>

      <!-- 3. LOCAL PLAYER HAND (BOTTOM PROMINENT AREA) -->
      <div class="local-player-area" *ngIf="gameService.localPlayer() as me" [class.my-turn]="gameService.isMyTurn()">
        
        <div class="local-hud">
          <div class="hud-left">
            <span class="my-avatar">👑</span>
            <div>
              <span class="my-name">{{ me.name }} (YOU)</span>
              <span class="my-status" *ngIf="gameService.isMyTurn()">🟢 YOUR TURN</span>
              <span class="my-status waiting" *ngIf="!gameService.isMyTurn()">⏳ WAITING FOR OPPONENTS</span>
            </div>
          </div>

          <div class="hud-right">
            <!-- CALL CAMBIO BUTTON -->
            <button 
              class="cambio-action-btn"
              [disabled]="!gameService.isMyTurn() || gameService.state().drawnCard !== null || gameService.state().cambioCallerId !== null"
              (click)="gameService.callCambio()">
              ⚠️ {{ themeService.currentTheme().labels.cambioButton }}
            </button>
          </div>
        </div>

        <!-- 4 CARDS (2x2 GRID) -->
        <div class="my-cards-grid">
          <div 
            class="my-card-slot" 
            *ngFor="let card of me.cards; let idx = index" 
            (click)="onCardClicked(me.id, idx)">
            
            <app-card 
              [card]="card" 
              [isFaceUp]="isCardKnown(card) || isInitialPeekCard(idx) || gameService.state().phase === 'GAME_OVER'"
              [isSelectable]="isCardSelectableForAction(me.id, idx) || gameService.state().drawnCard !== null"
              [isPeeked]="isCardCurrentlyPeeked(card)"
              [slotIndex]="idx">
            </app-card>

            <!-- QUICK SLAP BUTTON -->
            <button 
              class="snap-btn" 
              *ngIf="gameService.state().phase === 'PLAYING'"
              (click)="$event.stopPropagation(); gameService.snapCard(idx)"
              title="Match rank with discard pile to shed this card!">
              ⚡ SLAP
            </button>
          </div>
        </div>

        <!-- INITIAL PEEK CONFIRMATION BAR -->
        <div class="initial-peek-bar" *ngIf="gameService.state().phase === 'INITIAL_PEEK' && !me.hasPeekedInitial">
          <p class="peek-instruction">
            👁️ {{ themeService.currentTheme().labels.initialPeekPrompt }} (bottom row #3 & #4 are revealed).
          </p>
          <button class="confirm-peek-btn" (click)="gameService.confirmInitialPeek()">
            I'VE MEMORIZED MY CARDS (PROCEED)
          </button>
        </div>

      </div>

      <!-- TEMPORARY PEEK HUD OVERLAY (When peeking a card via 7/8/9/10) -->
      <div class="peek-overlay" *ngIf="gameService.activePeek() as peek">
        <div class="peek-card-modal">
          <div class="peek-badge">👁️ ACTIVE SCAN // PEEK SUCCESS</div>
          <h4>{{ peek.ownerName }}'s Card #{{ peek.slotIndex + 1 }}</h4>
          <app-card [card]="peek.card" [isFaceUp]="true"></app-card>
          <div class="peek-timer">Closing in 3s...</div>
        </div>
      </div>

      <!-- 4. ACTIVITY LOG / TICKER -->
      <div class="activity-log-toggle" (click)="showLog = !showLog">
        📜 LOG ({{ gameService.state().logs.length }}) {{ showLog ? '▼' : '▲' }}
      </div>
      <div class="activity-log" *ngIf="showLog">
        <div class="log-entry" *ngFor="let log of gameService.state().logs.slice().reverse()">
          <span class="log-time">{{ log.timestamp | date:'HH:mm:ss' }}</span>
          <span class="log-msg" [class]="log.type">{{ log.message }}</span>
        </div>
      </div>

      <!-- 5. GAME OVER SUMMARY MODAL -->
      <div class="game-over-modal" *ngIf="gameService.state().phase === 'GAME_OVER'">
        <div class="game-over-content">
          <h2 class="victory-title">🏆 {{ themeService.currentTheme().labels.victoryTitle }}</h2>
          <p class="victory-subtitle">All memory chips decrypted. Final score tallies:</p>

          <div class="scores-table">
            <div 
              class="score-row" 
              *ngFor="let p of sortedPlayers(); let rank = index"
              [class.winner]="rank === 0">
              <span class="rank-pos">#{{ rank + 1 }}</span>
              <span class="p-name">{{ p.name }} {{ p.id === gameService.localPlayerId() ? '(YOU)' : '' }}</span>
              <span class="card-count">{{ p.cards.length }} cards</span>
              <span class="p-pts">{{ p.score }} PTS</span>
            </div>
          </div>

          <div class="game-over-actions">
            <button class="btn-play-again" (click)="onPlayAgain()">
              START NEW MATCH
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .arena-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      gap: 20px;
      min-height: calc(100vh - 80px);
      position: relative;
      background: var(--color-bg-gradient);
    }

    /* CAMBIO ALERT BANNER */
    .cambio-banner {
      width: 100%;
      max-width: 900px;
      background: linear-gradient(90deg, #ff0055 0%, #ff5252 50%, #ff0055 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      border-radius: 10px;
      box-shadow: 0 0 25px rgba(255, 0, 85, 0.7);
      animation: alertPulse 1.2s infinite alternate;
      font-family: var(--font-main);
    }

    @keyframes alertPulse {
      0% { opacity: 0.85; transform: scale(0.99); }
      100% { opacity: 1; transform: scale(1.01); }
    }

    .banner-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 1.5px;
    }

    .siren {
      font-size: 24px;
    }

    /* DIRECTIVE BANNER */
    .directive-banner {
      width: 100%;
      max-width: 900px;
      background: rgba(0, 240, 255, 0.15);
      border: 1px solid var(--color-primary);
      border-radius: 8px;
      padding: 10px 16px;
      box-shadow: 0 0 15px var(--color-primary-glow);
    }

    .directive-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--color-text);
      font-family: var(--font-main);
      font-size: 13px;
      font-weight: bold;
    }

    .directive-icon {
      font-size: 18px;
      color: var(--color-primary);
    }

    .skip-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .skip-btn:hover {
      border-color: var(--color-danger);
      color: var(--color-danger);
    }

    /* OPPONENTS WRAPPER */
    .opponents-wrapper {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
      width: 100%;
      max-width: 1200px;
    }

    .opponent-mat {
      background: var(--color-surface, #111422);
      border: 1px solid var(--color-border, #1f2945);
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      transition: all 0.25s ease;
      min-width: 180px;
    }

    .opponent-mat.active-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 18px var(--color-primary-glow);
      transform: translateY(-4px);
    }

    .opponent-hud {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: bold;
      color: var(--color-text);
      font-family: var(--font-main);
    }

    .turn-indicator {
      background: var(--color-primary);
      color: #0b0f19;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 900;
    }

    .opponent-cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }

    .opp-card-slot {
      transform: scale(0.72);
      transform-origin: center center;
      margin: -14px -10px;
    }

    /* CENTER TABLE */
    .center-table {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      margin: 10px 0;
    }

    .piles-wrapper {
      display: flex;
      align-items: center;
      gap: 32px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--color-border);
      padding: 16px 28px;
      border-radius: 16px;
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.6);
    }

    .pile-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .pile-label {
      font-size: 11px;
      font-weight: 900;
      color: var(--color-text-muted);
      letter-spacing: 1.5px;
      font-family: var(--font-main);
    }

    .pile-count {
      font-size: 11px;
      color: var(--color-text-muted);
      font-family: var(--font-main);
    }

    .deck-stack {
      position: relative;
      cursor: pointer;
    }

    .deck-stack.can-draw:hover {
      filter: drop-shadow(0 0 12px var(--color-primary-glow));
    }

    .deck-card-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 10px;
      background: var(--card-back-bg);
      border: 1px solid var(--color-border);
    }

    .layer-3 { transform: translate(-4px, 4px); }
    .layer-2 { transform: translate(-2px, 2px); }
    .layer-1 { position: relative; }

    .discard-stack {
      min-width: 90px;
      min-height: 126px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .empty-discard {
      width: 90px;
      height: 126px;
      border: 2px dashed var(--color-border);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--color-text-dim);
      font-family: var(--font-main);
    }

    /* DRAWN CARD HUD */
    .drawn-hud {
      background: var(--color-surface-elevated);
      border: 2px solid var(--color-accent);
      border-radius: 12px;
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      box-shadow: 0 0 25px rgba(255, 230, 0, 0.35);
      animation: popIn 0.3s ease;
    }

    @keyframes popIn {
      from { transform: scale(0.85); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .drawn-header {
      text-align: center;
      font-family: var(--font-main);
    }

    .drawn-tag {
      font-size: 10px;
      color: var(--color-accent);
      font-weight: 900;
      letter-spacing: 1px;
    }

    .drawn-header h3 {
      font-size: 16px;
      color: var(--color-text);
      margin: 2px 0 0 0;
    }

    .drawn-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .drawn-btn.discard {
      background: linear-gradient(135deg, var(--color-secondary) 0%, #c20042 100%);
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 900;
      cursor: pointer;
      font-family: var(--font-main);
      box-shadow: 0 4px 15px var(--color-secondary-glow);
    }

    .drawn-btn.discard small {
      display: block;
      font-size: 10px;
      font-weight: normal;
      opacity: 0.9;
    }

    .swap-hint {
      font-size: 11px;
      color: var(--color-text-muted);
      margin: 0;
      font-family: var(--font-main);
    }

    /* LOCAL PLAYER AREA */
    .local-player-area {
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-border);
      border-radius: 16px;
      padding: 18px 24px;
      width: 100%;
      max-width: 650px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 6px 30px rgba(0, 0, 0, 0.5);
    }

    .local-player-area.my-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 25px var(--color-primary-glow);
    }

    .local-hud {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--font-main);
    }

    .hud-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .my-avatar {
      font-size: 24px;
    }

    .my-name {
      display: block;
      font-size: 14px;
      font-weight: 900;
      color: var(--color-text);
    }

    .my-status {
      font-size: 11px;
      color: var(--color-success);
      font-weight: bold;
    }

    .my-status.waiting {
      color: var(--color-text-muted);
    }

    .cambio-action-btn {
      background: linear-gradient(135deg, #ff0055 0%, #aa0033 100%);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 900;
      font-family: var(--font-main);
      cursor: pointer;
      box-shadow: 0 0 15px rgba(255, 0, 85, 0.4);
      transition: all 0.2s;
    }

    .cambio-action-btn:hover:not(:disabled) {
      transform: scale(1.04);
      box-shadow: 0 0 20px rgba(255, 0, 85, 0.7);
    }

    .cambio-action-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      box-shadow: none;
    }

    .my-cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      justify-items: center;
    }

    .my-card-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .snap-btn {
      background: rgba(0, 240, 255, 0.1);
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      font-size: 10px;
      font-weight: 900;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--font-main);
      transition: all 0.2s;
    }

    .snap-btn:hover {
      background: var(--color-primary);
      color: #0b0f19;
      box-shadow: 0 0 10px var(--color-primary-glow);
    }

    /* INITIAL PEEK BAR */
    .initial-peek-bar {
      background: rgba(0, 0, 0, 0.5);
      border: 1px dashed var(--color-accent);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }

    .peek-instruction {
      font-size: 12px;
      color: var(--color-accent);
      margin: 0 0 8px 0;
      font-family: var(--font-main);
    }

    .confirm-peek-btn {
      background: var(--color-accent);
      color: #0b0f19;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: 900;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--font-main);
    }

    /* PEEK OVERLAY */
    .peek-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .peek-card-modal {
      background: var(--color-surface-elevated);
      border: 2px solid var(--color-primary);
      padding: 24px;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 0 40px var(--color-primary-glow);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      font-family: var(--font-main);
    }

    .peek-badge {
      font-size: 11px;
      font-weight: 900;
      color: var(--color-primary);
      letter-spacing: 1.5px;
    }

    .peek-timer {
      font-size: 11px;
      color: var(--color-text-muted);
    }

    /* LOG / TICKER */
    .activity-log-toggle {
      position: fixed;
      bottom: 12px;
      left: 16px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: 11px;
      font-weight: bold;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-main);
      z-index: 50;
    }

    .activity-log {
      position: fixed;
      bottom: 48px;
      left: 16px;
      width: 320px;
      max-height: 220px;
      overflow-y: auto;
      background: rgba(17, 20, 34, 0.95);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 10px;
      font-family: var(--font-main);
      font-size: 11px;
      z-index: 50;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    }

    .log-entry {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    }

    .log-time {
      color: var(--color-text-dim);
    }

    .log-msg.action { color: var(--color-primary); }
    .log-msg.cambio { color: var(--color-accent); font-weight: bold; }
    .log-msg.snap { color: var(--color-success); font-weight: bold; }
    .log-msg.danger { color: var(--color-danger); }

    /* GAME OVER MODAL */
    .game-over-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(6px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .game-over-content {
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-accent);
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      font-family: var(--font-main);
      box-shadow: 0 0 50px rgba(255, 230, 0, 0.4);
    }

    .victory-title {
      font-size: 24px;
      font-weight: 900;
      color: var(--color-accent);
      margin: 0 0 4px 0;
      letter-spacing: 2px;
    }

    .victory-subtitle {
      font-size: 12px;
      color: var(--color-text-muted);
      margin: 0 0 20px 0;
    }

    .scores-table {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }

    .score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      font-size: 13px;
    }

    .score-row.winner {
      border-color: var(--color-accent);
      background: rgba(255, 230, 0, 0.1);
      font-weight: bold;
    }

    .rank-pos {
      font-weight: 900;
      color: var(--color-primary);
    }

    .p-pts {
      font-weight: 900;
      color: var(--color-accent);
    }

    .btn-play-again {
      width: 100%;
      background: linear-gradient(135deg, var(--color-primary) 0%, #0088cc 100%);
      color: #0b0f19;
      font-size: 15px;
      font-weight: 900;
      padding: 14px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-main);
      letter-spacing: 1px;
    }
  `]
})
export class ArenaComponent {
  showLog = false;

  constructor(
    public gameService: GameService,
    public themeService: ThemeService
  ) {}

  get topDiscardCard(): Card | null {
    const discard = this.gameService.state().discardPile;
    return discard.length > 0 ? discard[discard.length - 1] : null;
  }

  get canDrawFromDeck(): boolean {
    return this.gameService.isMyTurn() && this.gameService.state().drawnCard === null;
  }

  get canDrawFromDiscard(): boolean {
    return this.gameService.isMyTurn() && this.gameService.state().drawnCard === null && this.gameService.state().discardPile.length > 0;
  }

  onDrawDeckClicked(): void {
    if (this.canDrawFromDeck) {
      this.gameService.drawFromDeck();
    }
  }

  onDrawDiscardClicked(): void {
    if (this.canDrawFromDiscard) {
      this.gameService.drawFromDiscard();
    }
  }

  onCardClicked(targetPlayerId: string, slotIndex: number): void {
    // 1. If active power action is underway
    if (this.gameService.state().activeAction) {
      this.gameService.handleCardClickDuringAction(targetPlayerId, slotIndex);
      return;
    }

    // 2. If local player is holding a drawn card and clicked one of their own cards -> Replace!
    if (this.gameService.state().drawnCard !== null && targetPlayerId === this.gameService.localPlayerId()) {
      this.gameService.replaceCardInHand(slotIndex);
      return;
    }
  }

  isCardKnown(card: Card): boolean {
    return !!this.gameService.knownCards()[card.id];
  }

  isInitialPeekCard(slotIndex: number): boolean {
    return this.gameService.state().phase === 'INITIAL_PEEK' && (slotIndex === 2 || slotIndex === 3);
  }

  isCardCurrentlyPeeked(card: Card): boolean {
    return this.gameService.activePeek()?.card.id === card.id;
  }

  isCardSelectableForAction(playerId: string, slotIndex: number): boolean {
    const action = this.gameService.state().activeAction;
    if (!action || action.sourcePlayerId !== this.gameService.localPlayerId()) return false;

    if (action.type === 'PEEK_OWN') {
      return playerId === this.gameService.localPlayerId();
    }
    if (action.type === 'PEEK_OTHER') {
      return playerId !== this.gameService.localPlayerId();
    }
    if (action.type === 'SWAP_SELECT_FIRST' || action.type === 'SWAP_SELECT_SECOND') {
      return true;
    }
    return false;
  }

  sortedPlayers(): Player[] {
    return [...this.gameService.state().players].sort((a, b) => a.score - b.score);
  }

  onPlayAgain(): void {
    if (this.gameService.isHost()) {
      this.gameService.startGame();
    } else {
      this.gameService.state.update(s => ({ ...s, phase: 'LOBBY' }));
    }
  }
}
