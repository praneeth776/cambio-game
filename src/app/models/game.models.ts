export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';

export type CardActionType = 'NONE' | 'PEEK_OWN' | 'PEEK_OTHER' | 'SWAP';

export interface Card {
  id: string;             // Unique card identifier (e.g. "H-7-1")
  suit: Suit;
  rank: number;           // 0=Joker, 1=A, 2-10, 11=J, 12=Q, 13=K
  label: string;          // 'A', '2'..'10', 'J', 'Q', 'K', 'JKR'
  pointValue: number;     // Red K=-1, Joker=0, A=1, 2-10=value, J=11, Q=12, Black K=13
  action: CardActionType;
  isRed: boolean;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  cards: (Card | null)[]; // Fixed spatial slots; null indicates a shed slot placeholder
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  hasPeekedInitial: boolean;
  score: number;
}

export type GamePhase =
  | 'LOBBY'
  | 'INITIAL_PEEK'
  | 'PLAYING'
  | 'RESOLVING_ACTION'
  | 'GAME_OVER';

export interface ActiveAction {
  type: 'PEEK_OWN' | 'PEEK_OTHER' | 'SWAP_SELECT_FIRST' | 'SWAP_SELECT_SECOND' | 'TRANSFER_CARD_TO_OPPONENT';
  sourcePlayerId: string;
  targetPlayerId?: string;
  firstCardIndex?: number;
  message: string;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'action' | 'cambio' | 'snap' | 'danger' | 'warning';
}

export interface ToastNotification {
  id: string;
  message: string;
  tone: 'info' | 'snap' | 'danger' | 'cambio';
}

export type AnimationEvent =
  | { type: 'DEAL'; playerIds: string[] }
  | { type: 'DRAW'; playerId: string; source: 'DECK' | 'DISCARD'; card?: Card }
  | { type: 'SWAP_HAND'; playerId: string; slotIndex: number; discardedCard: Card }
  | { type: 'DISCARD_DRAWN'; playerId: string; card: Card }
  | { type: 'BLIND_SWAP'; p1Id: string; idx1: number; p2Id: string; idx2: number }
  | { type: 'MATCH_DISCARD'; targetPlayerId: string; slotIndex: number; card: Card }
  | { type: 'PENALTY_DRAW'; playerId: string; slotIndex: number }
  | { type: 'MISMATCH_SHAKE'; targetPlayerId: string; slotIndex: number }
  | { type: 'TRANSFER'; fromPlayerId: string; fromSlot: number; toPlayerId: string; toSlot: number }
  | { type: 'FREEZE'; playerId: string }
  | { type: 'SHOWDOWN' };

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  currentTurnPlayerId: string;
  cambioCallerId: string | null;
  frozenPlayerIds: string[];
  finalTurnsRemaining: number;
  drawPileCount: number;
  discardPile: Card[];
  drawnCard: Card | null;
  drawnSource: 'DECK' | 'DISCARD' | null;
  activeAction: ActiveAction | null;
  logs: GameLogEntry[];
}
