import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardComponent } from '../card/card.component';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Card, Player, GameLogEntry } from '../../models/game.models';

@Component({
  selector: 'app-arena',
  standalone: true,
  imports: [CommonModule, CardComponent],
  template: `
    <div class="arena-layout">
      
      <!-- ============================================================== -->
      <!-- MAIN ARENA TABLE AREA (LEFT & CENTER)                         -->
      <!-- ============================================================== -->
      <div class="arena-main">
        
        <!-- CAMBIO INITIATED ALERT BANNER -->
        <div class="cambio-banner" *ngIf="gameService.state().cambioCallerId !== null">
          <span class="siren">🚨</span>
          <div class="banner-text">
            <strong>{{ themeService.currentTheme().labels.cambioWarning }}</strong>
            <span>FINAL PASSES REMAINING: {{ gameService.state().finalTurnsRemaining }}</span>
          </div>
          <span class="siren">🚨</span>
        </div>

        <!-- ACTIVE ACTION DIRECTIVE PROMPT -->
        <div class="directive-banner" *ngIf="gameService.state().activeAction as action">
          <div class="directive-content">
            <span class="directive-icon">⚡</span>
            <span class="directive-text">{{ action.message }}</span>
            <button 
              *ngIf="action.sourcePlayerId === gameService.localPlayerId() && action.type !== 'TRANSFER_CARD_TO_OPPONENT'" 
              class="skip-btn" 
              (click)="gameService.skipAction()">
              SKIP POWER
            </button>
          </div>
        </div>

        <!-- 1. OPPONENTS CARDS SECTION (UP TO 7 OPPONENTS) -->
        <div class="opponents-wrapper">
          <div 
            class="opponent-mat" 
            *ngFor="let opp of gameService.otherPlayers()"
            [class.active-turn]="opp.id === gameService.state().currentTurnPlayerId && !gameService.isPlayerFrozen(opp.id)"
            [class.frozen-mat]="gameService.isPlayerFrozen(opp.id)"
            [class.disconnected]="!opp.connected">
            
            <div class="opponent-hud">
              <span class="opp-avatar">{{ opp.isBot ? '🤖' : '👤' }}</span>
              <span class="opp-name">{{ opp.name }}</span>
              <span class="opp-cards-badge">({{ opp.cards.length }})</span>
              <span class="frozen-badge" *ngIf="gameService.isPlayerFrozen(opp.id)">❄️ FROZEN</span>
              <span class="turn-indicator" *ngIf="opp.id === gameService.state().currentTurnPlayerId && !gameService.isPlayerFrozen(opp.id) && gameService.state().phase === 'PLAYING'">TURN</span>
              <span class="offline-badge" *ngIf="!opp.connected">OFFLINE</span>
            </div>

            <!-- Opponent Cards (CLOSED face-down during active game; click to match or resolve action) -->
            <div class="opponent-cards-grid" [class.many-cards]="opp.cards.length > 4">
              <div 
                *ngFor="let c of opp.cards; let idx = index" 
                class="opp-card-slot"
                (click)="onCardClicked(opp.id, idx)">
                <app-card 
                  [card]="c" 
                  [isFaceUp]="isCardFaceUp(opp.id, idx, c)"
                  [isTemporarilyOpen]="gameService.isCardTemporarilyOpen(c.id)"
                  [isSelectable]="isCardSelectable(opp.id, idx)"
                  [isSelected]="isCardSelected(opp.id, idx)"
                  [isFrozen]="gameService.isPlayerFrozen(opp.id)"
                  [slotIndex]="idx">
                </app-card>
              </div>
              <div class="no-cards-badge" *ngIf="opp.cards.length === 0">
                0 CHIPS LEFT
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
                  <app-card [isFaceUp]="false" [isSelectable]="canDrawFromDeck" [disabled]="!canDrawFromDeck"></app-card>
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
                  [isSelectable]="canDrawFromDiscard"
                  [disabled]="!canDrawFromDiscard">
                </app-card>
                <div class="empty-discard" *ngIf="!topDiscardCard">
                  <span>EMPTY CACHE</span>
                </div>
              </div>
              <div class="pile-count">{{ gameService.state().discardPile.length }} chips</div>
            </div>

          </div>

          <!-- DRAWN CARD ACTION HUD (ONLY SHOWN TO ACTIVE PLAYER) -->
          <div class="drawn-hud" *ngIf="gameService.isMyTurn() && gameService.state().drawnCard as drawn">
            <div class="drawn-header">
              <span class="drawn-tag">
                {{ gameService.state().drawnSource === 'DISCARD' ? 'TAKEN FROM BURN CACHE:' : 'DRAWN FROM BUFFER:' }}
              </span>
              <h3>{{ formatCardTitle(drawn) }}</h3>
            </div>
            
            <div class="drawn-preview">
              <app-card [card]="drawn" [isFaceUp]="true"></app-card>
            </div>

            <div class="drawn-actions">
              <button 
                *ngIf="gameService.state().drawnSource === 'DECK'" 
                class="drawn-btn discard" 
                (click)="gameService.discardDrawnCard()">
                🗑️ DISCARD DRAWN CARD
                <small *ngIf="drawn.action !== 'NONE'">Activates {{ formatActionName(drawn.action) }} power!</small>
              </button>
              <p class="swap-hint" *ngIf="gameService.state().drawnSource === 'DECK'">
                OR: Click one of your face-down chips below to swap & discard the old one!
              </p>
              <p class="swap-hint mandatory" *ngIf="gameService.state().drawnSource === 'DISCARD'">
                ⚠️ Click one of your chips below to swap it into your hand!
              </p>
            </div>
          </div>

          <!-- OPPONENT HOLDING DRAWN CARD NOTICE (NO CARD LEAK) -->
          <div class="opponent-thinking-pill" *ngIf="!gameService.isMyTurn() && gameService.state().drawnCard !== null">
            ⏳ {{ currentTurnPlayerName }} drew a card and is choosing a move...
          </div>

        </div>

        <!-- 3. LOCAL PLAYER HAND (BOTTOM PROMINENT AREA) -->
        <div 
          class="local-player-area" 
          *ngIf="gameService.localPlayer() as me" 
          [class.my-turn]="gameService.isMyTurn()"
          [class.frozen-mat]="gameService.isLocalFrozen()">
          
          <div class="local-hud">
            <div class="hud-left">
              <span class="my-avatar">{{ gameService.isLocalFrozen() ? '❄️' : '👑' }}</span>
              <div>
                <span class="my-name">{{ me.name }} (YOU) • {{ me.cards.length }} cards</span>
                <span class="my-status frozen" *ngIf="gameService.isLocalFrozen()">
                  ❄️ HAND FROZEN — WAITING FOR SHOWDOWN
                </span>
                <span class="my-status" *ngIf="!gameService.isLocalFrozen() && gameService.isMyTurn()">
                  🟢 {{ turnHintText }}
                </span>
                <span class="my-status waiting" *ngIf="!gameService.isLocalFrozen() && !gameService.isMyTurn() && gameService.state().phase === 'PLAYING'">
                  ⏳ {{ currentTurnPlayerName }}'s turn (click any closed card to match discard!)
                </span>
                <span class="my-status waiting" *ngIf="gameService.state().phase === 'INITIAL_PEEK'">
                  👁️ MEMORIZE YOUR BOTTOM TWO CARDS
                </span>
              </div>
            </div>

            <div class="hud-right">
              <!-- CALL CAMBIO BUTTON -->
              <button 
                class="cambio-action-btn"
                [disabled]="!canCallCambio"
                (click)="gameService.callCambio()">
                ⚠️ {{ themeService.currentTheme().labels.cambioButton }}
              </button>
            </div>
          </div>

          <!-- CARDS GRID: CLOSED FACE DOWN DURING PLAYING; CLICK TO MATCH OR REPLACE! -->
          <div class="my-cards-grid" [class.many-cards]="me.cards.length > 4">
            <div 
              class="my-card-slot" 
              *ngFor="let card of me.cards; let idx = index" 
              (click)="onCardClicked(me.id, idx)">
              
              <app-card 
                [card]="card" 
                [isFaceUp]="isCardFaceUp(me.id, idx, card)"
                [isTemporarilyOpen]="gameService.isCardTemporarilyOpen(card.id)"
                [isSelectable]="isCardSelectable(me.id, idx)"
                [isSelected]="isCardSelected(me.id, idx)"
                [isPeeked]="isCardCurrentlyPeeked(card)"
                [isFrozen]="gameService.isLocalFrozen()"
                [slotIndex]="idx">
              </app-card>
            </div>

            <div class="no-cards-badge self" *ngIf="me.cards.length === 0">
              🎉 0 CARDS LEFT (0 PTS!)
            </div>
          </div>

          <!-- INITIAL PEEK CONFIRMATION BAR -->
          <div class="initial-peek-bar" *ngIf="gameService.state().phase === 'INITIAL_PEEK' && !me.hasPeekedInitial">
            <p class="peek-instruction">
              👁️ {{ themeService.currentTheme().labels.initialPeekPrompt }} (bottom row #3 & #4 are revealed).
            </p>
            <p class="peek-memory-warning">
              ⚠️ Once you proceed, <strong>ALL CARDS CLOSE</strong>! Keep them in memory.
            </p>
            <button class="confirm-peek-btn" (click)="gameService.confirmInitialPeek()">
              I'VE MEMORIZED MY CHIPS (CLOSE & START)
            </button>
          </div>

          <!-- WAITING FOR OTHER PLAYERS AFTER INITIAL PEEK -->
          <div class="initial-peek-bar waiting" *ngIf="gameService.state().phase === 'INITIAL_PEEK' && me.hasPeekedInitial">
            <p class="peek-instruction">
              ✓ Chips memorized & locked! Waiting for remaining operatives to confirm...
            </p>
          </div>

        </div>

      </div>

      <!-- ============================================================== -->
      <!-- RIGHT SIDEBAR: REAL-TIME UPDATES & ACTION FEED                -->
      <!-- ============================================================== -->
      <aside class="updates-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title">
            <span class="live-pulse-dot"></span>
            <span>LIVE UPDATES</span>
          </div>
          <span class="event-badge">{{ gameService.state().logs.length }}</span>
        </div>

        <div class="updates-feed">
          <div 
            class="update-item" 
            *ngFor="let log of reversedLogs()" 
            [class]="'log-' + log.type">
            
            <div class="update-meta">
              <span class="log-badge">{{ getLogBadge(log.type) }}</span>
              <span class="update-time">{{ log.timestamp | date:'HH:mm:ss' }}</span>
            </div>

            <div class="update-message">
              {{ log.message }}
            </div>
          </div>

          <div class="empty-feed" *ngIf="gameService.state().logs.length === 0">
            <span>Waiting for match actions...</span>
          </div>
        </div>
      </aside>

      <!-- GAME OVER SUMMARY MODAL -->
      <div class="game-over-modal" *ngIf="gameService.state().phase === 'GAME_OVER'">
        <div class="game-over-content">
          <h2 class="victory-title">🏆 {{ themeService.currentTheme().labels.victoryTitle }}</h2>
          <p class="victory-subtitle">All cards decrypted! Lowest total score wins:</p>

          <div class="scores-table">
            <div 
              class="score-row" 
              *ngFor="let p of sortedPlayers(); let rank = index"
              [class.winner]="p.score === lowestScore()">
              <span class="rank-pos">#{{ rank + 1 }}</span>
              <span class="p-name">{{ p.name }} {{ p.id === gameService.localPlayerId() ? '(YOU)' : '' }}</span>
              <span class="card-count">{{ p.cards.length }} cards</span>
              <span class="p-pts">{{ p.score }} PTS</span>
            </div>
          </div>

          <div class="game-over-actions">
            <button *ngIf="gameService.isHost()" class="btn-play-again" (click)="onPlayAgain()">
              🔄 START NEW MATCH
            </button>
            <button class="btn-return-lobby" (click)="gameService.returnToLobby()">
              {{ gameService.isHost() ? '🏠 BACK TO LOBBY' : '🚪 LEAVE TO LOBBY' }}
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .arena-layout {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 16px;
      min-height: calc(100vh - 80px);
      background: var(--color-bg-gradient);
      box-sizing: border-box;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }

    @media (min-width: 1024px) {
      .arena-layout {
        flex-direction: row;
        align-items: flex-start;
      }
    }

    .arena-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      min-width: 0;
      width: 100%;
    }

    /* RIGHT UPDATES SIDEBAR */
    .updates-sidebar {
      width: 100%;
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-border, #1f2945);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      max-height: 360px;
    }

    @media (min-width: 1024px) {
      .updates-sidebar {
        width: 320px;
        min-width: 300px;
        position: sticky;
        top: 80px;
        max-height: calc(100vh - 100px);
      }
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--color-surface-elevated, #1a1f35);
      border-bottom: 1px solid var(--color-border);
      font-family: var(--font-main);
    }

    .sidebar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 900;
      color: var(--color-primary);
      letter-spacing: 1px;
    }

    .live-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-primary);
      box-shadow: 0 0 8px var(--color-primary);
      animation: pulseDot 1.4s infinite ease-in-out;
    }

    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }

    .event-badge {
      background: rgba(0, 0, 0, 0.4);
      color: var(--color-text-muted);
      font-size: 11px;
      font-weight: bold;
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid var(--color-border);
    }

    .updates-feed {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: var(--font-main);
    }

    .update-item {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.35);
      border-left: 3px solid var(--color-border);
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: slideIn 0.25s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .update-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .log-badge {
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.5px;
      padding: 2px 5px;
      border-radius: 3px;
      text-transform: uppercase;
    }

    .update-time {
      font-size: 10px;
      color: var(--color-text-dim);
    }

    .update-message {
      font-size: 12px;
      color: var(--color-text);
      line-height: 1.4;
      word-break: break-word;
    }

    .update-item.log-danger {
      border-left-color: var(--color-danger);
      background: rgba(255, 23, 68, 0.12);
    }
    .update-item.log-danger .log-badge {
      background: var(--color-danger);
      color: #fff;
    }

    .update-item.log-snap {
      border-left-color: var(--color-success);
      background: rgba(0, 230, 118, 0.1);
    }
    .update-item.log-snap .log-badge {
      background: var(--color-success);
      color: #0b0f19;
    }

    .update-item.log-cambio {
      border-left-color: var(--color-secondary);
      background: rgba(255, 0, 85, 0.15);
      border-left-width: 4px;
    }
    .update-item.log-cambio .log-badge {
      background: var(--color-secondary);
      color: #fff;
    }

    .update-item.log-action {
      border-left-color: var(--color-primary);
    }
    .update-item.log-action .log-badge {
      background: rgba(0, 240, 255, 0.2);
      color: var(--color-primary);
    }

    .update-item.log-warning {
      border-left-color: var(--color-warning);
      background: rgba(255, 171, 0, 0.1);
    }
    .update-item.log-warning .log-badge {
      background: var(--color-warning);
      color: #0b0f19;
    }

    .update-item.log-info .log-badge {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text-muted);
    }

    .empty-feed {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: var(--color-text-muted);
    }

    /* CAMBIO ALERT BANNER */
    .cambio-banner {
      width: 100%;
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
      gap: 14px;
      width: 100%;
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
      min-width: 170px;
    }

    .opponent-mat.active-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 18px var(--color-primary-glow);
      transform: translateY(-4px);
    }

    .opponent-mat.frozen-mat,
    .local-player-area.frozen-mat {
      border-color: #7dd3fc !important;
      box-shadow: 0 0 18px rgba(125, 211, 252, 0.28) !important;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, var(--color-surface, #111422) 100%);
    }

    .opponent-mat.disconnected {
      opacity: 0.6;
    }

    .opponent-hud {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      font-weight: bold;
      color: var(--color-text);
      font-family: var(--font-main);
    }

    .opp-cards-badge {
      font-size: 10px;
      color: var(--color-text-muted);
    }

    .frozen-badge {
      background: rgba(125, 211, 252, 0.2);
      border: 1px solid #7dd3fc;
      color: #7dd3fc;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }

    .offline-badge {
      background: rgba(255, 23, 68, 0.2);
      color: var(--color-danger);
      font-size: 9px;
      padding: 2px 5px;
      border-radius: 4px;
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

    .opponent-cards-grid.many-cards {
      grid-template-columns: repeat(3, 1fr);
    }

    .opp-card-slot {
      transform: scale(0.72);
      transform-origin: center center;
      margin: -14px -10px;
    }

    .no-cards-badge {
      grid-column: 1 / -1;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 900;
      color: var(--color-success);
      border: 1px dashed var(--color-success);
      border-radius: 8px;
      text-align: center;
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
    }

    .deck-stack.can-draw {
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
    }

    .discard-stack.can-draw {
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
      text-align: center;
    }

    .swap-hint.mandatory {
      color: var(--color-accent);
      font-weight: bold;
    }

    .opponent-thinking-pill {
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: 12px;
      padding: 8px 16px;
      border-radius: 20px;
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
      flex-wrap: wrap;
      gap: 10px;
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

    .my-status.frozen {
      color: #7dd3fc;
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

    .my-cards-grid.many-cards {
      grid-template-columns: repeat(3, 1fr);
    }

    .my-card-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    /* INITIAL PEEK BAR */
    .initial-peek-bar {
      background: rgba(0, 0, 0, 0.5);
      border: 1px dashed var(--color-accent);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }

    .initial-peek-bar.waiting {
      border-color: var(--color-primary);
    }

    .peek-instruction {
      font-size: 12px;
      color: var(--color-accent);
      margin: 0 0 4px 0;
      font-family: var(--font-main);
    }

    .peek-memory-warning {
      font-size: 11px;
      color: var(--color-warning);
      margin: 0 0 10px 0;
      font-family: var(--font-main);
    }

    .confirm-peek-btn {
      background: var(--color-accent);
      color: #0b0f19;
      border: none;
      padding: 10px 22px;
      border-radius: 6px;
      font-weight: 900;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--font-main);
      box-shadow: 0 0 15px rgba(255, 230, 0, 0.35);
    }

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

    .game-over-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
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

    .btn-return-lobby {
      width: 100%;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: 13px;
      font-weight: bold;
      padding: 11px;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-main);
    }

    .btn-return-lobby:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  `]
})
export class ArenaComponent {
  constructor(
    public gameService: GameService,
    public themeService: ThemeService
  ) {}

  reversedLogs(): GameLogEntry[] {
    return this.gameService.state().logs.slice().reverse();
  }

  getLogBadge(type: GameLogEntry['type']): string {
    switch (type) {
      case 'danger': return '⚠️ PENALTY';
      case 'snap': return '⚡ MATCH';
      case 'cambio': return '🚨 CAMBIO';
      case 'action': return '🎮 ACTION';
      case 'warning': return '⚠️ ALERT';
      case 'info':
      default: return 'ℹ️ SYSTEM';
    }
  }

  get topDiscardCard(): Card | null {
    const discard = this.gameService.state().discardPile;
    return discard.length > 0 ? discard[discard.length - 1] : null;
  }

  get currentTurnPlayerName(): string {
    const s = this.gameService.state();
    return s.players.find(p => p.id === s.currentTurnPlayerId)?.name || 'Operative';
  }

  get canDrawFromDeck(): boolean {
    const s = this.gameService.state();
    return this.gameService.isMyTurn() && s.drawnCard === null && s.activeAction === null;
  }

  get canDrawFromDiscard(): boolean {
    const s = this.gameService.state();
    return this.gameService.isMyTurn() && s.drawnCard === null && s.activeAction === null && s.discardPile.length > 0;
  }

  get canCallCambio(): boolean {
    const s = this.gameService.state();
    return (
      this.gameService.isMyTurn() &&
      s.drawnCard === null &&
      s.activeAction === null &&
      s.cambioCallerId === null
    );
  }

  get turnHintText(): string {
    const s = this.gameService.state();
    if (s.activeAction && s.activeAction.sourcePlayerId === this.gameService.localPlayerId()) {
      return s.activeAction.message;
    }
    if (s.drawnCard) {
      return s.drawnSource === 'DISCARD'
        ? 'YOUR TURN — Click a card below to swap with taken discard'
        : 'YOUR TURN — Discard drawn card OR click a card below to swap';
    }
    if (s.cambioCallerId !== null) {
      return 'FINAL PASS — Draw from deck/discard before your hand freezes!';
    }
    return 'YOUR TURN — Draw from Buffer/Cache, or Call Cambio';
  }

  formatCardTitle(card: Card): string {
    if (card.suit === 'joker') {
      return `Joker (${card.pointValue} pts)`;
    }
    const suitCap = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
    const rankLabel =
      card.label === 'A' ? 'Ace' :
      card.label === 'J' ? 'Jack' :
      card.label === 'Q' ? 'Queen' :
      card.label === 'K' ? 'King' : card.label;
    return `${rankLabel} of ${suitCap} (${card.pointValue} ${card.pointValue === 1 || card.pointValue === -1 ? 'pt' : 'pts'})`;
  }

  formatActionName(action: Card['action']): string {
    switch (action) {
      case 'PEEK_OWN': return this.themeService.currentTheme().labels.actions.peekSelf;
      case 'PEEK_OTHER': return this.themeService.currentTheme().labels.actions.peekOther;
      case 'SWAP': return this.themeService.currentTheme().labels.actions.blindSwap;
      default: return '';
    }
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
    this.gameService.handleCardClick(targetPlayerId, slotIndex);
  }

  isCardFaceUp(playerId: string, slotIndex: number, card: Card): boolean {
    const s = this.gameService.state();
    if (s.phase === 'GAME_OVER') return true;
    if (this.gameService.isCardTemporarilyOpen(card.id)) return true;

    const me = this.gameService.localPlayer();
    if (
      s.phase === 'INITIAL_PEEK' &&
      !me?.hasPeekedInitial &&
      playerId === this.gameService.localPlayerId() &&
      (slotIndex === 2 || slotIndex === 3)
    ) {
      return true;
    }

    return false;
  }

  isCardCurrentlyPeeked(card: Card): boolean {
    return this.gameService.isCardTemporarilyOpen(card.id);
  }

  isCardSelected(playerId: string, slotIndex: number): boolean {
    const action = this.gameService.state().activeAction;
    if (!action || action.sourcePlayerId !== this.gameService.localPlayerId()) return false;
    return (
      action.type === 'SWAP_SELECT_SECOND' &&
      action.targetPlayerId === playerId &&
      action.firstCardIndex === slotIndex
    );
  }

  isCardSelectable(playerId: string, slotIndex: number): boolean {
    const s = this.gameService.state();
    if (s.phase !== 'PLAYING') return false;
    if (this.gameService.isLocalFrozen()) return false;
    if (this.gameService.isPlayerFrozen(playerId)) return false;

    const localId = this.gameService.localPlayerId();

    if (s.drawnCard !== null) {
      return this.gameService.isMyTurn() && playerId === localId;
    }

    if (s.activeAction !== null) {
      if (s.activeAction.sourcePlayerId !== localId) return false;
      switch (s.activeAction.type) {
        case 'PEEK_OWN':
        case 'TRANSFER_CARD_TO_OPPONENT':
          return playerId === localId;
        case 'PEEK_OTHER':
          return playerId !== localId;
        case 'SWAP_SELECT_FIRST':
        case 'SWAP_SELECT_SECOND':
          return true;
      }
    }

    return true;
  }

  sortedPlayers(): Player[] {
    return [...this.gameService.state().players].sort((a, b) => a.score - b.score);
  }

  lowestScore(): number {
    const sorted = this.sortedPlayers();
    return sorted[0]?.score ?? 0;
  }

  onPlayAgain(): void {
    if (this.gameService.isHost()) {
      this.gameService.startGame();
    }
  }
}
