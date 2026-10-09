export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type CardActionType = 'NONE' | 'PEEK_OWN' | 'PEEK_OTHER' | 'SWAP';

export interface Card {
  id: string;             // Unique card identifier (e.g. "H-7-1")
  suit: Suit;
  rank: number;           // 1 to 13 (1=A, 11=J, 12=Q, 13=K)
  label: string;          // 'A', '2'..'10', 'J', 'Q', 'K'
  pointValue: number;     // A=1, 2-10=value, J=11, Q=12, Black K=13, Red K=0
  action: CardActionType;
  isRed: boolean;
}

export interface PlayerCardSlot {
  card: Card;
  isFaceUp: boolean;      // Temporarily visible to local player during peek or end game
  peekerIds?: string[];   // Who currently knows this card
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  cards: Card[];          // Host/Local view has real cards; Remote peers see masked cards unless peeked
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
  type: 'PEEK_OWN' | 'PEEK_OTHER' | 'SWAP_SELECT_FIRST' | 'SWAP_SELECT_SECOND';
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

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  currentTurnPlayerId: string;
  cambioCallerId: string | null;
  finalTurnsRemaining: number;
  drawPileCount: number;
  discardPile: Card[];
  drawnCard: Card | null;  // Card currently drawn by active player (from deck)
  activeAction: ActiveAction | null;
  logs: GameLogEntry[];
}
