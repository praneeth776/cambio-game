import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card, Suit } from '../../models/game.models';
import { ThemeService } from '../../services/theme.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="card-wrapper" 
      [class.face-up]="isFaceUp" 
      [class.selectable]="isSelectable"
      [class.selected]="isSelected"
      [class.active-peek]="isPeeked"
      [class.disabled]="disabled"
      (click)="onCardClick()">
      
      <div class="card-inner">
        <!-- CARD BACK -->
        <div class="card-face card-back">
          <div class="card-back-art" [innerHTML]="sanitizedBackSvg"></div>
          <div class="card-back-overlay">
            <span class="slot-badge" *ngIf="slotIndex !== undefined">#{{ slotIndex + 1 }}</span>
          </div>
        </div>

        <!-- CARD FRONT -->
        <div class="card-face card-front" *ngIf="card" [class.red-suit]="card.isRed">
          <div class="card-top-corner">
            <span class="rank">{{ card.label }}</span>
            <span class="suit-icon">{{ getSuitIcon(card.suit) }}</span>
          </div>

          <div class="card-center">
            <div class="center-suit">{{ getSuitIcon(card.suit) }}</div>
            <div class="center-rank">{{ card.label }}</div>
            
            <!-- Special Action Badges -->
            <div class="action-tag" *ngIf="card.action === 'PEEK_OWN'">
              ⚡ {{ themeService.currentTheme().labels.actions.peekSelf }}
            </div>
            <div class="action-tag" *ngIf="card.action === 'PEEK_OTHER'">
              👁️ {{ themeService.currentTheme().labels.actions.peekOther }}
            </div>
            <div class="action-tag" *ngIf="card.action === 'SWAP'">
              🔀 {{ themeService.currentTheme().labels.actions.blindSwap }}
            </div>
            <div class="action-tag zero-pts" *ngIf="card.rank === 13 && card.isRed">
              ★ ZERO PTS ★
            </div>
            <div class="action-tag penalty" *ngIf="card.rank === 13 && !card.isRed">
              ⚠️ 13 PTS
            </div>
          </div>

          <div class="card-bottom-corner">
            <span class="rank">{{ card.label }}</span>
            <span class="suit-icon">{{ getSuitIcon(card.suit) }}</span>
          </div>

          <div class="point-badge">
            {{ card.pointValue }} {{ card.pointValue === 1 ? 'pt' : 'pts' }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: inline-block;
      perspective: 1000px;
    }

    .card-wrapper {
      width: 90px;
      height: 126px;
      position: relative;
      cursor: pointer;
      user-select: none;
      transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s ease;
    }

    @media (min-width: 768px) {
      .card-wrapper {
        width: 105px;
        height: 148px;
      }
    }

    .card-wrapper.disabled {
      cursor: not-allowed;
      opacity: 0.85;
    }

    .card-wrapper.selectable:hover {
      transform: translateY(-8px) scale(1.04);
      filter: drop-shadow(0 0 10px var(--color-primary-glow));
    }

    .card-wrapper.selected {
      transform: translateY(-12px) scale(1.06);
      filter: drop-shadow(0 0 15px var(--color-accent));
    }

    .card-wrapper.active-peek {
      animation: peekPulse 1.5s infinite alternate;
    }

    @keyframes peekPulse {
      0% { filter: drop-shadow(0 0 8px var(--color-primary-glow)); }
      100% { filter: drop-shadow(0 0 20px var(--color-secondary-glow)); }
    }

    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      text-align: center;
      transition: transform 0.45s cubic-bezier(0.4, 0.0, 0.2, 1);
      transform-style: preserve-3d;
      border-radius: 10px;
    }

    .card-wrapper.face-up .card-inner {
      transform: rotateY(180deg);
    }

    .card-face {
      position: absolute;
      width: 100%;
      height: 100%;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      border-radius: 10px;
      box-sizing: border-box;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    /* BACK FACE */
    .card-back {
      background: var(--card-back-bg, #0b0f19);
      border: 2px solid var(--card-back-border, #00f0ff);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-back-art {
      width: 100%;
      height: 100%;
      display: flex;
    }

    ::ng-deep .card-back-art svg {
      width: 100%;
      height: 100%;
    }

    .card-back-overlay {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2;
    }

    .slot-badge {
      background: rgba(0, 0, 0, 0.7);
      color: var(--color-primary);
      font-size: 10px;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid var(--color-primary);
      font-family: var(--font-main);
    }

    /* FRONT FACE */
    .card-front {
      background: var(--card-front-bg, #121727);
      border: 2px solid var(--card-front-border, #ff0055);
      color: var(--card-black-suit, #00f0ff);
      transform: rotateY(180deg);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px;
      font-family: var(--font-main);
    }

    .card-front.red-suit {
      color: var(--card-red-suit, #ff0055);
    }

    .card-top-corner, .card-bottom-corner {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1;
      font-weight: bold;
      font-size: 13px;
    }

    .card-bottom-corner {
      align-items: flex-end;
      transform: rotate(180deg);
    }

    .suit-icon {
      font-size: 11px;
    }

    .card-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 85%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .center-suit {
      font-size: 26px;
      opacity: 0.85;
      line-height: 1;
    }

    .center-rank {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: -1px;
    }

    .action-tag {
      margin-top: 4px;
      font-size: 8px;
      font-weight: bold;
      padding: 2px 4px;
      background: rgba(0, 240, 255, 0.15);
      border: 1px solid var(--color-primary);
      color: var(--color-primary);
      border-radius: 3px;
      text-transform: uppercase;
      white-space: nowrap;
      max-width: 90%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .action-tag.zero-pts {
      background: rgba(0, 230, 118, 0.2);
      border-color: #00e676;
      color: #00e676;
    }

    .action-tag.penalty {
      background: rgba(255, 23, 68, 0.2);
      border-color: #ff1744;
      color: #ff1744;
    }

    .point-badge {
      position: absolute;
      bottom: 4px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid currentColor;
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: bold;
    }
  `]
})
export class CardComponent {
  @Input() card: Card | null = null;
  @Input() isFaceUp: boolean = false;
  @Input() isSelectable: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() isPeeked: boolean = false;
  @Input() disabled: boolean = false;
  @Input() slotIndex?: number;

  @Output() cardClicked = new EventEmitter<number | undefined>();

  constructor(public themeService: ThemeService, private sanitizer: DomSanitizer) {}

  get sanitizedBackSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.themeService.currentTheme().cardBackSvg);
  }

  getSuitIcon(suit: Suit): string {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
    }
  }

  onCardClick(): void {
    if (this.disabled) return;
    this.cardClicked.emit(this.slotIndex);
  }
}
