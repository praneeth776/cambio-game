import { Injectable, signal } from '@angular/core';
import { AnimationEvent, Card } from '../models/game.models';

export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlightSprite {
  id: string;
  from: RectBox;
  to: RectBox;
  card?: Card;
  faceUp: boolean;
  durationMs: number;
  arcOffsetY: number;
}

@Injectable({
  providedIn: 'root'
})
export class CardFlightService {
  private anchors = new Map<string, HTMLElement>();
  private cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  readonly flights = signal<FlightSprite[]>([]);

  registerAnchor(key: string, el: HTMLElement): void {
    this.anchors.set(key, el);
  }

  unregisterAnchor(key: string, el: HTMLElement): void {
    if (this.anchors.get(key) === el) {
      this.anchors.delete(key);
    }
  }

  prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private getRect(key: string): RectBox | null {
    const el = this.anchors.get(key);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  flyCard(
    fromKey: string,
    toKey: string,
    options?: { card?: Card; faceUp?: boolean; durationMs?: number; arcOffsetY?: number }
  ): void {
    const from = this.getRect(fromKey);
    const to = this.getRect(toKey);
    if (!from || !to) return;

    const reduced = this.prefersReducedMotion();
    const durationMs = reduced ? 90 : (options?.durationMs ?? 220);
    const id = `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const sprite: FlightSprite = {
      id,
      from,
      to,
      card: options?.card,
      faceUp: !!options?.faceUp,
      durationMs,
      arcOffsetY: reduced ? 0 : (options?.arcOffsetY ?? 0)
    };

    this.flights.update(list => [...list, sprite]);

    const t = setTimeout(() => {
      this.cleanupTimers.delete(t);
      this.flights.update(list => list.filter(s => s.id !== id));
    }, durationMs + 40);
    this.cleanupTimers.add(t);
  }

  flySwapArc(keyA: string, keyB: string, durationMs: number = 350): void {
    this.flyCard(keyA, keyB, { faceUp: false, durationMs, arcOffsetY: -28 });
    this.flyCard(keyB, keyA, { faceUp: false, durationMs, arcOffsetY: 28 });
  }

  shakeAnchor(key: string, durationMs: number = 240): void {
    const el = this.anchors.get(key);
    if (!el || typeof el.animate !== 'function' || this.prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(-7px, 0, 0)' },
        { transform: 'translate3d(7px, 0, 0)' },
        { transform: 'translate3d(-4px, 0, 0)' },
        { transform: 'translate3d(0, 0, 0)' }
      ],
      { duration: durationMs, easing: 'ease-out' }
    );
  }

  pulseAnchor(key: string, durationMs: number = 260): void {
    const el = this.anchors.get(key);
    if (!el || typeof el.animate !== 'function' || this.prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.06)' },
        { transform: 'scale(1)' }
      ],
      { duration: durationMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }

  playEvent(event: AnimationEvent, localPlayerId: string): void {
    switch (event.type) {
      case 'DEAL': {
        event.playerIds.forEach((pid, pIdx) => {
          for (let s = 0; s < 4; s++) {
            const delay = (pIdx * 4 + s) * 28;
            const t = setTimeout(() => {
              this.cleanupTimers.delete(t);
              this.flyCard('deck', `slot:${pid}:${s}`, { faceUp: false, durationMs: 180 });
            }, delay);
            this.cleanupTimers.add(t);
          }
        });
        break;
      }
      case 'DRAW': {
        const from = event.source === 'DECK' ? 'deck' : 'discard';
        const isLocal = event.playerId === localPlayerId;
        const to = isLocal ? 'drawn-float' : `seat:${event.playerId}`;
        this.flyCard(from, to, {
          card: isLocal || event.source === 'DISCARD' ? event.card : undefined,
          faceUp: isLocal || event.source === 'DISCARD',
          durationMs: 210
        });
        break;
      }
      case 'SWAP_HAND': {
        this.flyCard('drawn-float', `slot:${event.playerId}:${event.slotIndex}`, {
          faceUp: false,
          durationMs: 200
        });
        this.flyCard(`slot:${event.playerId}:${event.slotIndex}`, 'discard', {
          card: event.discardedCard,
          faceUp: true,
          durationMs: 220
        });
        break;
      }
      case 'DISCARD_DRAWN': {
        const from = event.playerId === localPlayerId ? 'drawn-float' : `seat:${event.playerId}`;
        this.flyCard(from, 'discard', {
          card: event.card,
          faceUp: true,
          durationMs: 210
        });
        break;
      }
      case 'BLIND_SWAP': {
        this.flySwapArc(
          `slot:${event.p1Id}:${event.idx1}`,
          `slot:${event.p2Id}:${event.idx2}`,
          350
        );
        break;
      }
      case 'MATCH_DISCARD': {
        this.flyCard(`slot:${event.targetPlayerId}:${event.slotIndex}`, 'discard', {
          card: event.card,
          faceUp: true,
          durationMs: 210
        });
        break;
      }
      case 'MISMATCH_SHAKE': {
        this.shakeAnchor(`slot:${event.targetPlayerId}:${event.slotIndex}`, 240);
        break;
      }
      case 'PENALTY_DRAW': {
        this.flyCard('deck', `slot:${event.playerId}:${event.slotIndex}`, {
          faceUp: false,
          durationMs: 230
        });
        break;
      }
      case 'TRANSFER': {
        this.flyCard(
          `slot:${event.fromPlayerId}:${event.fromSlot}`,
          `slot:${event.toPlayerId}:${event.toSlot}`,
          { faceUp: false, durationMs: 260, arcOffsetY: -20 }
        );
        break;
      }
      case 'FREEZE': {
        this.pulseAnchor(`seat:${event.playerId}`, 260);
        break;
      }
      case 'SHOWDOWN': {
        // Cards flip face-up in place via CardComponent CSS rotateY
        break;
      }
    }
  }

  clearAll(): void {
    this.cleanupTimers.forEach(t => clearTimeout(t));
    this.cleanupTimers.clear();
    this.flights.set([]);
  }
}
