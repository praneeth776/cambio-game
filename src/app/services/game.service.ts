import { Injectable, signal, computed } from '@angular/core';
import { Card, Player, GameState, GameLogEntry } from '../models/game.models';
import { createDeck, shuffleDeck, getSuitSymbol } from '../utils/card.utils';
import { SoundService } from './sound.service';
import confetti from 'canvas-confetti';
// Trystero import for zero-server WebRTC peer connections
// @ts-ignore
import { joinRoom } from 'trystero/nostr';

const APP_ID = 'cambio-p2p-v1';

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

  // Local card knowledge map (used for game-over reveal / internal tracking)
  readonly knownCards = signal<Record<string, Card>>({});

  // Temporary peek overlay (legacy fallback if needed)
  readonly activePeek = signal<{ card: Card; ownerName: string; slotIndex: number; expiresAt: number } | null>(null);

  // Private canonical deck kept by the Room Host
  private canonicalDeck: Card[] = [];

  // Trystero P2P Room instance & message channels
  private p2pRoom: any = null;
  private sendSyncState: any = null;
  private sendPlayerAction: any = null;
  private sendSyncReveal: any = null;
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

  constructor(private sound: SoundService) {}

  isPlayerFrozen(playerId: string): boolean {
    return this.state().frozenPlayerIds.includes(playerId);
  }

  private formatCardTag(card: Card): string {
    if (card.suit === 'joker') return 'JKR🃏';
    return `${card.label}${getSuitSymbol(card.suit)}`;
  }

  // -------------------------------------------------------------
  // LOBBY & ROOM INITIALIZATION
  // -------------------------------------------------------------
  createRoom(customCode?: string): string {
    this.cleanupP2P();
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
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.activePeek.set(null);
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
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.activePeek.set(null);
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

    // Reset transient local caches
    this.temporarilyOpenCards.set({});
    this.knownCards.set({});
    this.activePeek.set(null);

    // Prepare fresh 54-card deck (52 + 2 Jokers)
    const deck = shuffleDeck(createDeck(`r_${Date.now().toString(36)}`));

    // Deal 4 cards to each player
    players.forEach(p => {
      p.cards = deck.splice(0, 4);
      p.hasPeekedInitial = p.isBot; // bots automatically memorize
      p.score = 0;
    });

    // Top card of deck starts the discard pile
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
        message: 'Match initialized! Memorize your bottom 2 chips (#3 & #4).',
        type: 'info'
      }]
    }));

    this.sound.playActionPower();
    this.broadcastState();
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
        logs: [...st.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `All operatives locked in! Cards closed. Turn begins with ${st.players[0].name}.`,
          type: 'info'
        }]
      }));
      this.broadcastState();

      if (this.state().players[0].isBot) {
        setTimeout(() => this.runBotTurn(this.state().players[0]), 1200);
      }
    }
  }

  // -------------------------------------------------------------
  // TURN ACTIONS: DRAW (UNIFIED HOST/PEER)
  // -------------------------------------------------------------
  drawFromDeck(): void {
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
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `${player?.name || 'Operative'} drew a card from the Memory Buffer.`,
        type: 'action'
      }]
    }));
    this.broadcastState();
  }

  drawFromDiscard(): void {
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
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `${player?.name || 'Operative'} took top discard [${this.formatCardTag(drawn)}] (must swap into hand).`,
        type: 'action'
      }]
    }));
    this.broadcastState();
  }

  // -------------------------------------------------------------
  // TURN ACTIONS: REPLACE / DISCARD (UNIFIED HOST/PEER)
  // -------------------------------------------------------------
  replaceCardInHand(slotIndex: number): void {
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
    player.cards[slotIndex] = drawn;

    this.state.update(curr => ({
      ...curr,
      players,
      drawnCard: null,
      drawnSource: null,
      discardPile: [...curr.discardPile, oldCard],
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `${player.name} swapped chip #${slotIndex + 1} and discarded [${this.formatCardTag(oldCard)}].`,
        type: 'action'
      }]
    }));

    this.finishTurn();
  }

  discardDrawnCard(): void {
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
    this.state.update(curr => ({
      ...curr,
      drawnCard: null,
      drawnSource: null,
      discardPile: [...curr.discardPile, drawn],
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `${player?.name || 'Operative'} discarded drawn card [${this.formatCardTag(drawn)}].`,
        type: 'action'
      }]
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

    // Check if valid targets exist (e.g. unfrozen players with >=1 card)
    const ownHasCards = (activePlayer?.cards.length || 0) > 0;
    const unfrozenOpponentsWithCards = s.players.filter(
      p => p.id !== playerId && !this.isPlayerFrozen(p.id) && p.cards.length > 0
    );
    const totalSwappableCards = s.players
      .filter(p => !this.isPlayerFrozen(p.id))
      .reduce((acc, p) => acc + p.cards.length, 0);

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
          message: 'Rank 7/8: Select 1 of your own chips to decrypt for 3s!'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        setTimeout(() => this.runBotPeekOwn(activePlayer), 1000);
      }
    } else if (card.action === 'PEEK_OTHER') {
      if (unfrozenOpponentsWithCards.length === 0) {
        this.resolveActionComplete(`${activePlayer?.name}: No unfrozen opponent cards to inspect.`);
        return;
      }
      this.state.update(curr => ({
        ...curr,
        activeAction: {
          type: 'PEEK_OTHER',
          sourcePlayerId: playerId,
          message: 'Rank 9/10: Select an unfrozen rival’s chip to inspect for 3s!'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        setTimeout(() => this.runBotPeekOther(activePlayer), 1000);
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
          message: 'Rank J/Q: Select the 1st unfrozen chip to swap!'
        }
      }));
      this.broadcastState();

      if (activePlayer?.isBot) {
        setTimeout(() => this.runBotSwap(activePlayer), 1000);
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
    setTimeout(() => {
      this.temporarilyOpenCards.update(curr => {
        // Only clear if another click hasn't extended this card's timer
        if (curr[cardId] !== exp) return curr;
        const next = { ...curr };
        delete next[cardId];
        return next;
      });
    }, durationMs);
  }

  // -------------------------------------------------------------
  // UNIFIED CARD CLICK INTERACTION
  // 1. In INITIAL_PEEK: no extra peeks allowed (bottom 2 are shown automatically until confirmed)
  // 2. Frozen player hands cannot interact or be targeted
  // 3. If drew a card: switches clicked card with drawn card & discards clicked card
  // 4. If resolving power action: executes peek/swap/transfer
  // 5. Otherwise: opens clicked card for 3s; if discard matches -> discards (and transfers if opponent's); if mismatch -> +1 penalty card!
  // -------------------------------------------------------------
  handleCardClick(targetPlayerId: string, slotIndex: number): void {
    const localId = this.localPlayerId();
    const state = this.state();

    if (state.phase !== 'PLAYING') return;

    // Frozen players cannot click or interact with cards
    if (this.isPlayerFrozen(localId)) {
      this.addLog('❄️ Your hand is FROZEN until Showdown!', 'warning');
      return;
    }

    // Condition 3: Holding drawn card -> swap with own card
    if (state.drawnCard !== null) {
      if (targetPlayerId === localId && this.isMyTurn()) {
        this.replaceCardInHand(slotIndex);
      }
      return;
    }

    // Resolving an active special power or card transfer
    if (state.activeAction !== null) {
      const action = state.activeAction;
      if (action.sourcePlayerId !== localId) return;

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

      // Prevent targeting frozen players for peeks or swaps
      if (this.isPlayerFrozen(targetPlayerId)) {
        this.addLog('❄️ Cannot target a FROZEN player’s cards!', 'warning');
        return;
      }

      if (action.type === 'PEEK_OWN') {
        if (targetPlayerId !== localId) return;
        const me = state.players.find(p => p.id === localId);
        const card = me?.cards[slotIndex];
        if (card) {
          // Open privately for 3 seconds for local player only
          this.sound.playCardFlip();
          this.temporaryRevealCard(card.id, 3000);
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
        }
        return;
      }

      if (action.type === 'PEEK_OTHER') {
        if (targetPlayerId === localId) return;
        const targetP = state.players.find(p => p.id === targetPlayerId);
        const card = targetP?.cards[slotIndex];
        if (card && targetP) {
          // Open privately for 3 seconds for local player only
          this.sound.playCardFlip();
          this.temporaryRevealCard(card.id, 3000);
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
        }
        return;
      }

      if (action.type === 'SWAP_SELECT_FIRST') {
        const targetP = state.players.find(p => p.id === targetPlayerId);
        if (!targetP || !targetP.cards[slotIndex]) return;
        this.state.update(s => ({
          ...s,
          activeAction: {
            type: 'SWAP_SELECT_SECOND',
            sourcePlayerId: action.sourcePlayerId,
            targetPlayerId,
            firstCardIndex: slotIndex,
            message: `1st chip selected (${targetPlayerId === localId ? 'yours' : targetP.name}'s #${slotIndex + 1}). Click a different chip to swap (or click again to deselect)!`
          }
        }));
        return;
      }

      if (action.type === 'SWAP_SELECT_SECOND') {
        // Clicking the exact same card deselects it
        if (action.targetPlayerId === targetPlayerId && action.firstCardIndex === slotIndex) {
          this.state.update(s => ({
            ...s,
            activeAction: {
              type: 'SWAP_SELECT_FIRST',
              sourcePlayerId: action.sourcePlayerId,
              message: 'Rank J/Q: Select the 1st unfrozen chip to swap!'
            }
          }));
          return;
        }
        this.executeSwap(action.targetPlayerId!, action.firstCardIndex!, targetPlayerId, slotIndex, localId);
        return;
      }
      return;
    }

    // Condition 1 & 2: Match against discard OR penalty
    if (this.isPlayerFrozen(targetPlayerId)) {
      this.addLog('❄️ That player’s cards are FROZEN from play!', 'warning');
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
      ? `${actor?.name || 'Operative'} decrypted their chip #${slotIndex + 1} (3s peek).`
      : `${actor?.name || 'Operative'} infiltrated ${target?.name || 'rival'}’s chip #${slotIndex + 1} (3s peek).`;

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

    // 1. SIDE EFFECT: PEEK FUNCTION OPENS THE CARD FOR 3 SECONDS FOR EVERYONE
    this.temporaryRevealCard(clickedCard.id, 3000);
    this.sound.playCardFlip();
    this.sendSyncReveal?.({ cardId: clickedCard.id, durationMs: 3000 });

    // 2. CHECK MATCH AGAINST TOP DISCARD
    if (clickedCard.rank === topDiscard.rank) {
      this.sound.playSnap();
      targetPlayer.cards.splice(slotIndex, 1);

      if (targetPlayerId === clickerId) {
        // Matched own card: shed card!
        this.state.update(curr => ({
          ...curr,
          players,
          discardPile: [...curr.discardPile, clickedCard],
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `⚡ MATCH! ${clicker.name} matched [${this.formatCardTag(clickedCard)}] and shed their card!`,
            type: 'snap'
          }]
        }));
        this.broadcastState();
      } else {
        // Matched opponent's card: discard opponent's card and transfer 1 of clicker's cards to opponent
        this.state.update(curr => ({
          ...curr,
          players,
          discardPile: [...curr.discardPile, clickedCard],
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `⚡ OPPONENT MATCH! ${clicker.name} matched ${targetPlayer.name}’s [${this.formatCardTag(clickedCard)}] card!`,
            type: 'snap'
          }]
        }));

        if (clicker.cards.length > 0) {
          if (clicker.cards.length === 1 || clicker.isBot) {
            const transferred = clicker.cards.pop()!;
            targetPlayer.cards.push(transferred);
            this.addLog(`🔄 ${clicker.name} gave 1 card to ${targetPlayer.name} as replacement!`, 'action');
            this.broadcastState();
          } else {
            // Let any human clicker (host OR remote peer) select which card to give!
            this.state.update(curr => ({
              ...curr,
              activeAction: {
                type: 'TRANSFER_CARD_TO_OPPONENT',
                sourcePlayerId: clicker.id,
                targetPlayerId: targetPlayer.id,
                message: `${clicker.name}: Match successful! Select one of YOUR chips to hand over to ${targetPlayer.name}.`
              }
            }));
            this.broadcastState();
          }
        } else {
          this.broadcastState();
        }
      }
    } else {
      // MISMATCH: Player gets additional penalty card from draw deck!
      this.sound.playActionPower();
      if (this.canonicalDeck.length === 0) {
        this.recycleDiscardPile();
      }
      const penaltyCard = this.canonicalDeck.pop();
      if (penaltyCard) {
        clicker.cards.push(penaltyCard);
        this.state.update(curr => ({
          ...curr,
          players,
          drawPileCount: this.canonicalDeck.length,
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `❌ MISMATCH PENALTY! ${clicker.name} clicked [${this.formatCardTag(clickedCard)}] (discard is [${this.formatCardTag(topDiscard)}]). Drew +1 penalty card!`,
            type: 'danger'
          }]
        }));
      } else {
        this.state.update(curr => ({
          ...curr,
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `❌ MISMATCH! ${clicker.name} clicked [${this.formatCardTag(clickedCard)}] (deck empty, no penalty card left).`,
            type: 'danger'
          }]
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

    const card = fromP.cards.splice(cardIndex, 1)[0];
    toP.cards.push(card);

    this.sound.playSnap();
    this.state.update(curr => ({
      ...curr,
      players,
      activeAction: null,
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `🔄 ${fromP.name} gave chip #${cardIndex + 1} to ${toP.name}!`,
        type: 'action'
      }]
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
        this.state.update(curr => ({ ...curr, players }));
        this.resolveActionComplete(`${actor?.name || 'Operative'} swapped ${p1.name}’s #${idx1 + 1} with ${p2.name}’s #${idx2 + 1}!`);
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
    this.resolveActionComplete(`${player?.name || 'Operative'} skipped the special card power.`);
  }

  private resolveActionComplete(logMsg: string): void {
    this.state.update(s => ({
      ...s,
      activeAction: null,
      logs: [...s.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: logMsg,
        type: 'action'
      }]
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
    this.state.update(curr => ({
      ...curr,
      cambioCallerId: callerId,
      frozenPlayerIds: frozen,
      finalTurnsRemaining: remaining,
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `🚨 ${caller?.name || 'Operative'} CALLED CAMBIO! Their cards are FROZEN. Remaining players get 1 final pass!`,
        type: 'cambio'
      }]
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

    // If Cambio is active and the current player just finished their final pass, freeze their cards!
    if (s.cambioCallerId !== null && freezeFinishedPlayerIfCambio) {
      const finishedId = s.currentTurnPlayerId;
      if (!frozen.includes(finishedId)) {
        frozen.push(finishedId);
        const finishedPlayer = players.find(p => p.id === finishedId);
        this.state.update(curr => ({
          ...curr,
          frozenPlayerIds: frozen,
          finalTurnsRemaining: Math.max(0, players.length - frozen.length),
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `❄️ ${finishedPlayer?.name || 'Operative'} finished their final pass. Cards FROZEN!`,
            type: 'info'
          }]
        }));
      }
    }

    // If all players are frozen, everyone has had their pass -> Showdown!
    if (s.cambioCallerId !== null && frozen.length >= players.length) {
      this.endGame();
      return;
    }

    // Find next unfrozen player in turn order
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
      setTimeout(() => this.runBotTurn(nextPlayer!), 1500);
    }
  }

  private endGame(): void {
    this.sound.playVictory();
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    const players = this.state().players.map(p => {
      const totalScore = p.cards.reduce((sum, c) => sum + c.pointValue, 0);
      return { ...p, score: totalScore };
    });

    const allKnown: Record<string, Card> = {};
    players.forEach(p => p.cards.forEach(c => allKnown[c.id] = c));
    this.knownCards.set(allKnown);

    const sorted = [...players].sort((a, b) => a.score - b.score);
    const lowestScore = sorted[0]?.score ?? 0;
    const winners = sorted.filter(p => p.score === lowestScore).map(p => p.name).join(' & ');

    this.state.update(s => ({
      ...s,
      phase: 'GAME_OVER',
      players,
      drawnCard: null,
      drawnSource: null,
      activeAction: null,
      finalTurnsRemaining: 0,
      logs: [...s.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `🏆 GAME OVER! Winner: ${winners} with ${lowestScore} points!`,
        type: 'cambio'
      }]
    }));
    this.broadcastState();
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
  // SMART AI BOT SIMULATION (Null-safe & Freeze-aware)
  // -------------------------------------------------------------
  private runBotTurn(bot: Player): void {
    const s = this.state();
    if (s.phase !== 'PLAYING' || s.currentTurnPlayerId !== bot.id || this.isPlayerFrozen(bot.id)) return;

    // Fetch latest bot reference from state
    const currentBot = s.players.find(p => p.id === bot.id);
    if (!currentBot) return;

    // If bot has 0 cards, call Cambio immediately if allowed, otherwise pass
    if (currentBot.cards.length === 0) {
      if (s.cambioCallerId === null) {
        this.performCallCambio(currentBot.id);
      } else {
        this.finishTurn();
      }
      return;
    }

    // Check if bot wants to call Cambio (only if nobody called it yet and bot holds low points)
    const sampleCards = currentBot.cards.slice(-2);
    const knownBotPoints = sampleCards.reduce((sum, c) => sum + c.pointValue, 0);
    if (s.cambioCallerId === null && knownBotPoints <= 4 && currentBot.cards.length <= 4 && Math.random() < 0.45) {
      this.performCallCambio(currentBot.id);
      return;
    }

    // Bot decides to draw from discard or deck
    const topDiscard = s.discardPile[s.discardPile.length - 1];
    if (topDiscard && topDiscard.pointValue <= 3 && Math.random() < 0.75) {
      const discard = [...s.discardPile];
      const taken = discard.pop()!;
      const replaceIdx = Math.floor(Math.random() * currentBot.cards.length);
      const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
      const botCopy = players.find(p => p.id === currentBot.id)!;
      const oldCard = botCopy.cards[replaceIdx];
      botCopy.cards[replaceIdx] = taken;

      this.sound.playCardFlip();
      this.state.update(curr => ({
        ...curr,
        players,
        discardPile: [...discard, oldCard],
        logs: [...curr.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${currentBot.name} took discard [${this.formatCardTag(taken)}] and replaced chip #${replaceIdx + 1}.`,
          type: 'action'
        }]
      }));
      this.finishTurn();
    } else {
      if (this.canonicalDeck.length === 0) this.recycleDiscardPile();
      const drawn = this.canonicalDeck.pop();
      if (!drawn) {
        this.finishTurn();
        return;
      }

      this.sound.playCardFlip();
      if (drawn.pointValue <= 4) {
        const replaceIdx = Math.floor(Math.random() * currentBot.cards.length);
        const players = this.state().players.map(p => ({ ...p, cards: [...p.cards] }));
        const botCopy = players.find(p => p.id === currentBot.id)!;
        const oldCard = botCopy.cards[replaceIdx];
        botCopy.cards[replaceIdx] = drawn;

        this.state.update(curr => ({
          ...curr,
          players,
          discardPile: [...curr.discardPile, oldCard],
          drawPileCount: this.canonicalDeck.length,
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `${currentBot.name} drew from buffer, swapped chip #${replaceIdx + 1}, discarded [${this.formatCardTag(oldCard)}].`,
            type: 'action'
          }]
        }));
        this.finishTurn();
      } else {
        this.state.update(curr => ({
          ...curr,
          discardPile: [...curr.discardPile, drawn],
          drawPileCount: this.canonicalDeck.length,
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `${currentBot.name} drew & discarded [${this.formatCardTag(drawn)}].`,
            type: 'action'
          }]
        }));

        if (drawn.action !== 'NONE') {
          this.triggerCardAction(drawn, currentBot.id);
        } else {
          this.finishTurn();
        }
      }
    }
  }

  private runBotPeekOwn(bot: Player): void {
    this.resolveActionComplete(`${bot.name} analyzed one of its encrypted chips.`);
  }

  private runBotPeekOther(bot: Player): void {
    const opponents = this.state().players.filter(
      p => p.id !== bot.id && !this.isPlayerFrozen(p.id) && p.cards.length > 0
    );
    if (opponents.length === 0) {
      this.resolveActionComplete(`${bot.name} skipped peek.`);
      return;
    }
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    this.resolveActionComplete(`${bot.name} scanned an encrypted chip from ${target.name}.`);
  }

  private runBotSwap(bot: Player): void {
    const s = this.state();
    const currentBot = s.players.find(p => p.id === bot.id);
    const opponents = s.players.filter(
      p => p.id !== bot.id && !this.isPlayerFrozen(p.id) && p.cards.length > 0
    );

    if (currentBot && currentBot.cards.length > 0 && opponents.length > 0) {
      const target = opponents[Math.floor(Math.random() * opponents.length)];
      const botCardIdx = Math.floor(Math.random() * currentBot.cards.length);
      const targetCardIdx = Math.floor(Math.random() * target.cards.length);

      const players = s.players.map(p => ({ ...p, cards: [...p.cards] }));
      const bCopy = players.find(p => p.id === currentBot.id)!;
      const tCopy = players.find(p => p.id === target.id)!;

      const c1 = bCopy.cards[botCardIdx];
      bCopy.cards[botCardIdx] = tCopy.cards[targetCardIdx];
      tCopy.cards[targetCardIdx] = c1;

      this.sound.playSnap();
      this.state.update(curr => ({ ...curr, players }));
      this.resolveActionComplete(`${currentBot.name} executed a neural spoof swap with ${target.name}!`);
    } else {
      this.resolveActionComplete(`${bot.name} skipped swap.`);
    }
  }

  // -------------------------------------------------------------
  // NETWORKING: TRYSTERO WEBRTC P2P
  // -------------------------------------------------------------
  private cleanupP2P(): void {
    try {
      this.p2pRoom?.leave();
    } catch {}
    this.p2pRoom = null;
    this.sendSyncState = null;
    this.sendPlayerAction = null;
    this.sendSyncReveal = null;
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

      this.sendSyncState = (data: GameState) => syncAction.send(data).catch(() => {});
      this.sendPlayerAction = (data: any) => playerAction.send(data).catch(() => {});
      this.sendSyncReveal = (data: { cardId: string; durationMs: number }) =>
        revealAction.send(data).catch(() => {});

      revealAction.onMessage = (data: { cardId: string; durationMs: number }) => {
        this.sound.playCardFlip();
        this.temporaryRevealCard(data.cardId, data.durationMs);
      };

      room.onPeerJoin = (peerId: string) => {
        if (asHost) {
          this.broadcastState();
        } else {
          // Non-host announces its join as soon as a peer (the host) is discovered
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
          this.state.set(remoteState);
          // Ensure host registered us in the player list
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
            logs: [...s.logs, {
              id: Math.random().toString(),
              timestamp: Date.now(),
              message: `${newPlayer.name} connected to the lobby.`,
              type: 'info'
            }]
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
      logs: [
        ...s.logs,
        { id: Math.random().toString(), timestamp: Date.now(), message, type }
      ]
    }));
  }
}
