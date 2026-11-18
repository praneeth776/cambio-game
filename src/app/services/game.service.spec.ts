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

  it('should freeze Cambio caller immediately and progressively freeze remaining players after 1 pass each', () => {
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

    // Simulate p3 finishing turn -> all frozen -> GAME_OVER
    (service as any).finishTurn();
    expect(service.state().phase).toBe('GAME_OVER');
  });

  it('should block discarding a card drawn from the discard pile', () => {
    service.createRoom('DSC1');
    service.addBotPlayer();
    service.startGame();
    service.confirmInitialPeek();

    service.drawFromDiscard();
    expect(service.state().drawnCard).not.toBeNull();
    expect(service.state().drawnSource).toBe('DISCARD');

    // Attempt to discard it back should be ignored
    service.discardDrawnCard();
    expect(service.state().drawnCard).not.toBeNull();
    expect(service.state().currentTurnPlayerId).toBe(service.localPlayerId());

    // Replacing into hand works
    service.replaceCardInHand(0);
    expect(service.state().drawnCard).toBeNull();
  });

  it('should open card temporarily and auto-close after duration without race-condition premature close', (done) => {
    service.temporaryRevealCard('card-x', 80);
    expect(service.isCardTemporarilyOpen('card-x')).toBeTrue();

    setTimeout(() => {
      // Re-open with a longer timer before first timer expires
      service.temporaryRevealCard('card-x', 120);
    }, 40);

    setTimeout(() => {
      // At 95ms (past first 80ms timer, before second 160ms timer), card must still be open!
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
    // Freeze p2 manually
    service.state.update(s => ({ ...s, frozenPlayerIds: [p2.id] }));

    const discardLenBefore = service.state().discardPile.length;
    const p2CardsBefore = p2.cards.length;

    service.processCardMatchOrPenalty(service.localPlayerId(), p2.id, 0);
    expect(service.state().discardPile.length).toBe(discardLenBefore);
    expect(p2.cards.length).toBe(p2CardsBefore);
  });
});
