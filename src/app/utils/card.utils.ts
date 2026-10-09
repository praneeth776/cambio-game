import { Card, Suit, CardActionType } from '../models/game.models';

export function createDeck(deckIdPrefix: string = 'd1'): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const cards: Card[] = [];

  for (const suit of suits) {
    const isRed = suit === 'hearts' || suit === 'diamonds';

    for (let rank = 1; rank <= 13; rank++) {
      let label = rank.toString();
      let pointValue = rank;
      let action: CardActionType = 'NONE';

      if (rank === 1) {
        label = 'A';
        pointValue = 1;
      } else if (rank === 7 || rank === 8) {
        action = 'PEEK_OWN';
      } else if (rank === 9 || rank === 10) {
        action = 'PEEK_OTHER';
      } else if (rank === 11) {
        label = 'J';
        pointValue = 11;
        action = 'SWAP';
      } else if (rank === 12) {
        label = 'Q';
        pointValue = 12;
        action = 'SWAP';
      } else if (rank === 13) {
        label = 'K';
        // Red Kings are -1 point, Black Kings are 13 points!
        pointValue = isRed ? -1 : 13;
      }

      cards.push({
        id: `${deckIdPrefix}-${suit}-${rank}-${Math.random().toString(36).substring(2, 6)}`,
        suit,
        rank,
        label,
        pointValue,
        action,
        isRed
      });
    }
  }

  // 2 Jokers (0 points each)
  for (let j = 1; j <= 2; j++) {
    cards.push({
      id: `${deckIdPrefix}-joker-${j}-${Math.random().toString(36).substring(2, 6)}`,
      suit: 'joker',
      rank: 0,
      label: 'JKR',
      pointValue: 0,
      action: 'NONE',
      isRed: j === 1
    });
  }

  return cards;
}

export function shuffleDeck<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
    case 'joker': return '🃏';
  }
}
