import { Injectable, signal, computed } from '@angular/core';
import { Card, Player, GameState, ActiveAction, GameLogEntry, GamePhase } from '../models/game.models';
import { createDeck, shuffleDeck } from '../utils/card.utils';
import { SoundService } from './sound.service';
import confetti from 'canvas-confetti';
// Trystero import for zero-server WebRTC peer connections
// @ts-ignore
import { joinRoom, selfId } from 'trystero/nostr';

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
    finalTurnsRemaining: 0,
    drawPileCount: 52,
    discardPile: [],
    drawnCard: null,
    activeAction: null,
    logs: []
  });

  // Set of cards temporarily revealed for 3 seconds with a timer
  readonly temporarilyOpenCards = signal<Record<string, number>>({});

  // Local card knowledge map (cardId -> boolean or Card for revealed peeks)
  readonly knownCards = signal<Record<string, Card>>({});

  // Temporary peek overlay (e.g. while peeking a card for 3 seconds)
  readonly activePeek = signal<{ card: Card; ownerName: string; slotIndex: number; expiresAt: number } | null>(null);

  // Private canonical deck kept by the Room Host
  private canonicalDeck: Card[] = [];

  // Trystero P2P Room instance & message channels
  private p2pRoom: any = null;
  private sendSyncState: any = null;
  private sendPlayerAction: any = null;
  private sendPrivatePeek: any = null;
  private sendSyncReveal: any = null;

  // Computed signals
  readonly isHost = computed(() => {
    const localId = this.localPlayerId();
    const p = this.state().players.find(x => x.id === localId);
    return !!p?.isHost;
  });

  readonly isMyTurn = computed(() => {
    return this.state().phase === 'PLAYING' && this.state().currentTurnPlayerId === this.localPlayerId();
  });

  readonly localPlayer = computed(() => {
    return this.state().players.find(x => x.id === this.localPlayerId()) || null;
  });

  readonly otherPlayers = computed(() => {
    return this.state().players.filter(x => x.id !== this.localPlayerId());
  });

  constructor(private sound: SoundService) {}

  // -------------------------------------------------------------
  // LOBBY & ROOM INITIALIZATION
  // -------------------------------------------------------------
  createRoom(customCode?: string): string {
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

    this.state.update(s => ({
      ...s,
      roomCode: code,
      phase: 'LOBBY',
      players: [host],
      currentTurnPlayerId: host.id,
      cambioCallerId: null,
      finalTurnsRemaining: 0,
      drawPileCount: 52,
      discardPile: [],
      drawnCard: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `Grid initialized. Room code: [${code}]`,
        type: 'info'
      }]
    }));

    this.initP2P(code);
    return code;
  }

  joinRoom(code: string, playerName?: string): void {
    const roomCode = code.toUpperCase().trim();
    if (playerName) {
      this.localPlayerName.set(playerName);
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

    this.state.update(s => ({
      ...s,
      roomCode,
      players: [localPlayer],
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `Connecting to room [${roomCode}]...`,
        type: 'info'
      }]
    }));

    this.initP2P(roomCode);
  }

  addBotPlayer(): void {
    if (!this.isHost()) return;
    const current = this.state().players;
    if (current.length >= 8) {
      this.addLog('Lobby full (Maximum 8 players).', 'danger');
      return;
    }

    const botIndex = current.length;
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

  // -------------------------------------------------------------
  // START GAME & INITIAL PEEK
  // -------------------------------------------------------------
  startGame(): void {
    if (!this.isHost()) return;
    const players = [...this.state().players];
    if (players.length < 2) {
      this.addLog('Need at least 2 players to start! Add AI bots or invite friends.', 'danger');
      return;
    }

    // Prepare fresh deck
    const deck = shuffleDeck(createDeck('r1'));
    
    // Deal 4 cards to each player
    players.forEach(p => {
      p.cards = deck.splice(0, 4);
      p.hasPeekedInitial = p.isBot; // bots automatically peek
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
      finalTurnsRemaining: 0,
      drawPileCount: this.canonicalDeck.length,
      discardPile: [initialDiscard],
      drawnCard: null,
      activeAction: null,
      logs: [{
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: 'Game started! Memorize 2 of your cards (bottom row).',
        type: 'info'
      }]
    }));

    this.sound.playActionPower();
    this.broadcastState();

    // Store knowledge of local player's initial 2 cards (indices 2 and 3)
    const myPlayer = players.find(p => p.id === this.localPlayerId());
    if (myPlayer && myPlayer.cards.length >= 4) {
      this.knownCards.update(k => ({
        ...k,
        [myPlayer.cards[2].id]: myPlayer.cards[2],
        [myPlayer.cards[3].id]: myPlayer.cards[3]
      }));
    }
  }

  confirmInitialPeek(): void {
    const localId = this.localPlayerId();
    this.state.update(s => {
      const players = s.players.map(p => p.id === localId ? { ...p, hasPeekedInitial: true } : p);
      const allPeeked = players.every(p => p.hasPeekedInitial);
      return {
        ...s,
        players,
        phase: allPeeked ? 'PLAYING' : s.phase
      };
    });

    if (this.isHost()) {
      this.checkAndStartTurns();
      this.broadcastState();
    } else {
      this.sendPlayerAction?.({ type: 'CONFIRM_PEEK', playerId: localId });
    }
  }

  private checkAndStartTurns(): void {
    const s = this.state();
    if (s.players.every(p => p.hasPeekedInitial)) {
      this.state.update(st => ({
        ...st,
        phase: 'PLAYING',
        logs: [...st.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `All players ready! Turn begins with ${st.players[0].name}.`,
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
  // TURN ACTIONS: DRAW
  // -------------------------------------------------------------
  drawFromDeck(): void {
    if (!this.isMyTurn() || this.state().drawnCard !== null) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      if (this.canonicalDeck.length === 0) {
        this.recycleDiscardPile();
      }
      const drawn = this.canonicalDeck.pop();
      if (!drawn) return;

      this.state.update(s => ({
        ...s,
        drawnCard: drawn,
        drawPileCount: this.canonicalDeck.length,
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${this.localPlayerName()} drew from the memory buffer.`,
          type: 'action'
        }]
      }));
      this.broadcastState();
    } else {
      this.sendPlayerAction?.({ type: 'DRAW_DECK', playerId: this.localPlayerId() });
    }
  }

  drawFromDiscard(): void {
    if (!this.isMyTurn() || this.state().drawnCard !== null || this.state().discardPile.length === 0) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      const discard = [...this.state().discardPile];
      const drawn = discard.pop()!;

      this.state.update(s => ({
        ...s,
        drawnCard: drawn,
        discardPile: discard,
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${this.localPlayerName()} took the top discard: ${drawn.label}${drawn.suit}.`,
          type: 'action'
        }]
      }));
      this.broadcastState();
    } else {
      this.sendPlayerAction?.({ type: 'DRAW_DISCARD', playerId: this.localPlayerId() });
    }
  }

  // -------------------------------------------------------------
  // TURN ACTIONS: REPLACE / DISCARD
  // -------------------------------------------------------------
  replaceCardInHand(slotIndex: number): void {
    const drawn = this.state().drawnCard;
    if (!this.isMyTurn() || !drawn) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      const players = [...this.state().players];
      const me = players.find(p => p.id === this.localPlayerId())!;
      const oldCard = me.cards[slotIndex];

      // Replace card
      me.cards[slotIndex] = drawn;

      // Update local memory
      this.knownCards.update(k => {
        const next = { ...k };
        delete next[oldCard.id];
        next[drawn.id] = drawn;
        return next;
      });

      this.state.update(s => ({
        ...s,
        players,
        drawnCard: null,
        discardPile: [...s.discardPile, oldCard],
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${this.localPlayerName()} swapped a chip in hand with drawn card.`,
          type: 'action'
        }]
      }));

      this.finishTurn();
    } else {
      this.sendPlayerAction?.({ type: 'REPLACE_HAND', playerId: this.localPlayerId(), slotIndex });
    }
  }

  discardDrawnCard(): void {
    const drawn = this.state().drawnCard;
    if (!this.isMyTurn() || !drawn) return;
    this.sound.playCardFlip();

    if (this.isHost()) {
      this.state.update(s => ({
        ...s,
        drawnCard: null,
        discardPile: [...s.discardPile, drawn],
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${this.localPlayerName()} discarded drawn card [${drawn.label}${drawn.suit}].`,
          type: 'action'
        }]
      }));

      // Check if discarded card has an action power
      if (drawn.action !== 'NONE') {
        this.triggerCardAction(drawn, this.localPlayerId());
      } else {
        this.finishTurn();
      }
    } else {
      this.sendPlayerAction?.({ type: 'DISCARD_DRAWN', playerId: this.localPlayerId() });
    }
  }

  // -------------------------------------------------------------
  // SPECIAL CARD POWERS (7-8 peek own, 9-10 peek other, J-Q swap)
  // -------------------------------------------------------------
  private triggerCardAction(card: Card, playerId: string): void {
    this.sound.playActionPower();

    if (card.action === 'PEEK_OWN') {
      this.state.update(s => ({
        ...s,
        activeAction: {
          type: 'PEEK_OWN',
          sourcePlayerId: playerId,
          message: 'Rank 7/8: Select 1 of your own cards to peek!'
        }
      }));
      this.broadcastState();

      const player = this.state().players.find(p => p.id === playerId);
      if (player?.isBot) {
        setTimeout(() => this.runBotPeekOwn(player), 1000);
      }
    } else if (card.action === 'PEEK_OTHER') {
      this.state.update(s => ({
        ...s,
        activeAction: {
          type: 'PEEK_OTHER',
          sourcePlayerId: playerId,
          message: 'Rank 9/10: Select an opponent’s card to inspect!'
        }
      }));
      this.broadcastState();

      const player = this.state().players.find(p => p.id === playerId);
      if (player?.isBot) {
        setTimeout(() => this.runBotPeekOther(player), 1000);
      }
    } else if (card.action === 'SWAP') {
      this.state.update(s => ({
        ...s,
        activeAction: {
          type: 'SWAP_SELECT_FIRST',
          sourcePlayerId: playerId,
          message: 'Rank J/Q: Select the first card to swap!'
        }
      }));
      this.broadcastState();

      const player = this.state().players.find(p => p.id === playerId);
      if (player?.isBot) {
        setTimeout(() => this.runBotSwap(player), 1000);
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
        const next = { ...curr };
        delete next[cardId];
        return next;
      });
    }, durationMs);
  }

  // -------------------------------------------------------------
  // UNIFIED CARD CLICK INTERACTION
  // 1. Peek side effect opens card for 3s with a timer
  // 2. If drew a card: replaces clicked card with drawn card & discards old card
  // 3. If discard matches rank: discards this card, and gives card to opponent if done for opponent
  // 4. If doesn't match: player receives +1 penalty card
  // -------------------------------------------------------------
  handleCardClick(targetPlayerId: string, slotIndex: number): void {
    const localId = this.localPlayerId();
    const state = this.state();

    // In INITIAL_PEEK phase, clicking a card opens it for 3 seconds
    if (state.phase === 'INITIAL_PEEK') {
      const targetP = state.players.find(p => p.id === targetPlayerId);
      const c = targetP?.cards[slotIndex];
      if (c) {
        this.sound.playCardFlip();
        this.temporaryRevealCard(c.id, 3000);
      }
      return;
    }

    if (state.phase !== 'PLAYING') return;

    // Condition 3: If player drew a card, switch clicked card with drawn card & discard clicked card!
    if (state.drawnCard !== null) {
      if (targetPlayerId === localId && this.isMyTurn()) {
        this.replaceCardInHand(slotIndex);
      }
      return;
    }

    // Resolving an active special power action
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

      if (action.type === 'PEEK_OWN') {
        if (targetPlayerId !== localId) return;
        const me = state.players.find(p => p.id === localId);
        const card = me?.cards[slotIndex];
        if (card) {
          this.sound.playCardFlip();
          this.temporaryRevealCard(card.id, 3000);
          this.resolveActionComplete(`${this.localPlayerName()} peeked at their card #${slotIndex + 1}.`);
        }
        return;
      }

      if (action.type === 'PEEK_OTHER') {
        if (targetPlayerId === localId) return;
        const targetP = state.players.find(p => p.id === targetPlayerId);
        const card = targetP?.cards[slotIndex];
        if (card && targetP) {
          this.sound.playCardFlip();
          this.temporaryRevealCard(card.id, 3000);
          this.resolveActionComplete(`${this.localPlayerName()} peeked at ${targetP.name}’s card #${slotIndex + 1}.`);
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
            message: `Selected first card. Now click the 2nd card to swap!`
          }
        }));
        return;
      }

      if (action.type === 'SWAP_SELECT_SECOND') {
        this.executeSwap(action.targetPlayerId!, action.firstCardIndex!, targetPlayerId, slotIndex);
        return;
      }
      return;
    }

    // Condition 1 & 2: Match against discard OR penalty
    if (this.isHost()) {
      this.processCardMatchOrPenalty(localId, targetPlayerId, slotIndex);
    } else {
      this.sendPlayerAction?.({ type: 'CARD_CLICK_MATCH', clickerId: localId, targetPlayerId, slotIndex });
    }
  }

  processCardMatchOrPenalty(clickerId: string, targetPlayerId: string, slotIndex: number): void {
    const s = this.state();
    const discardPile = s.discardPile;
    if (discardPile.length === 0 || s.phase !== 'PLAYING') return;

    const topDiscard = discardPile[discardPile.length - 1];
    const targetPlayer = s.players.find(p => p.id === targetPlayerId);
    const clicker = s.players.find(p => p.id === clickerId);
    if (!targetPlayer || !clicker) return;

    const clickedCard = targetPlayer.cards[slotIndex];
    if (!clickedCard) return;

    // 1. SIDE EFFECT: PEEK FUNCTION OPENS THE CARD FOR 3 SECONDS
    this.temporaryRevealCard(clickedCard.id, 3000);
    this.sound.playCardFlip();
    this.sendSyncReveal?.({ cardId: clickedCard.id, durationMs: 3000 });

    // 2. CHECK MATCH AGAINST TOP DISCARD
    if (clickedCard.rank === topDiscard.rank) {
      // Condition 1: MATCH! Discards this card!
      this.sound.playSnap();
      targetPlayer.cards.splice(slotIndex, 1);

      if (targetPlayerId === clickerId) {
        // Matched own card: shed card!
        this.state.update(curr => ({
          ...curr,
          players: [...curr.players],
          discardPile: [...curr.discardPile, clickedCard],
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `⚡ MATCH! ${clicker.name} matched rank [${topDiscard.label}] with their card and discarded it!`,
            type: 'snap'
          }]
        }));
        this.broadcastState();
      } else {
        // Matched opponent's card:
        // "give additional card from my deck to opponent if I did it for the opponent"
        this.state.update(curr => ({
          ...curr,
          players: [...curr.players],
          discardPile: [...curr.discardPile, clickedCard],
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `⚡ OPPONENT MATCH! ${clicker.name} matched ${targetPlayer.name}’s rank [${topDiscard.label}] card! Shed opponent's card!`,
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
            if (clicker.id === this.localPlayerId()) {
              this.state.update(curr => ({
                ...curr,
                activeAction: {
                  type: 'TRANSFER_CARD_TO_OPPONENT',
                  sourcePlayerId: clicker.id,
                  targetPlayerId: targetPlayer.id,
                  message: `Match successful! Select one of YOUR cards to hand over to ${targetPlayer.name}.`
                }
              }));
              this.broadcastState();
            } else {
              const transferred = clicker.cards.pop()!;
              targetPlayer.cards.push(transferred);
              this.addLog(`🔄 ${clicker.name} gave 1 card to ${targetPlayer.name}!`, 'action');
              this.broadcastState();
            }
          }
        } else {
          this.broadcastState();
        }
      }
    } else {
      // Condition 2: MISMATCH! Player gets additional penalty card from draw deck!
      this.sound.playActionPower();
      const penaltyCard = this.canonicalDeck.pop();
      if (penaltyCard) {
        clicker.cards.push(penaltyCard);
        this.state.update(curr => ({
          ...curr,
          players: [...curr.players],
          drawPileCount: this.canonicalDeck.length,
          logs: [...curr.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `❌ MISMATCH PENALTY! ${clicker.name} clicked [${clickedCard.label} of ${clickedCard.suit}] (does not match discard [${topDiscard.label}]). Drew a penalty card (+1)!`,
            type: 'danger'
          }]
        }));
        this.broadcastState();
      }
    }
  }

  transferCardToPlayer(fromPlayerId: string, cardIndex: number, toPlayerId: string): void {
    const s = this.state();
    const fromP = s.players.find(p => p.id === fromPlayerId);
    const toP = s.players.find(p => p.id === toPlayerId);
    if (!fromP || !toP || !fromP.cards[cardIndex]) return;

    const card = fromP.cards.splice(cardIndex, 1)[0];
    toP.cards.push(card);

    this.sound.playSnap();
    this.state.update(curr => ({
      ...curr,
      players: [...curr.players],
      activeAction: null,
      logs: [...curr.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `🔄 ${fromP.name} gave card #${cardIndex + 1} to ${toP.name}!`,
        type: 'action'
      }]
    }));
    this.broadcastState();
  }

  private executeSwap(p1Id: string, idx1: number, p2Id: string, idx2: number): void {
    if (this.isHost()) {
      const players = [...this.state().players];
      const p1 = players.find(p => p.id === p1Id);
      const p2 = players.find(p => p.id === p2Id);

      if (p1 && p2) {
        const c1 = p1.cards[idx1];
        const c2 = p2.cards[idx2];
        p1.cards[idx1] = c2;
        p2.cards[idx2] = c1;

        this.sound.playSnap();
        this.resolveActionComplete(`${this.localPlayerName()} swapped ${p1.name}’s card with ${p2.name}’s card!`);
      }
    } else {
      this.sendPlayerAction?.({ type: 'EXECUTE_SWAP', p1Id, idx1, p2Id, idx2 });
    }
  }

  skipAction(): void {
    if (this.state().activeAction?.sourcePlayerId !== this.localPlayerId()) return;
    this.resolveActionComplete(`${this.localPlayerName()} skipped the special card power.`);
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
  // CALL CAMBIO
  // -------------------------------------------------------------
  callCambio(): void {
    if (!this.isMyTurn() || this.state().cambioCallerId !== null) return;
    this.sound.playCambioAlert();

    const callerId = this.localPlayerId();
    const callerName = this.localPlayerName();

    if (this.isHost()) {
      const remainingTurns = this.state().players.length - 1;
      this.state.update(s => ({
        ...s,
        cambioCallerId: callerId,
        finalTurnsRemaining: remainingTurns,
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `🚨 ${callerName} CALLED CAMBIO! Final cycle has begun!`,
          type: 'cambio'
        }]
      }));
      this.broadcastState();
      this.finishTurn();
    } else {
      this.sendPlayerAction?.({ type: 'CALL_CAMBIO', playerId: callerId });
    }
  }

  // -------------------------------------------------------------
  // TURN ROTATION & ROUND COMPLETION
  // -------------------------------------------------------------
  private finishTurn(): void {
    if (!this.isHost()) return;

    let s = this.state();
    const players = s.players;
    const currentIndex = players.findIndex(p => p.id === s.currentTurnPlayerId);
    let nextIndex = (currentIndex + 1) % players.length;

    // If Cambio was called, check remaining turns
    if (s.cambioCallerId !== null) {
      const rem = s.finalTurnsRemaining - 1;
      if (rem <= 0) {
        this.endGame();
        return;
      }
      this.state.update(curr => ({ ...curr, finalTurnsRemaining: rem }));
    }

    const nextPlayer = players[nextIndex];
    this.state.update(curr => ({
      ...curr,
      currentTurnPlayerId: nextPlayer.id,
      drawnCard: null,
      activeAction: null
    }));
    this.broadcastState();

    if (nextPlayer.isBot) {
      setTimeout(() => this.runBotTurn(nextPlayer), 1500);
    }
  }

  private endGame(): void {
    this.sound.playVictory();
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    const players = this.state().players.map(p => {
      const totalScore = p.cards.reduce((sum, c) => sum + c.pointValue, 0);
      return { ...p, score: totalScore };
    });

    // Reveal all cards into known map for victory view
    const allKnown: Record<string, Card> = {};
    players.forEach(p => p.cards.forEach(c => allKnown[c.id] = c));
    this.knownCards.set(allKnown);

    // Sort to determine winner (lowest score wins)
    const sorted = [...players].sort((a, b) => a.score - b.score);
    const winner = sorted[0];

    this.state.update(s => ({
      ...s,
      phase: 'GAME_OVER',
      players,
      logs: [...s.logs, {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `🏆 GAME OVER! Winner: ${winner.name} with ${winner.score} points!`,
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
  // SMART AI BOT SIMULATION
  // -------------------------------------------------------------
  private runBotTurn(bot: Player): void {
    if (this.state().phase !== 'PLAYING' || this.state().currentTurnPlayerId !== bot.id) return;

    // Check if bot wants to call Cambio
    const knownBotPoints = bot.cards.slice(2, 4).reduce((sum, c) => sum + c.pointValue, 0);
    if (this.state().cambioCallerId === null && knownBotPoints <= 5 && Math.random() < 0.6) {
      this.sound.playCambioAlert();
      const remainingTurns = this.state().players.length - 1;
      this.state.update(s => ({
        ...s,
        cambioCallerId: bot.id,
        finalTurnsRemaining: remainingTurns,
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `🚨 ${bot.name} called CAMBIO!`,
          type: 'cambio'
        }]
      }));
      this.finishTurn();
      return;
    }

    // Bot decides to draw from discard or deck
    const topDiscard = this.state().discardPile[this.state().discardPile.length - 1];
    if (topDiscard && topDiscard.pointValue <= 3 && Math.random() < 0.8) {
      // Take from discard and replace highest card
      const discard = [...this.state().discardPile];
      const taken = discard.pop()!;
      const oldCard = bot.cards[0];
      bot.cards[0] = taken;

      this.sound.playCardFlip();
      this.state.update(s => ({
        ...s,
        discardPile: [...discard, oldCard],
        logs: [...s.logs, {
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `${bot.name} took discard [${taken.label}${taken.suit}] and replaced a card.`,
          type: 'action'
        }]
      }));
      this.finishTurn();
    } else {
      // Draw from deck
      if (this.canonicalDeck.length === 0) this.recycleDiscardPile();
      const drawn = this.canonicalDeck.pop();
      if (!drawn) return;

      this.sound.playCardFlip();
      if (drawn.pointValue <= 4) {
        // Good card: replace bot's slot 1
        const oldCard = bot.cards[1];
        bot.cards[1] = drawn;
        this.state.update(s => ({
          ...s,
          discardPile: [...s.discardPile, oldCard],
          drawPileCount: this.canonicalDeck.length,
          logs: [...s.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `${bot.name} drew and kept the card, discarding replaced chip.`,
            type: 'action'
          }]
        }));
        this.finishTurn();
      } else {
        // Discard drawn card
        this.state.update(s => ({
          ...s,
          discardPile: [...s.discardPile, drawn],
          drawPileCount: this.canonicalDeck.length,
          logs: [...s.logs, {
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `${bot.name} discarded drawn card [${drawn.label}${drawn.suit}].`,
            type: 'action'
          }]
        }));

        if (drawn.action !== 'NONE') {
          this.triggerCardAction(drawn, bot.id);
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
    const opponents = this.state().players.filter(p => p.id !== bot.id);
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    this.resolveActionComplete(`${bot.name} scanned an encrypted chip from ${target.name}.`);
  }

  private runBotSwap(bot: Player): void {
    const opponents = this.state().players.filter(p => p.id !== bot.id);
    if (opponents.length > 0) {
      const target = opponents[0];
      const botCardIdx = Math.floor(Math.random() * bot.cards.length);
      const targetCardIdx = Math.floor(Math.random() * target.cards.length);
      const c1 = bot.cards[botCardIdx];
      bot.cards[botCardIdx] = target.cards[targetCardIdx];
      target.cards[targetCardIdx] = c1;
      this.sound.playSnap();
      this.resolveActionComplete(`${bot.name} initiated a neural spoof swap with ${target.name}!`);
    } else {
      this.resolveActionComplete(`${bot.name} skipped swap.`);
    }
  }

  // -------------------------------------------------------------
  // NETWORKING: TRYSTERO WEBRTC P2P
  // -------------------------------------------------------------
  private initP2P(roomCode: string): void {
    try {
      this.p2pRoom = joinRoom({ appId: APP_ID }, roomCode);

      // Register message channels
      const [sendSync, getSync] = this.p2pRoom.makeAction('SYNC_STATE');
      const [sendAction, getAction] = this.p2pRoom.makeAction('PLAYER_ACTION');
      const [sendPeek, getPeek] = this.p2pRoom.makeAction('PRIVATE_PEEK');
      const [sendReveal, getReveal] = this.p2pRoom.makeAction('SYNC_REVEAL');

      this.sendSyncState = sendSync;
      this.sendPlayerAction = sendAction;
      this.sendPrivatePeek = sendPeek;
      this.sendSyncReveal = sendReveal;

      getReveal((data: { cardId: string; durationMs: number }) => {
        this.temporaryRevealCard(data.cardId, data.durationMs);
      });

      // Handle peer joins
      this.p2pRoom.onPeerJoin((peerId: string) => {
        this.addLog(`Remote peer joined room: ${peerId.substring(0, 5)}`, 'info');
        if (this.isHost()) {
          this.broadcastState();
        }
      });

      // Handle peer leaves
      this.p2pRoom.onPeerLeave((peerId: string) => {
        this.addLog(`Peer disconnected: ${peerId.substring(0, 5)}`, 'warning');
      });

      // Listen for incoming state sync
      getSync((remoteState: GameState) => {
        if (!this.isHost()) {
          this.state.set(remoteState);
        }
      });

      // Host receives player action requests
      getAction((action: any, senderId: string) => {
        if (this.isHost()) {
          this.handleRemoteAction(action, senderId);
        }
      });

      // Private peek channel
      getPeek((peekData: { card: Card; ownerName: string; slotIndex: number }) => {
        this.sound.playCardFlip();
        this.temporaryRevealCard(peekData.card.id, 3000);
      });
    } catch (err) {
      console.warn('P2P connection initialized in local standalone mode', err);
    }
  }

  private broadcastState(): void {
    if (this.sendSyncState) {
      this.sendSyncState(this.state());
    }
  }

  private handleRemoteAction(action: any, senderId: string): void {
    switch (action.type) {
      case 'JOIN': {
        const current = this.state().players;
        if (current.length < 8 && !current.some(p => p.id === senderId)) {
          const newPlayer: Player = {
            id: senderId,
            name: action.name || 'Netrunner_' + senderId.substring(0, 4),
            avatar: 'cyber-3',
            cards: [],
            isHost: false,
            isBot: false,
            connected: true,
            hasPeekedInitial: false,
            score: 0
          };
          this.state.update(s => ({ ...s, players: [...s.players, newPlayer] }));
          this.broadcastState();
        }
        break;
      }
      case 'CONFIRM_PEEK': {
        this.state.update(s => ({
          ...s,
          players: s.players.map(p => p.id === action.playerId ? { ...p, hasPeekedInitial: true } : p)
        }));
        this.checkAndStartTurns();
        break;
      }
      case 'DRAW_DECK': {
        if (this.state().currentTurnPlayerId === action.playerId) {
          if (this.canonicalDeck.length === 0) this.recycleDiscardPile();
          const drawn = this.canonicalDeck.pop();
          if (drawn) {
            this.state.update(s => ({
              ...s,
              drawnCard: drawn,
              drawPileCount: this.canonicalDeck.length
            }));
            this.broadcastState();
          }
        }
        break;
      }
      case 'DRAW_DISCARD': {
        if (this.state().currentTurnPlayerId === action.playerId && this.state().discardPile.length > 0) {
          const discard = [...this.state().discardPile];
          const drawn = discard.pop()!;
          this.state.update(s => ({
            ...s,
            drawnCard: drawn,
            discardPile: discard
          }));
          this.broadcastState();
        }
        break;
      }
      case 'REPLACE_HAND': {
        const drawn = this.state().drawnCard;
        if (drawn && this.state().currentTurnPlayerId === action.playerId) {
          const players = [...this.state().players];
          const p = players.find(x => x.id === action.playerId);
          if (p) {
            const oldCard = p.cards[action.slotIndex];
            p.cards[action.slotIndex] = drawn;
            this.state.update(s => ({
              ...s,
              players,
              drawnCard: null,
              discardPile: [...s.discardPile, oldCard]
            }));
            this.finishTurn();
          }
        }
        break;
      }
      case 'DISCARD_DRAWN': {
        const drawn = this.state().drawnCard;
        if (drawn && this.state().currentTurnPlayerId === action.playerId) {
          this.state.update(s => ({
            ...s,
            drawnCard: null,
            discardPile: [...s.discardPile, drawn]
          }));
          if (drawn.action !== 'NONE') {
            this.triggerCardAction(drawn, action.playerId);
          } else {
            this.finishTurn();
          }
        }
        break;
      }
      case 'CALL_CAMBIO': {
        if (this.state().currentTurnPlayerId === action.playerId && this.state().cambioCallerId === null) {
          const caller = this.state().players.find(p => p.id === action.playerId);
          const remainingTurns = this.state().players.length - 1;
          this.sound.playCambioAlert();
          this.state.update(s => ({
            ...s,
            cambioCallerId: action.playerId,
            finalTurnsRemaining: remainingTurns,
            logs: [...s.logs, {
              id: Math.random().toString(),
              timestamp: Date.now(),
              message: `🚨 ${caller?.name || 'A player'} CALLED CAMBIO!`,
              type: 'cambio'
            }]
          }));
          this.broadcastState();
          this.finishTurn();
        }
        break;
      }
      case 'SNAP': {
        const players = [...this.state().players];
        const p = players.find(x => x.id === action.playerId);
        const topDiscard = this.state().discardPile[this.state().discardPile.length - 1];
        if (p && topDiscard) {
          const clickedCard = p.cards[action.slotIndex];
          if (clickedCard && clickedCard.rank === topDiscard.rank) {
            p.cards.splice(action.slotIndex, 1);
            this.sound.playSnap();
            this.state.update(s => ({
              ...s,
              players,
              discardPile: [...s.discardPile, clickedCard],
              logs: [...s.logs, {
                id: Math.random().toString(),
                timestamp: Date.now(),
                message: `⚡ SNAP SUCCESS! ${p.name} matched rank ${topDiscard.label} and shed a card!`,
                type: 'snap'
              }]
            }));
            this.broadcastState();
          } else {
            this.sound.playActionPower();
            const penaltyCard = this.canonicalDeck.pop();
            if (penaltyCard) {
              p.cards.push(penaltyCard);
              this.state.update(s => ({
                ...s,
                players,
                drawPileCount: this.canonicalDeck.length,
                logs: [...s.logs, {
                  id: Math.random().toString(),
                  timestamp: Date.now(),
                  message: `❌ SNAP PENALTY! ${p.name} slapped incorrectly and drew a penalty card (+1 card penalty)!`,
                  type: 'danger'
                }]
              }));
              this.broadcastState();
            }
          }
        }
        break;
      }
      case 'CARD_CLICK_MATCH': {
        this.processCardMatchOrPenalty(action.clickerId, action.targetPlayerId, action.slotIndex);
        break;
      }
      case 'TRANSFER_CARD': {
        this.transferCardToPlayer(action.fromPlayerId, action.cardIndex, action.toPlayerId);
        break;
      }
      case 'EXECUTE_SWAP': {
        this.executeSwap(action.p1Id, action.idx1, action.p2Id, action.idx2);
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
