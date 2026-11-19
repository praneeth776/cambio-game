import { Component, Directive, ElementRef, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardFlightService, FlightSprite } from '../../services/card-flight.service';
import { ThemeService } from '../../services/theme.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Suit } from '../../models/game.models';

@Directive({
  selector: '[appFlightMotion]',
  standalone: true
})
export class FlightMotionDirective implements OnInit {
  @Input('appFlightMotion') sprite!: FlightSprite;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const node = this.el.nativeElement;
    if (!this.sprite || typeof node.animate !== 'function') return;

    const { from, to, durationMs, arcOffsetY } = this.sprite;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sx = from.w > 0 ? to.w / from.w : 1;
    const sy = from.h > 0 ? to.h / from.h : 1;

    if (arcOffsetY !== 0) {
      node.animate(
        [
          { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 0.95 },
          {
            transform: `translate3d(${dx * 0.5}px, ${dy * 0.5 + arcOffsetY}px, 0) scale(${(1 + sx) * 0.52}, ${(1 + sy) * 0.52})`,
            opacity: 1,
            offset: 0.5
          },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0.9 }
        ],
        {
          duration: durationMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        }
      );
    } else {
      node.animate(
        [
          { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 0.95 },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0.92 }
        ],
        {
          duration: durationMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        }
      );
    }
  }
}

@Component({
  selector: 'app-card-flight-layer',
  standalone: true,
  imports: [CommonModule, FlightMotionDirective],
  template: `
    <div class="flight-overlay" aria-hidden="true">
      <div
        *ngFor="let s of flightService.flights(); trackBy: trackSprite"
        class="flight-sprite"
        [appFlightMotion]="s"
        [style.left.px]="s.from.x"
        [style.top.px]="s.from.y"
        [style.width.px]="s.from.w"
        [style.height.px]="s.from.h">
        
        <div *ngIf="!s.faceUp || !s.card" class="sprite-back" [innerHTML]="sanitizedBackSvg"></div>
        <div *ngIf="s.faceUp && s.card" class="sprite-front" [class.red]="s.card.isRed">
          <span class="sprite-rank">{{ s.card.label }}</span>
          <span class="sprite-suit">{{ getSuitIcon(s.card.suit) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .flight-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 900;
      overflow: hidden;
    }

    .flight-sprite {
      position: fixed;
      transform-origin: top left;
      will-change: transform, opacity;
      border-radius: 8px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
      overflow: hidden;
    }

    .sprite-back {
      width: 100%;
      height: 100%;
      background: var(--card-back-bg, #0b0f19);
      border: 2px solid var(--card-back-border, #00f0ff);
      border-radius: 8px;
    }

    ::ng-deep .sprite-back svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .sprite-front {
      width: 100%;
      height: 100%;
      background: var(--card-front-bg, #121727);
      border: 2px solid var(--card-front-border, #ff0055);
      color: var(--card-black-suit, #00f0ff);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: var(--font-main);
      font-weight: 900;
      border-radius: 8px;
    }

    .sprite-front.red {
      color: var(--card-red-suit, #ff0055);
    }

    .sprite-rank {
      font-size: 18px;
      line-height: 1;
    }

    .sprite-suit {
      font-size: 20px;
      line-height: 1.1;
    }
  `]
})
export class CardFlightLayerComponent {
  constructor(
    public flightService: CardFlightService,
    private themeService: ThemeService,
    private sanitizer: DomSanitizer
  ) {}

  get sanitizedBackSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.themeService.currentTheme().cardBackSvg);
  }

  trackSprite(_idx: number, sprite: FlightSprite): string {
    return sprite.id;
  }

  getSuitIcon(suit: Suit): string {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      case 'joker': return '🃏';
    }
  }
}
