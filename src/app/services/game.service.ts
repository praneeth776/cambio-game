import { Injectable, signal, computed } from '@angular/core';
import {
  Card,
  Player,
  GameState,
  GameLogEntry,
  AnimationEvent,
  ToastNotification
} from '../models/game.models';
import { createDeck, shuffleDeck, getSuitSymbol } from '../utils/card.utils';
import { SoundService } from './sound.service';
import { CardFlightService } from './card-flight.service';
import confetti from 'canvas-confetti';
import { joinRoom } from 'trystero/nostr';

const APP_ID = 'cambio-p2p-v1';
const MAX_LOGS = 60;

@Injectable({
  providedIn: 'root'
})
export class GameService {
  // Local player identification
  readonly localPlayerId = signal<string>(`player_${Math.random().toString(36).substring(2, 8)}`);
  readonly localPlayerName = signal<string>('Netrunner_' + Math.floor(Math.random() * 900 + 100));

  // Core Game State Signal
  readonly state = signal<GameState>({
    roomCode: '',
    phase: 'LOBBY',
    players: [],
    currentTurnPlayerId: '',
    cambioCallerId: null,
    frozenPlayerIds: [],
    finalTurnsRemaining: 0,
    drawPileCount: 54,
    discardPile: [],
    drawnCard: null,
    drawnSource: null,
    activeAction: null,
    logs: []
  });

  // Set of cards temporarily revealed for 3 seconds with an expiration timestamp
  readonly temporarilyOpenCards = signal<Record<string, number>>({});

  // Local card knowledge map (used at game-over reveal)
  readonly knownCards = signal<Record<string, Card>>({});

  // Brief floating table toast (auto-dismissed after 2s)
  readonly activeToast = signal<ToastNotification | null>(null);

  // Delays Game Over scoreboard modal until staggered Showdown card flip finishes
  readonly showdownModalReady = signal<boolean>(false);

  // Input guard during brief cross-zone flight transitions
  readonly isAnimating = signal<boolean>(false);

  // Private canonical deck kept by the Room Host
  private canonicalDeck: Card[] = [];

  // Tracked timers so room transitions never leak stale callbacks
  private timers = new Set<ReturnType<typeof setTimeout>>();

  // Trystero P2P Room instance & message channels
  private p2pRoom: any = null;
  private sendSyncState: ((data: GameState) => void) | null = null;
  private sendPlayerAction: ((data: any) => void) | null = null;
  private sendSyncReveal: ((data: { cardId: string; durationMs: number }) => void) | null = null;
  private sendAnimEvent: ((data: AnimationEvent) => void) | null = null;
  private peerToPlayerId = new Map<string, string>();
  private hasAnnouncedJoin = false;

  // Computed signals
  readonly isHost = computed(() => {
    const localId = this.localPlayerId();
    const p = this.state().players.find(x => x.id === localId);
    return !!p?.isHost;
  });

  readonly isMyTurn = computed(() => {
    const s = this.state();
    return (
      s.phase === 'PLAYING' &&
      s.currentTurnPlayerId === this.localPlayerId() &&
      !s.frozenPlayerIds.includes(this.localPlayerId())
    );
  });

  readonly localPlayer = computed(() => {
    return this.state().players.find(x => x.id === this.localPlayerId()) || null;
  });

  readonly otherPlayers = computed(() => {
    return this.state().players.filter(x => x.id !== this.localPlayerId());
  });

  readonly isLocalFrozen = computed(() => {
    return this.state().frozenPlayerIds.includes(this.localPlayerId());
  });

  constructor(
    private sound: SoundService,
    private flightService: CardFlightService
  ) {}

  isPlayerFrozen(playerId: string): boolean {
    return this.state().frozenPlayerIds.includes(playerId);
  }

  countActiveCards(cards: (Card | null)[]): number {
    return cards.reduce((n, c) => n + (c ? 1 : 0), 0);
  }

  private scheduleTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  private clearAllTimers(): void {
    this.timers.forEach(id => clearTimeout(id));
    this.timers.clear();
    this.flightService.clearAll();
    this.isAnimating.set(false);
  }

  private clearSlot(cards: (Card | null)[], index: number): void {
    if (index < 0 || index >= cards.length) return;
    cards[index] = null;
    // Preserve base 2x2 slots (indices 0..3), only trim trailing nulls beyond index 3
    while (cards.length > 4 && cards[cards.length - 1] === null) {
      cards.pop();
    }
  }

  private insertCardIntoHand(cards: (Card | null)[], card: Card): number {
    const emptyIdx = cards.findIndex(c => c === null);
    if (emptyIdx !== -1) {
      cards[emptyIdx] = card;
      return emptyIdx;
    }
    cards.push(card);
    return cards.length - 1;
  }

  private pickRandomActiveSlot(cards: (Card | null)[]): number {
    const activeIndices = cards
      .map((c, idx) => (c ? idx : -1))
      .filter(idx => idx !== -1);
    if (activeIndices.length === 0) return -1;
    return activeIndices[Math.floor(Math.random() * activeIndices.length)];
  }

  private formatCardTag(card: Card): string {
    if (card.suit === 'joker') return 'JKR🃏';
    return `${card.label}${getSuitSymbol(card.suit)}`;
  }

  private appendLog(logs: GameLogEntry[], message: string, type: GameLogEntry['type']): GameLogEntry[] {
    const next = [
      ...logs,
      { id: Math.random().toString(), timestamp: Date.now(), message, type }
    ];
    return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
  }

  showToast(message: string, tone: ToastNotification['tone'] = 'info', durationMs: number = 2000): void {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.activeToast.set({ id, message, tone });
    this.scheduleTimer(() => {
      if (this.activeToast()?.id === id) {
        this.activeToast.set(null);
      }
    }, durationMs);
  }

  private emitAnimation(event: AnimationEvent): void {
    this.flightService.playEvent(event, this.localPlayerId());
    if (this.isHost()) {
      this.sendAnimEvent?.(event);
    }
  }

  // -------------------------------------------------------------
  // LOBBY & ROOM INITIALIZATION
  // -------------------------------------------------------------
  createRoom(customCode?: string): string {
    this.cleanupP2P();
    this.clearAllTimers();
    this.showdownModalReady.set(false);
    this.activeToast.set(null);

    const code = customCode ? customCode.toUpperCase() : Math.random().toString(36).substring(2, 6).toUpperCase();
    const host: Player = {
      id: this.localPlayerId(),
      name: this.localPlayerName(),
      avatar: 'cyber-1',
      cards: [],
      isHost: true,
      isBot: false,
      connected: true,
      hasPeekedInitial: false,
      score: 0
    };

    this.state.set({
      roomCode: code,
      phase: 'LOBBY',
      players: [host],
      currentTurnPlayerId: host.id,
      cambioCallerId: null,
      frozenPlayerIds: [],
      finalTurnsRemaining: 0,
      drawPileCount: 54,
      discardPile: [],
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `Grid initialized. Room code: [${code}]`,
        type: 'info'
      }]
    });

    this.initP2P(code, true);
    return code;
  }

  joinRoom(code: string, playerName?: string): void {
    this.cleanupP2P();
    this.clearAllTimers();
    this.showdownModalReady.set(false);
    this.activeToast.set(null);

    const roomCode = code.toUpperCase().trim();
    if (!roomCode) return;

    if (playerName && playerName.trim()) {
      this.localPlayerName.set(playerName.trim());
    }

    const localPlayer: Player = {
      id: this.localPlayerId(),
      name: this.localPlayerName(),
      avatar: 'cyber-2',
      cards: [],
      isHost: false,
      isBot: false,
      connected: true,
      hasPeekedInitial: false,
      score: 0
    };

    this.state.set({
      roomCode,
      phase: 'LOBBY',
      players: [localPlayer],
      currentTurnPlayerId: '',
      cambioCallerId: null,
      frozenPlayerIds: [],
      finalTurnsRemaining: 0,
      drawPileCount: 54,
      discardPile: [],
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `Connecting to room [${roomCode}]...`,
        type: 'info'
      }]
    });

    this.initP2P(roomCode, false);
  }

  leaveRoom(): void {
    this.cleanupP2P();
    this.clearAllTimers();
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.showdownModalReady.set(false);
    this.activeToast.set(null);
    this.canonicalDeck = [];

    this.state.set({
      roomCode: '',
      phase: 'LOBBY',
      players: [],
      currentTurnPlayerId: '',
      cambioCallerId: null,
      frozenPlayerIds: [],
      finalTurnsRemaining: 0,
      drawPileCount: 54,
      discardPile: [],
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      logs: []
    });

    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
  }

  updateLocalName(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    this.localPlayerName.set(trimmed);

    const s = this.state();
    if (!s.roomCode) return;

    if (this.isHost()) {
      this.state.update(curr => ({
        ...curr,
        players: curr.players.map(p =>
          p.id === this.localPlayerId() ? { ...p, name: trimmed } : p
        )
      }));
      this.broadcastState();
    } else {
      this.sendPlayerAction?.({
        type: 'UPDATE_NAME',
        playerId: this.localPlayerId(),
        name: trimmed
      });
    }
  }

  addBotPlayer(): void {
    if (!this.isHost()) return;
    const current = this.state().players;
    if (current.length >= 8) {
      this.addLog('Lobby full (Maximum 8 players).', 'danger');
      return;
    }

    const botIndex = current.filter(p => p.isBot).length;
    const botNames = ['K-Vex', 'ZeroCool', 'Nyx-9', 'Phantom', 'Cipher', 'Vortex', 'Apex'];
    const botName = botNames[botIndex % botNames.length] + ' [AI]';

    const bot: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 7)}`,
      name: botName,
      avatar: `cyber-${(botIndex % 4) + 1}`,
      cards: [],
      isHost: false,
      isBot: true,
      connected: true,
      hasPeekedInitial: true,
      score: 0
    };

    this.state.update(s => ({
      ...s,
      players: [...s.players, bot]
    }));
    this.addLog(`${botName} entered the grid.`, 'info');
    this.broadcastState();
  }

  removePlayer(playerId: string): void {
    if (!this.isHost()) return;
    this.state.update(s => ({
      ...s,
      players: s.players.filter(p => p.id !== playerId)
    }));
    this.broadcastState();
  }

  returnToLobby(): void {
    if (!this.isHost()) {
      this.leaveRoom();
      return;
    }
    this.clearAllTimers();
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.showdownModalReady.set(false);
    this.activeToast.set(null);
    this.canonicalDeck = [];

    this.state.update(s => ({
      ...s,
      phase: 'LOBBY',
      players: s.players.map(p => ({ ...p, cards: [], hasPeekedInitial: p.isBot, score: 0 })),
      currentTurnPlayerId: s.players[0]?.id || '',
      cambioCallerId: null,
      frozenPlayerIds: [],
      finalTurnsRemaining: 0,
      drawPileCount: 54,
      discardPile: [],
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: 'Returned to lobby for next match.',
        type: 'info'
      }]
    }));
    this.broadcastState();
  }

  // -------------------------------------------------------------
  // START GAME & INITIAL PEEK
  // -------------------------------------------------------------
  startGame(): void {
    if (!this.isHost()) return;
    const players = this.state().players.map(p => ({ ...p }));
    if (players.length < 2) {
      this.addLog('Need at least 2 players to start! Add AI bots or invite friends.', 'danger');
      return;
    }

    this.clearAllTimers();
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.showdownModalReady.set(false);
    this.activeToast.set(null);

    const deck = shuffleDeck(createDeck(`r_${Date.now().toString(36)}`));

    players.forEach(p => {
      p.cards = deck.splice(0, 4);
      p.hasPeekedInitial = p.isBot;
      p.score = 0;
    });

    const initialDiscard = deck.pop()!;
    this.canonicalDeck = deck;

    this.state.update(s => ({
      ...s,
      phase: 'INITIAL_PEEK',
      players,
      currentTurnPlayerId: players[0].id,
      cambioCallerId: null,
      frozenPlayerIds: [],
      finalTurnsRemaining: 0,
      drawPileCount: this.canonicalDeck.length,
      discardPile: [initialDiscard],
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: 'Match started! Memorize your bottom 2 cards (#3 & #4).',
        type: 'info'
      }]
    }));

    this.sound.playActionPower();
    this.broadcastState();

    // Play staggered deal animation once Arena anchors have mounted
    this.scheduleTimer(() => {
      this.emitAnimation({ type: 'DEAL', playerIds: players.map(p => p.id) });
    }, 60);
  }

  confirmInitialPeek(): void {
    const localId = this.localPlayerId();
    this.state.update(s => ({
      ...s,
      players: s.players.map(p => p.id === localId ? { ...p, hasPeekedInitial: true } : p)
    }));

    if (this.isHost()) {
      this.checkAndStartTurns();
      this.broadcastState();
    } else {
      this.sendPlayerAction?.({ type: 'CONFIRM_PEEK', playerId: localId });
    }
  }

  private checkAndStartTurns(): void {
    const s = this.state();
    if (s.phase === 'INITIAL_PEEK' && s.players.every(p => p.hasPeekedInitial)) {
      this.state.update(st => ({
        ...st,
        phase: 'PLAYING',
        logs: this.appendLog(
          st.logs,
          `All operatives ready! Turn begins with ${st.players[0].name}.`,
          'info'
        )
      }));
      this.broadcastState();

      if (this.state().players[0].isBot) {
        this.scheduleTimer(() => this.runBotTurn(this.state().players[0]), 650);
      }
    }
  }

  // -------------------------------------------------------------
  // TURN ACTIONS: DRAW (UNIFIED HOST/PEER)
  // -------------------------------------------------------------
  drawFromDeck(): void {
    if (this.isAnimating()) return;
    if (!this.isMyTurn() || this.state().drawnCard !== null || this.state().activeAction !== null) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      this.performDrawDeck(this.localPlayerId());
    } else {
      this.sendPlayerAction?.({ type: 'DRAW_DECK', playerId: this.localPlayerId() });
    }
  }

  private performDrawDeck(playerId: string): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== playerId || s.drawnCard !== null || s.activeAction !== null) return;
    if (this.isPlayerFrozen(playerId)) return;

    if (this.canonicalDeck.length === 0) {
      this.recycleDiscardPile();
    }
    const drawn = this.canonicalDeck.pop();
    if (!drawn) {
      this.addLog('No cards remaining in deck or discard to draw!', 'warning');
      this.broadcastState();
      return;
    }

    const player = s.players.find(p => p.id === playerId);
    this.state.update(curr => ({
      ...curr,
      drawnCard: drawn,
      drawnSource: 'DECK',
      drawPileCount: this.canonicalDeck.length,
      logs: this.appendLog(curr.logs, `${player?.name || 'Operative'} drew from Buffer.`, 'action')
    }));
    this.broadcastState();
    this.emitAnimation({ type: 'DRAW', playerId, source: 'DECK', card: drawn });
  }

  drawFromDiscard(): void {
    if (this.isAnimating()) return;
    if (!this.isMyTurn() || this.state().drawnCard !== null || this.state().activeAction !== null || this.state().discardPile.length === 0) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      this.performDrawDiscard(this.localPlayerId());
    } else {
      this.sendPlayerAction?.({ type: 'DRAW_DISCARD', playerId: this.localPlayerId() });
    }
  }

  private performDrawDiscard(playerId: string): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== playerId || s.drawnCard !== null || s.activeAction !== null) return;
    if (s.discardPile.length === 0 || this.isPlayerFrozen(playerId)) return;

    const discard = [...s.discardPile];
    const drawn = discard.pop()!;
    const player = s.players.find(p => p.id === playerId);

    this.state.update(curr => ({
      ...curr,
      drawnCard: drawn,
      drawnSource: 'DISCARD',
      discardPile: discard,
      logs: this.appendLog(
        curr.logs,
        `${player?.name || 'Operative'} took [${this.formatCardTag(drawn)}] from Cache.`,
        'action'
      )
    }));
    this.broadcastState();
    this.emitAnimation({ type: 'DRAW', playerId, source: 'DISCARD', card: drawn });
  }

  // -------------------------------------------------------------
  // TURN ACTIONS: REPLACE / DISCARD (UNIFIED HOST/PEER)
  // -------------------------------------------------------------
  replaceCardInHand(slotIndex: number): void {
    if (this.isAnimating()) return;
    if (!this.isMyTurn() || !this.state().drawnCard) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      this.performReplaceHand(this.localPlayerId(), slotIndex);
    } else {
      this.sendPlayerAction?.({ type: 'REPLACE_HAND', playerId: this.localPlayerId(), slotIndex });
    }
  }

  private performReplaceHand(playerId: string, slotIndex: number): void {
    const s = this.state();
    const drawn = s.drawnCard;
    if (!drawn || s.currentTurnPlayerId !== playerId || this.isPlayerFrozen(playerId)) return;

    const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
    const player = players.find(p => p.id === playerId);
    if (!player || slotIndex < 0 || slotIndex >= player.cards.length) return;

    const oldCard = player.cards[slotIndex];
    if (!oldCard) return; // Cannot swap with an empty placeholder slot

    this.emitAnimation({ type: 'SWAP_HAND', playerId, slotIndex, discardedCard: oldCard });
    player.cards[slotIndex] = drawn;

    this.state.update(curr => ({
      ...curr,
      players,
      drawnCard: null,
      drawnSource: null,
      discardPile: [...curr.discardPile, oldCard],
      logs: this.appendLog(
        curr.logs,
        `${player.name} swapped #${slotIndex + 1} → discarded [${this.formatCardTag(oldCard)}].`,
        'action'
      )
    }));

    this.finishTurn();
  }

  discardDrawnCard(): void {
    if (this.isAnimating()) return;
    const s = this.state();
    if (!this.isMyTurn() || !s.drawnCard || s.drawnSource !== 'DECK') return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      this.performDiscardDrawn(this.localPlayerId());
    } else {
      this.sendPlayerAction?.({ type: 'DISCARD_DRAWN', playerId: this.localPlayerId() });
    }
  }

  private performDiscardDrawn(playerId: string): void {
    const s = this.state();
    const drawn = s.drawnCard;
    if (!drawn || s.drawnSource !== 'DECK' || s.currentTurnPlayerId !== playerId || this.isPlayerFrozen(playerId)) return;

    const player = s.players.find(p => p.id === playerId);
    this.emitAnimation({ type: 'DISCARD_DRAWN', playerId, card: drawn });

    this.state.update(curr => ({
      ...curr,
      drawnCard: null,
      drawnSource: null,
      discardPile: [...curr.discardPile, drawn],
      logs: this.appendLog(
        curr.logs,
        `${player?.name || 'Operative'} discarded [${this.formatCardTag(drawn)}].`,
        'action'
      )
    }));

    if (drawn.action !== 'NONE') {
      this.triggerCardAction(drawn, playerId);
    } else {
      this.finishTurn();
    }
  }

  // -------------------------------------------------------------
  // SPECIAL CARD POWERS (7-8 peek own, 9-10 peek other, J-Q swap)
  // -------------------------------------------------------------
  private triggerCardAction(card: Card, playerId: string): void {
    this.sound.playActionPower();
    const s = this.state();
    const activePlayer = s.players.find(p => p.id === playerId);

    const ownHasCards = activePlayer ? this.countActiveCards(activePlayer.cards) > 0 : false;
    const unfrozenOpponentsWithCards = s.players.filter(
      p => p.id !== playerId && !this.isPlayerFrozen(p.id) && this.countActiveCards(p.cards) > 0
    );
    const totalSwappableCards = s.players
      .filter(p => !this.isPlayerFrozen(p.id))
      .reduce((acc, p) => acc + this.countActiveCards(p.cards), 0);

    if (card.action === 'PEEK_OWN') {
      if (!ownHasCards) {
        this.resolveActionComplete(`${activePlayer?.name} has no cards to peek.`);
        return;
      }
      this.state.update(curr => ({
        ...curr,
        activeAction: {
          type: 'PEEK_OWN',
          sourcePlayerId: playerId,
          message: 'Power 7/8: Pick 1 of your own cards to peek (3s)'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        this.scheduleTimer(() => this.runBotPeekOwn(activePlayer), 550);
      }
    } else if (card.action === 'PEEK_OTHER') {
      if (unfrozenOpponentsWithCards.length === 0) {
        this.resolveActionComplete(`${activePlayer?.name}: No unfrozen opponent cards to peek.`);
        return;
      }
      this.state.update(curr => ({
        ...curr,
        activeAction: {
          type: 'PEEK_OTHER',
          sourcePlayerId: playerId,
          message: 'Power 9/10: Pick a rival card to peek (3s)'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        this.scheduleTimer(() => this.runBotPeekOther(activePlayer), 550);
      }
    } else if (card.action === 'SWAP') {
      if (totalSwappableCards < 2) {
        this.resolveActionComplete(`${activePlayer?.name}: Not enough unfrozen cards to swap.`);
        return;
      }
      this.state.update(curr => ({
        ...curr,
        activeAction: {
          type: 'SWAP_SELECT_FIRST',
          sourcePlayerId: playerId,
          message: 'Power J/Q: Select 1st card to swap'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        this.scheduleTimer(() => this.runBotSwap(activePlayer), 550);
      }
    }
  }

  // -------------------------------------------------------------
  // TEMPORARY PEEK TIMER (Cards open for 3 seconds on click)
  // -------------------------------------------------------------
  isCardTemporarilyOpen(cardId: string): boolean {
    const exp = this.temporarilyOpenCards()[cardId];
    return !!exp && exp > Date.now();
  }

  temporaryRevealCard(cardId: string, durationMs: number = 3000): void {
    const exp = Date.now() + durationMs;
    this.temporarilyOpenCards.update(curr => ({ ...curr, [cardId]: exp }));
    this.scheduleTimer(() => {
      this.temporarilyOpenCards.update(curr => {
        if (curr[cardId] !== exp) return curr;
        const next = { ...curr };
        delete next[cardId];
        return next;
      });
    }, durationMs);
  }

  // -------------------------------------------------------------
  // UNIFIED CARD CLICK INTERACTION
  // -------------------------------------------------------------
  handleCardClick(targetPlayerId: string, slotIndex: number): void {
    if (this.isAnimating()) return;
    const localId = this.localPlayerId();
    const state = this.state();

    if (state.phase !== 'PLAYING') return;

    if (this.isPlayerFrozen(localId)) {
      this.showToast('Your hand is frozen until Showdown', 'info');
      return;
    }

    const targetPlayer = state.players.find(p => p.id === targetPlayerId);
    const clickedCard = targetPlayer?.cards[slotIndex] ?? null;

    // Holding drawn card -> swap with non-empty own card
    if (state.drawnCard !== null) {
      if (targetPlayerId === localId && this.isMyTurn() && clickedCard !== null) {
        this.replaceCardInHand(slotIndex);
      }
      return;
    }

    // Resolving an active special power or card transfer
    if (state.activeAction !== null) {
      const action = state.activeAction;
      if (action.sourcePlayerId !== localId || !clickedCard) return;

      if (action.type === 'TRANSFER_CARD_TO_OPPONENT') {
        if (targetPlayerId === localId) {
          if (this.isHost()) {
            this.transferCardToPlayer(localId, slotIndex, action.targetPlayerId!);
          } else {
            this.sendPlayerAction?.({
              type: 'TRANSFER_CARD',
              fromPlayerId: localId,
              cardIndex: slotIndex,
              toPlayerId: action.targetPlayerId!
            });
          }
        }
        return;
      }

      if (this.isPlayerFrozen(targetPlayerId)) {
        this.showToast('Cannot target a frozen player', 'info');
        return;
      }

      if (action.type === 'PEEK_OWN') {
        if (targetPlayerId !== localId) return;
        this.sound.playCardFlip();
        this.temporaryRevealCard(clickedCard.id, 3000);
        if (this.isHost()) {
          this.performResolvePeek(localId, targetPlayerId, slotIndex, 'PEEK_OWN');
        } else {
          this.sendPlayerAction?.({
            type: 'RESOLVE_PEEK_ACTION',
            playerId: localId,
            targetPlayerId,
            slotIndex,
            actionType: 'PEEK_OWN'
          });
        }
        return;
      }

      if (action.type === 'PEEK_OTHER') {
        if (targetPlayerId === localId) return;
        this.sound.playCardFlip();
        this.temporaryRevealCard(clickedCard.id, 3000);
        if (this.isHost()) {
          this.performResolvePeek(localId, targetPlayerId, slotIndex, 'PEEK_OTHER');
        } else {
          this.sendPlayerAction?.({
            type: 'RESOLVE_PEEK_ACTION',
            playerId: localId,
            targetPlayerId,
            slotIndex,
            actionType: 'PEEK_OTHER'
          });
        }
        return;
      }

      if (action.type === 'SWAP_SELECT_FIRST') {
        this.state.update(s => ({
          ...s,
          activeAction: {
            type: 'SWAP_SELECT_SECOND',
            sourcePlayerId: action.sourcePlayerId,
            targetPlayerId,
            firstCardIndex: slotIndex,
            message: `Select 2nd card to swap (click selected again to cancel)`
          }
        }));
        return;
      }

      if (action.type === 'SWAP_SELECT_SECOND') {
        if (action.targetPlayerId === targetPlayerId && action.firstCardIndex === slotIndex) {
          this.state.update(s => ({
            ...s,
            activeAction: {
              type: 'SWAP_SELECT_FIRST',
              sourcePlayerId: action.sourcePlayerId,
              message: 'Power J/Q: Select 1st card to swap'
            }
          }));
          return;
        }
        this.executeSwap(action.targetPlayerId!, action.firstCardIndex!, targetPlayerId, slotIndex, localId);
        return;
      }
      return;
    }

    // Card-click match / penalty check
    if (!clickedCard) return;
    if (this.isPlayerFrozen(targetPlayerId)) {
      this.showToast('That player is frozen from play', 'info');
      return;
    }

    if (this.isHost()) {
      this.processCardMatchOrPenalty(localId, targetPlayerId, slotIndex);
    } else {
      this.sendPlayerAction?.({ type: 'CARD_CLICK_MATCH', clickerId: localId, targetPlayerId, slotIndex });
    }
  }

  private performResolvePeek(actorId: string, targetPlayerId: string, slotIndex: number, actionType: 'PEEK_OWN' | 'PEEK_OTHER'): void {
    const s = this.state();
    if (!s.activeAction || s.activeAction.sourcePlayerId !== actorId) return;
    const actor = s.players.find(p => p.id === actorId);
    const target = s.players.find(p => p.id === targetPlayerId);

    const msg = actionType === 'PEEK_OWN'
      ? `${actor?.name || 'Operative'} peeked at their card #${slotIndex + 1}.`
      : `${actor?.name || 'Operative'} peeked at ${target?.name || 'rival'}’s card #${slotIndex + 1}.`;

    this.resolveActionComplete(msg);
  }

  processCardMatchOrPenalty(clickerId: string, targetPlayerId: string, slotIndex: number): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.activeAction !== null || s.drawnCard !== null) return;
    if (this.isPlayerFrozen(clickerId) || this.isPlayerFrozen(targetPlayerId)) return;

    const discardPile = s.discardPile;
    if (discardPile.length === 0) return;

    const topDiscard = discardPile[discardPile.length - 1];
    const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
    const targetPlayer = players.find(p => p.id === targetPlayerId);
    const clicker = players.find(p => p.id === clickerId);
    if (!targetPlayer || !clicker) return;

    const clickedCard = targetPlayer.cards[slotIndex];
    if (!clickedCard) return;

    if (clickedCard.rank === topDiscard.rank) {
      // MATCH! Fly card to discard, leave null placeholder at slotIndex
      this.sound.playSnap();
      this.emitAnimation({ type: 'MATCH_DISCARD', targetPlayerId, slotIndex, card: clickedCard });
      this.clearSlot(targetPlayer.cards, slotIndex);

      if (targetPlayerId === clickerId) {
        this.showToast(`Matched ${this.formatCardTag(clickedCard)}! Shed 1 card`, 'snap');
        this.state.update(curr => ({
          ...curr,
          players,
          discardPile: [...curr.discardPile, clickedCard],
          logs: this.appendLog(
            curr.logs,
            `⚡ MATCH! ${clicker.name} shed [${this.formatCardTag(clickedCard)}] from #${slotIndex + 1}.`,
            'snap'
          )
        }));
        this.broadcastState();
      } else {
        this.showToast(`Matched ${targetPlayer.name}'s ${this.formatCardTag(clickedCard)}! Give 1 card`, 'snap');
        this.state.update(curr => ({
          ...curr,
          players,
          discardPile: [...curr.discardPile, clickedCard],
          logs: this.appendLog(
            curr.logs,
            `⚡ OPPONENT MATCH! ${clicker.name} matched ${targetPlayer.name}’s [${this.formatCardTag(clickedCard)}]!`,
            'snap'
          )
        }));

        const clickerActiveCount = this.countActiveCards(clicker.cards);
        if (clickerActiveCount > 0) {
          if (clickerActiveCount === 1 || clicker.isBot) {
            const fromSlot = this.pickRandomActiveSlot(clicker.cards);
            if (fromSlot !== -1) {
              const transferred = clicker.cards[fromSlot]!;
              this.clearSlot(clicker.cards, fromSlot);
              const toSlot = this.insertCardIntoHand(targetPlayer.cards, transferred);
              this.emitAnimation({ type: 'TRANSFER', fromPlayerId: clicker.id, fromSlot, toPlayerId: targetPlayer.id, toSlot });
              this.addLog(`🔄 ${clicker.name} transferred #${fromSlot + 1} to ${targetPlayer.name}.`, 'action');
            }
            this.broadcastState();
          } else {
            this.state.update(curr => ({
              ...curr,
              activeAction: {
                type: 'TRANSFER_CARD_TO_OPPONENT',
                sourcePlayerId: clicker.id,
                targetPlayerId: targetPlayer.id,
                message: `${clicker.name}: Pick one of YOUR cards to give ${targetPlayer.name}`
              }
            }));
            this.broadcastState();
          }
        } else {
          this.broadcastState();
        }
      }
    } else {
      // MISMATCH! Shake + 3s peek + penalty card drawn into lowest empty slot (or #5+)
      this.sound.playActionPower();
      this.temporaryRevealCard(clickedCard.id, 3000);
      this.sendSyncReveal?.({ cardId: clickedCard.id, durationMs: 3000 });
      this.emitAnimation({ type: 'MISMATCH_SHAKE', targetPlayerId, slotIndex });

      if (this.canonicalDeck.length === 0) {
        this.recycleDiscardPile();
      }
      const penaltyCard = this.canonicalDeck.pop();
      if (penaltyCard) {
        const penaltySlot = this.insertCardIntoHand(clicker.cards, penaltyCard);
        this.emitAnimation({ type: 'PENALTY_DRAW', playerId: clicker.id, slotIndex: penaltySlot });
        this.showToast(`Wrong rank (${this.formatCardTag(clickedCard)})! +1 penalty card`, 'danger');
        this.state.update(curr => ({
          ...curr,
          players,
          drawPileCount: this.canonicalDeck.length,
          logs: this.appendLog(
            curr.logs,
            `❌ PENALTY! ${clicker.name} clicked [${this.formatCardTag(clickedCard)}] ≠ [${this.formatCardTag(topDiscard)}]. +1 card at #${penaltySlot + 1}.`,
            'danger'
          )
        }));
      } else {
        this.showToast(`Wrong rank (${this.formatCardTag(clickedCard)})!`, 'danger');
        this.state.update(curr => ({
          ...curr,
          logs: this.appendLog(
            curr.logs,
            `❌ MISMATCH! ${clicker.name} clicked [${this.formatCardTag(clickedCard)}] (deck empty).`,
            'danger'
          )
        }));
      }
      this.broadcastState();
    }
  }

  transferCardToPlayer(fromPlayerId: string, cardIndex: number, toPlayerId: string): void {
    const s = this.state();
    const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
    const fromP = players.find(p => p.id === fromPlayerId);
    const toP = players.find(p => p.id === toPlayerId);
    if (!fromP || !toP || cardIndex < 0 || cardIndex >= fromP.cards.length) return;

    const card = fromP.cards[cardIndex];
    if (!card) return;

    this.clearSlot(fromP.cards, cardIndex);
    const toSlot = this.insertCardIntoHand(toP.cards, card);
    this.emitAnimation({ type: 'TRANSFER', fromPlayerId, fromSlot: cardIndex, toPlayerId, toSlot });

    this.sound.playSnap();
    this.state.update(curr => ({
      ...curr,
      players,
      activeAction: null,
      logs: this.appendLog(curr.logs, `🔄 ${fromP.name} gave #${cardIndex + 1} to ${toP.name}.`, 'action')
    }));
    this.broadcastState();
  }

  private executeSwap(p1Id: string, idx1: number, p2Id: string, idx2: number, actorId: string): void {
    if (this.isHost()) {
      const s = this.state();
      if (this.isPlayerFrozen(p1Id) || this.isPlayerFrozen(p2Id)) return;
      if (p1Id === p2Id && idx1 === idx2) return;

      const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
      const p1 = players.find(p => p.id === p1Id);
      const p2 = players.find(p => p.id === p2Id);
      const actor = players.find(p => p.id === actorId);

      if (p1 && p2 && p1.cards[idx1] && p2.cards[idx2]) {
        const c1 = p1.cards[idx1];
        const c2 = p2.cards[idx2];
        p1.cards[idx1] = c2;
        p2.cards[idx2] = c1;

        this.sound.playSnap();
        this.emitAnimation({ type: 'BLIND_SWAP', p1Id, idx1, p2Id, idx2 });
        this.showToast(`${actor?.name || 'Operative'} swapped ${p1.name} #${idx1 + 1} ↔ ${p2.name} #${idx2 + 1}`, 'info');
        this.state.update(curr => ({ ...curr, players }));
        this.resolveActionComplete(`${actor?.name || 'Operative'} swapped ${p1.name} #${idx1 + 1} ↔ ${p2.name} #${idx2 + 1}.`);
      }
    } else {
      this.sendPlayerAction?.({ type: 'EXECUTE_SWAP', p1Id, idx1, p2Id, idx2, actorId });
    }
  }

  skipAction(): void {
    const action = this.state().activeAction;
    if (!action || action.sourcePlayerId !== this.localPlayerId()) return;

    if (this.isHost()) {
      this.performSkipAction(this.localPlayerId());
    } else {
      this.sendPlayerAction?.({ type: 'SKIP_ACTION', playerId: this.localPlayerId() });
    }
  }

  private performSkipAction(playerId: string): void {
    const s = this.state();
    if (!s.activeAction || s.activeAction.sourcePlayerId !== playerId) return;
    const player = s.players.find(p => p.id === playerId);
    this.resolveActionComplete(`${player?.name || 'Operative'} skipped card power.`);
  }

  private resolveActionComplete(logMsg: string): void {
    this.state.update(s => ({
      ...s,
      activeAction: null,
      logs: this.appendLog(s.logs, logMsg, 'action')
    }));
    this.finishTurn();
  }

  // -------------------------------------------------------------
  // CALL CAMBIO (Freezes caller immediately; each remaining player gets 1 pass & freezes)
  // -------------------------------------------------------------
  callCambio(): void {
    if (!this.isMyTurn() || this.state().drawnCard !== null || this.state().activeAction !== null || this.state().cambioCallerId !== null) return;
    this.sound.playCambioAlert();

    if (this.isHost()) {
      this.performCallCambio(this.localPlayerId());
    } else {
      this.sendPlayerAction?.({ type: 'CALL_CAMBIO', playerId: this.localPlayerId() });
    }
  }

  private performCallCambio(callerId: string): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== callerId || s.cambioCallerId !== null) return;
    if (s.drawnCard !== null || s.activeAction !== null) return;

    const caller = s.players.find(p => p.id === callerId);
    const frozen = [callerId];
    const remaining = s.players.length - frozen.length;

    this.sound.playCambioAlert();
    this.emitAnimation({ type: 'FREEZE', playerId: callerId });
    this.showToast(`${caller?.name || 'Operative'} called CAMBIO!`, 'cambio', 2400);

    this.state.update(curr => ({
      ...curr,
      cambioCallerId: callerId,
      frozenPlayerIds: frozen,
      finalTurnsRemaining: remaining,
      logs: this.appendLog(
        curr.logs,
        `🚨 ${caller?.name || 'Operative'} CALLED CAMBIO! Their hand is FROZEN.`,
        'cambio'
      )
    }));

    this.advanceAfterCambioOrTurn(false);
  }

  // -------------------------------------------------------------
  // TURN ROTATION, PROGRESSIVE FREEZE & ROUND COMPLETION
  // -------------------------------------------------------------
  private finishTurn(): void {
    if (!this.isHost()) return;
    this.advanceAfterCambioOrTurn(true);
  }

  private advanceAfterCambioOrTurn(freezeFinishedPlayerIfCambio: boolean): void {
    const s = this.state();
    const players = s.players;
    let frozen = [...s.frozenPlayerIds];

    if (s.cambioCallerId !== null && freezeFinishedPlayerIfCambio) {
      const finishedId = s.currentTurnPlayerId;
      if (!frozen.includes(finishedId)) {
        frozen.push(finishedId);
        const finishedPlayer = players.find(p => p.id === finishedId);
        this.emitAnimation({ type: 'FREEZE', playerId: finishedId });
        this.state.update(curr => ({
          ...curr,
          frozenPlayerIds: frozen,
          finalTurnsRemaining: Math.max(0, players.length - frozen.length),
          logs: this.appendLog(
            curr.logs,
            `❄️ ${finishedPlayer?.name || 'Operative'} finished final pass. Cards FROZEN.`,
            'info'
          )
        }));
      }
    }

    if (s.cambioCallerId !== null && frozen.length >= players.length) {
      this.endGame();
      return;
    }

    const currentIndex = players.findIndex(p => p.id === s.currentTurnPlayerId);
    let nextPlayer: Player | null = null;
    for (let step = 1; step <= players.length; step++) {
      const candidate = players[(currentIndex + step) % players.length];
      if (!frozen.includes(candidate.id)) {
        nextPlayer = candidate;
        break;
      }
    }

    if (!nextPlayer) {
      this.endGame();
      return;
    }

    this.state.update(curr => ({
      ...curr,
      currentTurnPlayerId: nextPlayer!.id,
      drawnCard: null,
      drawnSource: null,
      activeAction: null
    }));
    this.broadcastState();

    if (nextPlayer.isBot) {
      this.scheduleTimer(() => this.runBotTurn(nextPlayer!), 550);
    }
  }

  private endGame(): void {
    this.clearAllTimers();
    this.sound.playVictory();

    const players = this.state().players.map(p => {
      const totalScore = p.cards.reduce((sum, c) => sum + (c ? c.pointValue : 0), 0);
      return { ...p, score: totalScore };
    });

    const allKnown: Record<string, Card> = {};
    players.forEach(p => p.cards.forEach(c => { if (c) allKnown[c.id] = c; }));
    this.knownCards.set(allKnown);

    const sorted = [...players].sort((a, b) => a.score - b.score);
    const lowestScore = sorted[0]?.score ?? 0;
    const winners = sorted.filter(p => p.score === lowestScore).map(p => p.name).join(' & ');

    this.showdownModalReady.set(false);
    this.emitAnimation({ type: 'SHOWDOWN' });

    this.state.update(s => ({
      ...s,
      phase: 'GAME_OVER',
      players,
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      finalTurnsRemaining: 0,
      logs: this.appendLog(s.logs, `🏆 GAME OVER! Winner: ${winners} (${lowestScore} pts)`, 'cambio')
    }));
    this.broadcastState();

    // Delay scoreboard modal so players see all cards flip face-up first
    const revealDelay = this.flightService.prefersReducedMotion() ? 150 : 1200;
    this.scheduleTimer(() => {
      this.showdownModalReady.set(true);
      confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 } });
    }, revealDelay);
  }

  private recycleDiscardPile(): void {
    const discard = [...this.state().discardPile];
    if (discard.length <= 1) return;
    const topCard = discard.pop()!;
    this.canonicalDeck = shuffleDeck(discard);
    this.state.update(s => ({
      ...s,
      discardPile: [topCard],
      drawPileCount: this.canonicalDeck.length
    }));
  }

  // -------------------------------------------------------------
  // STAGED AI BOT SIMULATION (Visual draw -> pause -> resolve)
  // -------------------------------------------------------------
  private runBotTurn(bot: Player): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== bot.id || this.isPlayerFrozen(bot.id)) return;

    const currentBot = s.players.find(p => p.id === bot.id);
    if (!currentBot) return;

    const botCardCount = this.countActiveCards(currentBot.cards);
    if (botCardCount === 0) {
      if (s.cambioCallerId === null) {
        this.performCallCambio(currentBot.id);
      } else {
        this.finishTurn();
      }
      return;
    }

    const activeCards = currentBot.cards.filter((c): c is Card => c !== null);
    const sampleCards = activeCards.slice(-2);
    const knownBotPoints = sampleCards.reduce((sum, c) => sum + c.pointValue, 0);
    if (s.cambioCallerId === null && knownBotPoints <= 4 && botCardCount <= 4 && Math.random() < 0.45) {
      this.performCallCambio(currentBot.id);
      return;
    }

    // Stage 1: Bot draws from Discard or Deck so players see the draw flight
    const topDiscard = s.discardPile[s.discardPile.length - 1];
    if (topDiscard && topDiscard.pointValue <= 3 && Math.random() < 0.75) {
      this.sound.playCardFlip();
      this.performDrawDiscard(currentBot.id);
      this.scheduleTimer(() => this.runBotResolveDrawn(currentBot.id), 550);
    } else {
      this.sound.playCardFlip();
      this.performDrawDeck(currentBot.id);
      this.scheduleTimer(() => this.runBotResolveDrawn(currentBot.id), 550);
    }
  }

  private runBotResolveDrawn(botId: string): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== botId || !s.drawnCard) return;
    const bot = s.players.find(p => p.id === botId);
    if (!bot) return;

    const drawn = s.drawnCard;
    if (s.drawnSource === 'DISCARD' || drawn.pointValue <= 4) {
      const replaceIdx = this.pickRandomActiveSlot(bot.cards);
      if (replaceIdx !== -1) {
        this.sound.playCardFlip();
        this.performReplaceHand(bot.id, replaceIdx);
        return;
      }
    }

    this.sound.playCardFlip();
    this.performDiscardDrawn(bot.id);
  }

  private runBotPeekOwn(bot: Player): void {
    this.resolveActionComplete(`${bot.name} peeked at one of its own cards.`);
  }

  private runBotPeekOther(bot: Player): void {
    const opponents = this.state().players.filter(
      p => p.id !== bot.id && !this.isPlayerFrozen(p.id) && this.countActiveCards(p.cards) > 0
    );
    if (opponents.length === 0) {
      this.resolveActionComplete(`${bot.name} skipped peek.`);
      return;
    }
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    this.resolveActionComplete(`${bot.name} peeked at ${target.name}’s hand.`);
  }

  private runBotSwap(bot: Player): void {
    const s = this.state();
    const currentBot = s.players.find(p => p.id === bot.id);
    const opponents = s.players.filter(
      p => p.id !== bot.id && !this.isPlayerFrozen(p.id) && this.countActiveCards(p.cards) > 0
    );

    if (currentBot && opponents.length > 0) {
      const botIdx = this.pickRandomActiveSlot(currentBot.cards);
      const target = opponents[Math.floor(Math.random() * opponents.length)];
      const targetIdx = this.pickRandomActiveSlot(target.cards);

      if (botIdx !== -1 && targetIdx !== -1) {
        this.executeSwap(currentBot.id, botIdx, target.id, targetIdx, currentBot.id);
        return;
      }
    }
    this.resolveActionComplete(`${bot.name} skipped swap.`);
  }

  // -------------------------------------------------------------
  // NETWORKING: TRYSTERO WEBRTC P2P (v0.26.0 API)
  // -------------------------------------------------------------
  private cleanupP2P(): void {
    try {
      this.p2pRoom?.leave();
    } catch {}
    this.p2pRoom = null;
    this.sendSyncState = null;
    this.sendPlayerAction = null;
    this.sendSyncReveal = null;
    this.sendAnimEvent = null;
    this.peerToPlayerId.clear();
    this.hasAnnouncedJoin = false;
  }

  private initP2P(roomCode: string, asHost: boolean): void {
    try {
      const room = joinRoom({ appId: APP_ID }, roomCode);
      this.p2pRoom = room;

      const syncAction = room.makeAction<any>('SYNC_STATE');
      const playerAction = room.makeAction<any>('PLAYER_ACTION');
      const revealAction = room.makeAction<any>('SYNC_REVEAL');
      const animAction = room.makeAction<any>('ANIM_EVENT');

      this.sendSyncState = (data: GameState) => syncAction.send(data).catch(() => {});
      this.sendPlayerAction = (data: any) => playerAction.send(data).catch(() => {});
      this.sendSyncReveal = (data: { cardId: string; durationMs: number }) =>
        revealAction.send(data).catch(() => {});
      this.sendAnimEvent = (data: AnimationEvent) =>
        animAction.send(data).catch(() => {});

      revealAction.onMessage = (data: { cardId: string; durationMs: number }) => {
        this.sound.playCardFlip();
        this.temporaryRevealCard(data.cardId, data.durationMs);
      };

      animAction.onMessage = (event: AnimationEvent) => {
        if (!this.isHost()) {
          this.flightService.playEvent(event, this.localPlayerId());
          if (event.type === 'SHOWDOWN') {
            this.showdownModalReady.set(false);
            const delay = this.flightService.prefersReducedMotion() ? 150 : 1200;
            this.scheduleTimer(() => this.showdownModalReady.set(true), delay);
          }
        }
      };

      room.onPeerJoin = () => {
        if (asHost) {
          this.broadcastState();
        } else {
          this.sendPlayerAction?.({
            type: 'JOIN',
            playerId: this.localPlayerId(),
            name: this.localPlayerName()
          });
          this.hasAnnouncedJoin = true;
        }
      };

      room.onPeerLeave = (peerId: string) => {
        const mappedPlayerId = this.peerToPlayerId.get(peerId);
        if (asHost && mappedPlayerId) {
          const p = this.state().players.find(x => x.id === mappedPlayerId);
          this.addLog(`${p?.name || 'Operative'} disconnected.`, 'warning');
          if (this.state().phase === 'LOBBY') {
            this.removePlayer(mappedPlayerId);
          } else {
            this.state.update(curr => ({
              ...curr,
              players: curr.players.map(x => x.id === mappedPlayerId ? { ...x, connected: false } : x)
            }));
            this.broadcastState();
          }
        }
      };

      syncAction.onMessage = (remoteState: GameState) => {
        if (!this.isHost()) {
          const prevPhase = this.state().phase;
          this.state.set(remoteState);
          if (prevPhase !== 'GAME_OVER' && remoteState.phase === 'GAME_OVER') {
            const delay = this.flightService.prefersReducedMotion() ? 150 : 1200;
            this.scheduleTimer(() => this.showdownModalReady.set(true), delay);
          } else if (remoteState.phase !== 'GAME_OVER') {
            this.showdownModalReady.set(false);
          }

          const amInRoster = remoteState.players.some(p => p.id === this.localPlayerId());
          if (!amInRoster && remoteState.phase === 'LOBBY' && !this.hasAnnouncedJoin) {
            this.sendPlayerAction?.({
              type: 'JOIN',
              playerId: this.localPlayerId(),
              name: this.localPlayerName()
            });
            this.hasAnnouncedJoin = true;
          }
        }
      };

      playerAction.onMessage = (action: any, context: { peerId: string }) => {
        if (this.isHost()) {
          this.handleRemoteAction(action, context.peerId);
        }
      };
    } catch (err) {
      console.warn('P2P connection initialized in local standalone mode', err);
    }
  }

  private broadcastState(): void {
    if (this.sendSyncState && this.isHost()) {
      this.sendSyncState(this.state());
    }
  }

  private handleRemoteAction(action: any, senderId: string): void {
    const actorId = action.playerId || senderId;

    switch (action.type) {
      case 'JOIN': {
        this.peerToPlayerId.set(senderId, actorId);
        const current = this.state().players;
        if (this.state().phase !== 'LOBBY') return;

        const existing = current.find(p => p.id === actorId);
        if (existing) {
          this.state.update(s => ({
            ...s,
            players: s.players.map(p => p.id === actorId ? { ...p, connected: true, name: action.name || p.name } : p)
          }));
          this.broadcastState();
        } else if (current.length < 8) {
          const newPlayer: Player = {
            id: actorId,
            name: action.name || 'Operative_' + actorId.slice(-4),
            avatar: `cyber-${(current.length % 4) + 1}`,
            cards: [],
            isHost: false,
            isBot: false,
            connected: true,
            hasPeekedInitial: false,
            score: 0
          };
          this.state.update(s => ({
            ...s,
            players: [...s.players, newPlayer],
            logs: this.appendLog(s.logs, `${newPlayer.name} connected to the lobby.`, 'info')
          }));
          this.broadcastState();
        }
        break;
      }
      case 'UPDATE_NAME': {
        this.state.update(s => ({
          ...s,
          players: s.players.map(p => p.id === actorId ? { ...p, name: action.name } : p)
        }));
        this.broadcastState();
        break;
      }
      case 'CONFIRM_PEEK': {
        this.state.update(s => ({
          ...s,
          players: s.players.map(p => p.id === actorId ? { ...p, hasPeekedInitial: true } : p)
        }));
        this.checkAndStartTurns();
        this.broadcastState();
        break;
      }
      case 'DRAW_DECK': {
        this.performDrawDeck(actorId);
        break;
      }
      case 'DRAW_DISCARD': {
        this.performDrawDiscard(actorId);
        break;
      }
      case 'REPLACE_HAND': {
        this.performReplaceHand(actorId, action.slotIndex);
        break;
      }
      case 'DISCARD_DRAWN': {
        this.performDiscardDrawn(actorId);
        break;
      }
      case 'CALL_CAMBIO': {
        this.performCallCambio(actorId);
        break;
      }
      case 'RESOLVE_PEEK_ACTION': {
        this.performResolvePeek(actorId, action.targetPlayerId, action.slotIndex, action.actionType);
        break;
      }
      case 'SKIP_ACTION': {
        this.performSkipAction(actorId);
        break;
      }
      case 'CARD_CLICK_MATCH': {
        this.processCardMatchOrPenalty(action.clickerId || actorId, action.targetPlayerId, action.slotIndex);
        break;
      }
      case 'TRANSFER_CARD': {
        this.transferCardToPlayer(action.fromPlayerId || actorId, action.cardIndex, action.toPlayerId);
        break;
      }
      case 'EXECUTE_SWAP': {
        this.executeSwap(action.p1Id, action.idx1, action.p2Id, action.idx2, action.actorId || actorId);
        break;
      }
    }
  }

  private addLog(message: string, type: GameLogEntry['type'] = 'info'): void {
    this.state.update(s => ({
      ...s,
      logs: this.appendLog(s.logs, message, type)
    }));
  }
}
