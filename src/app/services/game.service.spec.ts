import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';
import { createDeck } from '../utils/card.utils';

describe('Cambio Deck & GameService', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameService);
  });

  afterEach(() => {
    service.leaveRoom();
  });

  it('should create a 54-card deck with Red King = -1, Black King = 13, and 2 Jokers = 0', () => {
    const deck = createDeck('test');
    expect(deck.length).toBe(54);

    const redKings = deck.filter(c => c.rank === 13 && c.isRed);
    const blackKings = deck.filter(c => c.rank === 13 && !c.isRed);
    const jokers = deck.filter(c => c.suit === 'joker');

    expect(redKings.length).toBe(2);
    expect(redKings.every(k => k.pointValue === -1)).toBeTrue();

    expect(blackKings.length).toBe(2);
    expect(blackKings.every(k => k.pointValue === 13)).toBeTrue();

    expect(jokers.length).toBe(2);
    expect(jokers.every(j => j.pointValue === 0)).toBeTrue();
  });

  it('should enforce max 8 players in lobby', () => {
    service.createRoom('TEST');
    for (let i = 0; i < 10; i++) {
      service.addBotPlayer();
    }
    expect(service.state().players.length).toBe(8);
  });

  it('should freeze Cambio caller immediately and progressively freeze remaining players after 1 pass each', (done) => {
    service.createRoom('FRZ1');
    service.addBotPlayer();
    service.addBotPlayer();
    service.startGame();
    service.confirmInitialPeek();

    const players = service.state().players;
    const hostId = players[0].id;
    const p2Id = players[1].id;
    const p3Id = players[2].id;

    expect(service.state().phase).toBe('PLAYING');
    expect(service.state().currentTurnPlayerId).toBe(hostId);

    // Host calls Cambio -> Host immediately frozen, turn moves to p2
    service.callCambio();
    expect(service.state().cambioCallerId).toBe(hostId);
    expect(service.isPlayerFrozen(hostId)).toBeTrue();
    expect(service.isPlayerFrozen(p2Id)).toBeFalse();
    expect(service.state().currentTurnPlayerId).toBe(p2Id);
    expect(service.state().finalTurnsRemaining).toBe(2);

    // Simulate p2 finishing turn -> p2 frozen, turn moves to p3
    (service as any).finishTurn();
    expect(service.isPlayerFrozen(p2Id)).toBeTrue();
    expect(service.isPlayerFrozen(p3Id)).toBeFalse();
    expect(service.state().currentTurnPlayerId).toBe(p3Id);
    expect(service.state().finalTurnsRemaining).toBe(1);

    // Simulate p3 finishing turn -> all frozen -> GAME_OVER (modal delayed for Showdown flip)
    (service as any).finishTurn();
    expect(service.state().phase).toBe('GAME_OVER');
    expect(service.showdownModalReady()).toBeFalse();

    setTimeout(() => {
      expect(service.showdownModalReady()).toBeTrue();
      done();
    }, 1250);
  });

  it('should block discarding a card drawn from the discard pile', () => {
    service.createRoom('DSC1');
    service.addBotPlayer();
    service.startGame();
    service.confirmInitialPeek();

    service.drawFromDiscard();
    expect(service.state().drawnCard).not.toBeNull();
    expect(service.state().drawnSource).toBe('DISCARD');

    service.discardDrawnCard();
    expect(service.state().drawnCard).not.toBeNull();
    expect(service.state().currentTurnPlayerId).toBe(service.localPlayerId());

    service.replaceCardInHand(0);
    expect(service.state().drawnCard).toBeNull();
  });

  it('should preserve fixed spatial slots on match and backfill empty slot first on penalty', () => {
    service.createRoom('SLT1');
    service.addBotPlayer();
    service.startGame();
    service.confirmInitialPeek();

    const localId = service.localPlayerId();
    const me = service.localPlayer()!;
    const topDiscard = service.state().discardPile[service.state().discardPile.length - 1];
    const slot0Card = me.cards[0]!;
    const slot2Card = me.cards[2]!;
    const slot3Card = me.cards[3]!;

    // Force slot 1 to match topDiscard rank and slot 0 to mismatch
    const matchingCard = { ...me.cards[1]!, rank: topDiscard.rank, label: topDiscard.label };
    const mismatchCard = { ...slot0Card, rank: topDiscard.rank === 5 ? 6 : 5 };
    service.state.update(s => ({
      ...s,
      players: s.players.map(p =>
        p.id === localId ? { ...p, cards: [mismatchCard, matchingCard, slot2Card, slot3Card] } : p
      )
    }));

    // 1. Match slot 1 -> slot 1 becomes null while slot 0, 2, 3 stay in exact indices
    service.processCardMatchOrPenalty(localId, localId, 1);
    const afterMatch = service.localPlayer()!;
    expect(afterMatch.cards.length).toBe(4);
    expect(afterMatch.cards[1]).toBeNull();
    expect(afterMatch.cards[0]?.id).toBe(mismatchCard.id);
    expect(afterMatch.cards[2]?.id).toBe(slot2Card.id);
    expect(afterMatch.cards[3]?.id).toBe(slot3Card.id);
    expect(service.countActiveCards(afterMatch.cards)).toBe(3);

    // 2. Mismatch on slot 0 -> penalty backfills empty slot 1 first
    service.processCardMatchOrPenalty(localId, localId, 0);
    const afterPenalty1 = service.localPlayer()!;
    expect(afterPenalty1.cards.length).toBe(4);
    expect(afterPenalty1.cards[1]).not.toBeNull();
    expect(service.countActiveCards(afterPenalty1.cards)).toBe(4);

    // 3. Another mismatch when all 4 slots are full -> expands to slot 4 (#5)
    service.processCardMatchOrPenalty(localId, localId, 0);
    const afterPenalty2 = service.localPlayer()!;
    expect(afterPenalty2.cards.length).toBe(5);
    expect(afterPenalty2.cards[4]).not.toBeNull();
  });

  it('should cap logs at 60 entries', () => {
    service.createRoom('LOG1');
    for (let i = 0; i < 80; i++) {
      (service as any).addLog(`Entry ${i}`, 'info');
    }
    expect(service.state().logs.length).toBe(60);
    expect(service.state().logs[59].message).toBe('Entry 79');
  });

  it('should open card temporarily and auto-close after duration without race-condition premature close', (done) => {
    service.temporaryRevealCard('card-x', 80);
    expect(service.isCardTemporarilyOpen('card-x')).toBeTrue();

    setTimeout(() => {
      service.temporaryRevealCard('card-x', 120);
    }, 40);

    setTimeout(() => {
      expect(service.isCardTemporarilyOpen('card-x')).toBeTrue();
    }, 95);

    setTimeout(() => {
      expect(service.isCardTemporarilyOpen('card-x')).toBeFalse();
      done();
    }, 190);
  });

  it('should prevent matching or targeting a frozen player card', () => {
    service.createRoom('FRZ2');
    service.addBotPlayer();
    service.startGame();
    service.confirmInitialPeek();

    const p2 = service.state().players[1];
    service.state.update(s => ({ ...s, frozenPlayerIds: [p2.id] }));

    const discardLenBefore = service.state().discardPile.length;
    const p2CardsBefore = service.countActiveCards(p2.cards);

    service.processCardMatchOrPenalty(service.localPlayerId(), p2.id, 0);
    expect(service.state().discardPile.length).toBe(discardLenBefore);
    expect(service.countActiveCards(p2.cards)).toBe(p2CardsBefore);
  });
});
