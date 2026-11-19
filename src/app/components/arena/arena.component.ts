import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardComponent } from '../card/card.component';
import { CardAnchorDirective } from '../../directives/card-anchor.directive';
import { GameService } from '../../services/game.service';
import { ThemeService } from '../../services/theme.service';
import { Card, Player, GameLogEntry } from '../../models/game.models';

@Component({
  selector: 'app-arena',
  standalone: true,
  imports: [CommonModule, CardComponent, CardAnchorDirective],
  template: `
    <div class="arena-viewport">

      <!-- ============================================================ -->
      <!-- 1. UNIFIED TOP STATUS PILL + FLOATING 2s ACTION TOAST        -->
      <!-- ============================================================ -->
      <div class="status-bar-zone">
        <div
          class="unified-status-pill"
          [class.cambio-active]="gameService.state().cambioCallerId !== null"
          [class.your-turn]="gameService.isMyTurn()"
          [class.frozen-pill]="gameService.isLocalFrozen()">

          <span class="status-dot" [class.active]="gameService.isMyTurn()"></span>

          <span class="status-text">{{ unifiedStatusText }}</span>

          <!-- Cambio countdown chip inside the single pill -->
          <span class="cambio-chip" *ngIf="gameService.state().cambioCallerId !== null">
            CAMBIO • {{ gameService.state().finalTurnsRemaining }} left
          </span>

          <!-- Contextual inline action button inside the single pill -->
          <button
            *ngIf="showInitialConfirmBtn"
            class="pill-action-btn primary"
            (click)="gameService.confirmInitialPeek()">
            Ready — Close Cards
          </button>

          <button
            *ngIf="showSkipPowerBtn"
            class="pill-action-btn"
            (click)="gameService.skipAction()">
            Skip
          </button>
        </div>

        <!-- 2s Floating Toast (auto-dismisses) -->
        <div
          class="floating-toast"
          *ngIf="gameService.activeToast() as toast"
          [class]="'tone-' + toast.tone"
          role="status">
          {{ toast.message }}
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- 2. PERIMETER OPPONENTS ARC (FITS UP TO 7 RIVALS IN 1 SCREEN) -->
      <!-- ============================================================ -->
      <div
        class="opponents-perimeter"
        [class.dense]="gameService.otherPlayers().length >= 4">
        <div
          class="opponent-seat"
          *ngFor="let opp of gameService.otherPlayers(); trackBy: trackPlayer"
          [appCardAnchor]="'seat:' + opp.id"
          [class.active-turn]="opp.id === gameService.state().currentTurnPlayerId && !gameService.isPlayerFrozen(opp.id) && gameService.state().phase === 'PLAYING'"
          [class.frozen-seat]="gameService.isPlayerFrozen(opp.id)"
          [class.disconnected]="!opp.connected">

          <div class="seat-header">
            <span class="seat-avatar">{{ opp.isBot ? '🤖' : '👤' }}</span>
            <span class="seat-name" [title]="opp.name">{{ opp.name }}</span>
            <span class="seat-count">{{ gameService.countActiveCards(opp.cards) }}</span>
            <span class="seat-badge frozen" *ngIf="gameService.isPlayerFrozen(opp.id)" title="Frozen">❄️</span>
            <span class="seat-badge offline" *ngIf="!opp.connected">OFF</span>
          </div>

          <div class="seat-cards-grid" [class.expanded]="opp.cards.length > 4">
            <div
              *ngFor="let c of opp.cards; let idx = index; trackBy: trackSlot"
              [appCardAnchor]="'slot:' + opp.id + ':' + idx"
              class="seat-slot">
              <app-card
                [card]="c"
                [compact]="true"
                [isEmptySlot]="c === null"
                [isFaceUp]="c !== null && isCardFaceUp(opp.id, idx, c)"
                [isTemporarilyOpen]="c !== null && gameService.isCardTemporarilyOpen(c.id)"
                [isSelectable]="c !== null && isCardSelectable(opp.id, idx)"
                [isSelected]="isCardSelected(opp.id, idx)"
                [isFrozen]="gameService.isPlayerFrozen(opp.id)"
                [slotIndex]="idx"
                (cardClicked)="onCardClicked(opp.id, idx)">
              </app-card>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- 3. CENTER TABLE: BUFFER (DECK) + CACHE (DISCARD) + FLOATING  -->
      <!-- ============================================================ -->
      <div class="center-stage">
        <div class="piles-row">
          <!-- DRAW PILE (MEMORY BUFFER) -->
          <div class="pile-slot">
            <span class="pile-title">{{ themeService.currentTheme().labels.drawPile }}</span>
            <div
              class="pile-anchor"
              [appCardAnchor]="'deck'"
              [class.can-interact]="canDrawFromDeck"
              (click)="onDrawDeckClicked()">
              <div class="deck-layer layer-b"></div>
              <div class="deck-layer layer-a"></div>
              <app-card
                class="deck-top-card"
                [isFaceUp]="false"
                [isSelectable]="canDrawFromDeck"
                [disabled]="!canDrawFromDeck">
              </app-card>
            </div>
            <span class="pile-meta">{{ gameService.state().drawPileCount }} left</span>
          </div>

          <!-- DISCARD PILE (BURN CACHE) -->
          <div class="pile-slot">
            <span class="pile-title">{{ themeService.currentTheme().labels.discardPile }}</span>
            <div
              class="pile-anchor"
              [appCardAnchor]="'discard'"
              [class.can-interact]="canClickDiscardPile"
              [class.discard-target]="canDiscardHeldCard"
              (click)="onDiscardPileClicked()">
              <app-card
                *ngIf="topDiscardCard as topCard"
                [card]="topCard"
                [isFaceUp]="true"
                [isSelectable]="canClickDiscardPile"
                [disabled]="!canClickDiscardPile">
              </app-card>
              <div class="empty-cache-box" *ngIf="!topDiscardCard">EMPTY</div>
            </div>
            <span class="pile-meta" *ngIf="!canDiscardHeldCard">
              {{ topDiscardHint }}
            </span>
            <span class="pile-meta discard-cta" *ngIf="canDiscardHeldCard">
              Click to Discard
            </span>
          </div>

          <!-- FLOATING ELEVATED DRAWN CARD (NO BULKY MODAL) -->
          <div
            class="pile-slot drawn-float-slot"
            [class.hidden-placeholder]="gameService.state().drawnCard === null">
            <span class="pile-title" *ngIf="gameService.state().drawnCard">
              {{ gameService.isMyTurn() ? 'HOLDING' : currentTurnPlayerName }}
            </span>
            <div class="drawn-anchor" [appCardAnchor]="'drawn-float'">
              <app-card
                *ngIf="gameService.state().drawnCard as drawn"
                [card]="gameService.isMyTurn() ? drawn : null"
                [isFaceUp]="gameService.isMyTurn()"
                [disabled]="true">
              </app-card>
            </div>
            <span class="pile-meta drawn-hint" *ngIf="gameService.isMyTurn() && gameService.state().drawnCard as drawn">
              {{ getDrawnCardCue(drawn) }}
            </span>
          </div>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- 4. LOCAL PLAYER HAND (ANCHORED BOTTOM)                       -->
      <!-- ============================================================ -->
      <div
        class="local-mat"
        *ngIf="gameService.localPlayer() as me"
        [appCardAnchor]="'seat:' + me.id"
        [class.my-turn]="gameService.isMyTurn()"
        [class.frozen-mat]="gameService.isLocalFrozen()">

        <div class="local-mat-header">
          <div class="local-identity">
            <span class="local-name">{{ me.name }}</span>
            <span class="local-count">{{ gameService.countActiveCards(me.cards) }} cards</span>
            <span class="seat-badge frozen" *ngIf="gameService.isLocalFrozen()">❄️ FROZEN</span>
          </div>

          <button
            class="cambio-btn"
            [disabled]="!canCallCambio"
            (click)="gameService.callCambio()">
            {{ themeService.currentTheme().labels.cambioButton }}
          </button>
        </div>

        <div class="local-cards-grid" [class.expanded]="me.cards.length > 4">
          <div
            *ngFor="let card of me.cards; let idx = index; trackBy: trackSlot"
            [appCardAnchor]="'slot:' + me.id + ':' + idx"
            class="local-slot">
            <app-card
              [card]="card"
              [isEmptySlot]="card === null"
              [isFaceUp]="card !== null && isCardFaceUp(me.id, idx, card)"
              [isTemporarilyOpen]="card !== null && gameService.isCardTemporarilyOpen(card.id)"
              [isSelectable]="card !== null && isCardSelectable(me.id, idx)"
              [isSelected]="isCardSelected(me.id, idx)"
              [isFrozen]="gameService.isLocalFrozen()"
              [slotIndex]="idx"
              (cardClicked)="onCardClicked(me.id, idx)">
            </app-card>
          </div>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- 5. COLLAPSIBLE LOG DRAWER TOGGLE & SLIDE-OVER PANEL          -->
      <!-- ============================================================ -->
      <button
        class="log-drawer-toggle"
        (click)="logDrawerOpen = !logDrawerOpen"
        [attr.aria-expanded]="logDrawerOpen">
        📜 Log ({{ gameService.state().logs.length }})
      </button>

      <aside class="log-drawer" *ngIf="logDrawerOpen" role="complementary" aria-label="Match activity log">
        <div class="drawer-header">
          <span>MATCH LOG</span>
          <button class="drawer-close" (click)="logDrawerOpen = false" aria-label="Close log">✕</button>
        </div>
        <div class="drawer-feed">
          <div
            class="log-row"
            *ngFor="let log of reversedLogs()"
            [class]="'log-' + log.type">
            <span class="log-time">{{ log.timestamp | date:'HH:mm:ss' }}</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </aside>

      <!-- ============================================================ -->
      <!-- 6. DELAYED GAME OVER MODAL (AFTER 1.2s SHOWDOWN FLIP)        -->
      <!-- ============================================================ -->
      <div
        class="game-over-modal"
        *ngIf="gameService.state().phase === 'GAME_OVER' && gameService.showdownModalReady()">
        <div class="game-over-content">
          <h2 class="victory-title">🏆 {{ themeService.currentTheme().labels.victoryTitle }}</h2>
          <p class="victory-subtitle">Final Showdown Scores (lowest wins)</p>

          <div class="scores-table">
            <div
              class="score-row"
              *ngFor="let p of sortedPlayers(); let rank = index"
              [class.winner]="p.score === lowestScore()">
              <span class="rank-pos">#{{ rank + 1 }}</span>
              <span class="p-name">{{ p.name }} {{ p.id === gameService.localPlayerId() ? '(YOU)' : '' }}</span>
              <span class="card-count">{{ gameService.countActiveCards(p.cards) }} cards</span>
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
    .arena-viewport {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 14px 14px;
      min-height: calc(100vh - var(--header-height, 56px));
      background: var(--color-bg-gradient);
      box-sizing: border-box;
      width: 100%;
    }

    @media (min-width: 1024px) {
      .arena-viewport {
        height: calc(100vh - var(--header-height, 56px));
        overflow: hidden;
      }
    }

    /* 1. UNIFIED TOP STATUS PILL + TOAST */
    .status-bar-zone {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 100%;
      z-index: 40;
      flex-shrink: 0;
    }

    .unified-status-pill {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      background: var(--color-surface, #111422);
      border: 1px solid var(--color-border, #1f2945);
      border-radius: 999px;
      padding: 6px 14px;
      font-family: var(--font-main);
      font-size: 12px;
      font-weight: 700;
      color: var(--color-text);
      max-width: 92vw;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .unified-status-pill.your-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 14px var(--color-primary-glow);
    }

    .unified-status-pill.cambio-active {
      border-color: var(--color-secondary);
      box-shadow: 0 0 14px var(--color-secondary-glow);
    }

    .unified-status-pill.frozen-pill {
      border-color: #7dd3fc;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--color-text-dim);
      flex-shrink: 0;
    }

    .status-dot.active {
      background: var(--color-success);
    }

    .cambio-chip {
      background: var(--color-secondary);
      color: #fff;
      font-size: 10px;
      font-weight: 900;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.5px;
    }

    .pill-action-btn {
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-family: var(--font-main);
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      cursor: pointer;
    }

    .pill-action-btn.primary {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: #0b0f19;
    }

    .floating-toast {
      position: absolute;
      top: calc(100% + 6px);
      padding: 5px 12px;
      border-radius: 8px;
      font-family: var(--font-main);
      font-size: 11px;
      font-weight: 800;
      pointer-events: none;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
      animation: toastFadeIn 0.16s ease-out;
    }

    .floating-toast.tone-snap {
      border-color: var(--color-success);
      color: var(--color-success);
    }

    .floating-toast.tone-danger {
      border-color: var(--color-danger);
      color: #ff6b81;
    }

    .floating-toast.tone-cambio {
      border-color: var(--color-secondary);
      color: #ff4d88;
    }

    @keyframes toastFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* 2. PERIMETER OPPONENTS */
    .opponents-perimeter {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      width: 100%;
      max-width: 1320px;
      flex-shrink: 0;
    }

    .opponent-seat {
      background: var(--color-surface, #111422);
      border: 1px solid var(--color-border, #1f2945);
      border-radius: 10px;
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      transition: border-color 0.2s ease, transform 0.2s ease;
    }

    .opponents-perimeter.dense .opponent-seat {
      padding: 5px 8px;
      gap: 4px;
    }

    .opponent-seat.active-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 12px var(--color-primary-glow);
      transform: translateY(-2px);
    }

    .opponent-seat.frozen-seat,
    .local-mat.frozen-mat {
      border-color: #7dd3fc;
      background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, var(--color-surface, #111422) 100%);
    }

    .opponent-seat.disconnected {
      opacity: 0.55;
    }

    .seat-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-main);
      font-size: 11px;
      font-weight: 700;
      max-width: 150px;
    }

    .seat-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 82px;
    }

    .seat-count {
      font-size: 10px;
      color: var(--color-text-muted);
    }

    .seat-badge {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 4px;
      font-weight: 900;
    }

    .seat-badge.frozen {
      background: rgba(125, 211, 252, 0.16);
      color: #7dd3fc;
    }

    .seat-badge.offline {
      background: rgba(255, 23, 68, 0.2);
      color: var(--color-danger);
    }

    .seat-cards-grid {
      display: grid;
      grid-template-columns: repeat(2, auto);
      gap: 4px;
    }

    .seat-cards-grid.expanded {
      grid-template-columns: repeat(3, auto);
    }

    /* 3. CENTER TABLE & FLOATING DRAWN CARD */
    .center-stage {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 0;
      width: 100%;
    }

    .piles-row {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 22px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--color-border);
      padding: 12px 24px;
      border-radius: 14px;
    }

    .pile-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      min-width: 82px;
    }

    @media (min-width: 768px) {
      .pile-slot {
        min-width: 94px;
      }
    }

    .drawn-float-slot.hidden-placeholder {
      width: 0;
      min-width: 0;
      overflow: hidden;
      opacity: 0;
      margin-left: -22px;
    }

    .pile-title {
      font-size: 10px;
      font-weight: 800;
      color: var(--color-text-muted);
      letter-spacing: 1px;
      font-family: var(--font-main);
      text-transform: uppercase;
    }

    .pile-anchor, .drawn-anchor {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .pile-anchor.can-interact {
      cursor: pointer;
    }

    .pile-anchor.discard-target {
      border-radius: 10px;
      box-shadow: 0 0 16px var(--color-secondary-glow);
    }

    .deck-layer {
      position: absolute;
      inset: 0;
      border-radius: 9px;
      background: var(--card-back-bg);
      border: 1px solid var(--color-border);
      pointer-events: none;
    }

    .layer-b { transform: translate(-4px, 4px); }
    .layer-a { transform: translate(-2px, 2px); }

    .empty-cache-box {
      width: 80px;
      height: 112px;
      border: 1.5px dashed var(--color-border);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--color-text-dim);
      font-family: var(--font-main);
    }

    @media (min-width: 768px) {
      .empty-cache-box {
        width: 92px;
        height: 130px;
      }
    }

    .pile-meta {
      font-size: 10px;
      color: var(--color-text-muted);
      font-family: var(--font-main);
      text-align: center;
      max-width: 110px;
    }

    .pile-meta.discard-cta {
      color: var(--color-secondary);
      font-weight: 800;
    }

    .pile-meta.drawn-hint {
      color: var(--color-accent);
      font-weight: 800;
    }

    /* 4. LOCAL PLAYER HAND */
    .local-mat {
      background: var(--color-surface, #111422);
      border: 1.5px solid var(--color-border);
      border-radius: 14px;
      padding: 10px 18px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .local-mat.my-turn {
      border-color: var(--color-primary);
      box-shadow: 0 0 18px var(--color-primary-glow);
    }

    .local-mat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      width: 100%;
      font-family: var(--font-main);
    }

    .local-identity {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .local-name {
      font-size: 13px;
      font-weight: 900;
      color: var(--color-text);
    }

    .local-count {
      font-size: 11px;
      color: var(--color-text-muted);
    }

    .cambio-btn {
      background: var(--color-secondary);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 7px;
      font-size: 11px;
      font-weight: 900;
      font-family: var(--font-main);
      cursor: pointer;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .cambio-btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .cambio-btn:disabled {
      opacity: 0.32;
      cursor: not-allowed;
    }

    .local-cards-grid {
      display: grid;
      grid-template-columns: repeat(2, auto);
      gap: 10px 14px;
      justify-content: center;
    }

    .local-cards-grid.expanded {
      grid-template-columns: repeat(3, auto);
    }

    /* 5. COLLAPSIBLE LOG DRAWER */
    .log-drawer-toggle {
      position: fixed;
      right: 16px;
      bottom: 14px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-family: var(--font-main);
      font-size: 11px;
      font-weight: 800;
      padding: 7px 12px;
      border-radius: 999px;
      cursor: pointer;
      z-index: 150;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    }

    .log-drawer-toggle:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .log-drawer {
      position: fixed;
      top: var(--header-height, 56px);
      right: 0;
      bottom: 0;
      width: min(320px, 90vw);
      background: var(--color-surface, #111422);
      border-left: 1px solid var(--color-border);
      z-index: 250;
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 30px rgba(0, 0, 0, 0.6);
      animation: drawerSlide 0.18s ease-out;
    }

    @keyframes drawerSlide {
      from { transform: translateX(24px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
      font-family: var(--font-main);
      font-size: 12px;
      font-weight: 900;
      color: var(--color-primary);
    }

    .drawer-close {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 16px;
      cursor: pointer;
    }

    .drawer-feed {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: var(--font-main);
      font-size: 11px;
    }

    .log-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 7px 9px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.3);
      border-left: 3px solid var(--color-border);
    }

    .log-row.log-danger { border-left-color: var(--color-danger); }
    .log-row.log-snap { border-left-color: var(--color-success); }
    .log-row.log-cambio { border-left-color: var(--color-secondary); }
    .log-row.log-action { border-left-color: var(--color-primary); }

    .log-time {
      font-size: 9px;
      color: var(--color-text-dim);
    }

    .log-msg {
      color: var(--color-text);
      line-height: 1.35;
    }

    /* 6. GAME OVER MODAL */
    .game-over-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(5px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: modalFadeIn 0.25s ease-out;
    }

    @keyframes modalFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .game-over-content {
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-accent);
      border-radius: 14px;
      padding: 28px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      font-family: var(--font-main);
    }

    .victory-title {
      font-size: 22px;
      font-weight: 900;
      color: var(--color-accent);
      margin: 0 0 4px 0;
    }

    .victory-subtitle {
      font-size: 12px;
      color: var(--color-text-muted);
      margin: 0 0 18px 0;
    }

    .scores-table {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-bottom: 20px;
    }

    .score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-radius: 8px;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      font-size: 13px;
    }

    .score-row.winner {
      border-color: var(--color-accent);
      background: rgba(255, 230, 0, 0.1);
      font-weight: 900;
    }

    .rank-pos { color: var(--color-primary); font-weight: 900; }
    .p-pts { color: var(--color-accent); font-weight: 900; }

    .game-over-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-play-again {
      width: 100%;
      background: var(--color-primary);
      color: #0b0f19;
      font-size: 14px;
      font-weight: 900;
      padding: 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-main);
    }

    .btn-return-lobby {
      width: 100%;
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: 12px;
      font-weight: 700;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-main);
    }
  `]
})
export class ArenaComponent {
  logDrawerOpen = false;

  constructor(
    public gameService: GameService,
    public themeService: ThemeService
  ) {}

  trackPlayer(_idx: number, player: Player): string {
    return player.id;
  }

  trackSlot(idx: number): number {
    return idx;
  }

  reversedLogs(): GameLogEntry[] {
    return this.gameService.state().logs.slice().reverse();
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
    return (
      !this.gameService.isAnimating() &&
      this.gameService.isMyTurn() &&
      s.drawnCard === null &&
      s.activeAction === null
    );
  }

  get canDiscardHeldCard(): boolean {
    const s = this.gameService.state();
    return (
      !this.gameService.isAnimating() &&
      this.gameService.isMyTurn() &&
      s.drawnCard !== null &&
      s.drawnSource === 'DECK'
    );
  }

  get canClickDiscardPile(): boolean {
    if (this.canDiscardHeldCard) return true;
    const s = this.gameService.state();
    return (
      !this.gameService.isAnimating() &&
      this.gameService.isMyTurn() &&
      s.drawnCard === null &&
      s.activeAction === null &&
      s.discardPile.length > 0
    );
  }

  get canCallCambio(): boolean {
    const s = this.gameService.state();
    return (
      !this.gameService.isAnimating() &&
      this.gameService.isMyTurn() &&
      s.drawnCard === null &&
      s.activeAction === null &&
      s.cambioCallerId === null
    );
  }

  get showInitialConfirmBtn(): boolean {
    const me = this.gameService.localPlayer();
    return this.gameService.state().phase === 'INITIAL_PEEK' && !!me && !me.hasPeekedInitial;
  }

  get showSkipPowerBtn(): boolean {
    const action = this.gameService.state().activeAction;
    return (
      !!action &&
      action.sourcePlayerId === this.gameService.localPlayerId() &&
      action.type !== 'TRANSFER_CARD_TO_OPPONENT'
    );
  }

  get unifiedStatusText(): string {
    const s = this.gameService.state();
    const me = this.gameService.localPlayer();

    if (s.phase === 'INITIAL_PEEK') {
      return me?.hasPeekedInitial
        ? 'Cards locked — waiting for rivals...'
        : 'Memorize your bottom 2 cards (#3 & #4)';
    }

    if (s.phase === 'GAME_OVER') {
      return 'Showdown — all cards revealed';
    }

    if (s.activeAction) {
      if (s.activeAction.sourcePlayerId === this.gameService.localPlayerId()) {
        return s.activeAction.message;
      }
      const actor = s.players.find(p => p.id === s.activeAction?.sourcePlayerId)?.name || 'Rival';
      return `${actor} is resolving a power...`;
    }

    if (this.gameService.isLocalFrozen()) {
      return '❄️ Your hand is frozen — waiting for Showdown';
    }

    if (this.gameService.isMyTurn()) {
      if (s.drawnCard) {
        return s.drawnSource === 'DISCARD'
          ? 'Click one of your cards to swap'
          : 'Swap with own card or click Burn Cache to discard';
      }
      return s.cambioCallerId !== null
        ? 'Final pass — draw from Buffer or Cache'
        : 'Your turn — draw a card or call Cambio';
    }

    return s.drawnCard
      ? `${this.currentTurnPlayerName} is choosing a move...`
      : `${this.currentTurnPlayerName}'s turn — click any card to match`;
  }

  get topDiscardHint(): string {
    const c = this.topDiscardCard;
    if (!c) return '0 chips';
    return `${c.pointValue} ${c.pointValue === 1 || c.pointValue === -1 ? 'pt' : 'pts'}`;
  }

  getDrawnCardCue(card: Card): string {
    if (card.action === 'PEEK_OWN') return 'Discard = Peek Own';
    if (card.action === 'PEEK_OTHER') return 'Discard = Peek Rival';
    if (card.action === 'SWAP') return 'Discard = Blind Swap';
    return `${card.pointValue} ${card.pointValue === 1 || card.pointValue === -1 ? 'pt' : 'pts'}`;
  }

  onDrawDeckClicked(): void {
    if (this.canDrawFromDeck) {
      this.gameService.drawFromDeck();
    }
  }

  onDiscardPileClicked(): void {
    if (this.canDiscardHeldCard) {
      this.gameService.discardDrawnCard();
    } else if (this.canClickDiscardPile) {
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
