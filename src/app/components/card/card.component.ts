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
    <!-- EMPTY GHOST SLOT PLACEHOLDER (preserves 2x2 spatial memory) -->
    <div
      *ngIf="isEmptySlot"
      class="card-empty-slot"
      [class.compact]="compact"
      aria-label="Empty card slot">
      <span class="empty-slot-num" *ngIf="slotIndex !== undefined">#{{ slotIndex + 1 }}</span>
      <span class="empty-slot-lbl">SHED</span>
    </div>

    <!-- ACTIVE CARD -->
    <button
      *ngIf="!isEmptySlot"
      type="button"
      class="card-wrapper"
      [class.compact]="compact"
      [class.face-up]="isFaceUp"
      [class.selectable]="isSelectable && !disabled && !isFrozen"
      [class.selected]="isSelected"
      [class.frozen]="isFrozen"
      [class.disabled]="disabled || isFrozen"
      [disabled]="disabled || isFrozen"
      (click)="onCardClick()">

      <div class="card-inner">
        <!-- CARD BACK -->
        <div class="card-face card-back">
          <div class="card-back-art" [innerHTML]="sanitizedBackSvg"></div>
          <span class="slot-badge" *ngIf="slotIndex !== undefined">#{{ slotIndex + 1 }}</span>
          <div class="frozen-lock-overlay" *ngIf="isFrozen">
            <span>❄️</span>
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
            <div
              class="special-score-chip"
              *ngIf="!compact && isSpecialPointCard(card)"
              [class.best]="card.pointValue === -1"
              [class.zero]="card.suit === 'joker'"
              [class.worst]="card.pointValue === 13">
              {{ card.pointValue === -1 ? '-1 PT' : card.suit === 'joker' ? '0 PT' : '13 PTS' }}
            </div>
          </div>

          <div class="card-bottom-corner">
            <span class="rank">{{ card.label }}</span>
            <span class="suit-icon">{{ getSuitIcon(card.suit) }}</span>
          </div>

          <!-- Non-overlapping slim bottom 3s peek progress bar -->
          <div class="peek-progress-track" *ngIf="isTemporarilyOpen">
            <div class="peek-progress-fill"></div>
          </div>
        </div>
      </div>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
      perspective: 900px;
    }

    .card-empty-slot {
      width: 80px;
      height: 112px;
      border: 1.5px dashed var(--color-border, #1f2945);
      border-radius: 9px;
      background: rgba(0, 0, 0, 0.22);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      font-family: var(--font-main);
      color: var(--color-text-dim);
      user-select: none;
    }

    @media (min-width: 768px) {
      .card-empty-slot {
        width: 92px;
        height: 130px;
      }
    }

    .card-empty-slot.compact {
      width: 52px;
      height: 74px;
      border-radius: 6px;
    }

    .empty-slot-num {
      font-size: 11px;
      font-weight: 800;
      opacity: 0.7;
    }

    .empty-slot-lbl {
      font-size: 8px;
      letter-spacing: 0.8px;
      opacity: 0.5;
    }

    .card-wrapper {
      width: 80px;
      height: 112px;
      padding: 0;
      border: none;
      background: transparent;
      position: relative;
      cursor: pointer;
      user-select: none;
      transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
    }

    @media (min-width: 768px) {
      .card-wrapper {
        width: 92px;
        height: 130px;
      }
    }

    .card-wrapper.compact {
      width: 52px;
      height: 74px;
    }

    .card-wrapper:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 3px;
      border-radius: 10px;
    }

    .card-wrapper.disabled {
      cursor: default;
    }

    .card-wrapper.frozen {
      cursor: not-allowed;
      opacity: 0.78;
    }

    .card-wrapper.selectable:hover {
      transform: translateY(-5px);
    }

    .card-wrapper.selectable:hover .card-back,
    .card-wrapper.selectable:hover .card-front {
      border-color: var(--color-primary);
      box-shadow: 0 0 12px var(--color-primary-glow);
    }

    .card-wrapper.selected {
      transform: translateY(-9px) scale(1.04);
    }

    .card-wrapper.selected .card-back,
    .card-wrapper.selected .card-front {
      border-color: var(--color-accent);
      box-shadow: 0 0 16px rgba(255, 230, 0, 0.55);
    }

    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      text-align: center;
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      transform-style: preserve-3d;
      border-radius: 9px;
    }

    .card-wrapper.compact .card-inner {
      border-radius: 6px;
    }

    .card-wrapper.face-up .card-inner {
      transform: rotateY(180deg);
    }

    .card-face {
      position: absolute;
      inset: 0;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      border-radius: 9px;
      box-sizing: border-box;
      overflow: hidden;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.38);
    }

    .card-wrapper.compact .card-face {
      border-radius: 6px;
    }

    /* BACK FACE */
    .card-back {
      background: var(--card-back-bg, #0b0f19);
      border: 1.5px solid var(--card-back-border, #00f0ff);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
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

    .slot-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2;
      background: rgba(0, 0, 0, 0.78);
      color: var(--color-text-muted);
      font-size: 9px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 4px;
      font-family: var(--font-main);
    }

    .card-wrapper.compact .slot-badge {
      font-size: 7px;
      top: 2px;
      right: 2px;
      padding: 0 3px;
    }

    .frozen-lock-overlay {
      position: absolute;
      inset: 0;
      background: rgba(125, 211, 252, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      z-index: 3;
      pointer-events: none;
    }

    .card-wrapper.compact .frozen-lock-overlay {
      font-size: 14px;
    }

    .card-wrapper.frozen .card-back {
      border-color: #7dd3fc;
    }

    /* FRONT FACE */
    .card-front {
      background: var(--card-front-bg, #121727);
      border: 1.5px solid var(--card-front-border, #ff0055);
      color: var(--card-black-suit, #00f0ff);
      transform: rotateY(180deg);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 5px 6px;
      font-family: var(--font-main);
    }

    .card-wrapper.compact .card-front {
      padding: 3px 4px;
    }

    .card-front.red-suit {
      color: var(--card-red-suit, #ff0055);
    }

    .card-top-corner, .card-bottom-corner {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1;
      font-weight: 900;
      font-size: 12px;
    }

    .card-wrapper.compact .card-top-corner,
    .card-wrapper.compact .card-bottom-corner {
      font-size: 9px;
    }

    .card-bottom-corner {
      align-items: flex-end;
      transform: rotate(180deg);
    }

    .suit-icon {
      font-size: 10px;
    }

    .card-wrapper.compact .suit-icon {
      font-size: 8px;
    }

    .card-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      pointer-events: none;
    }

    .center-suit {
      font-size: 26px;
      line-height: 1;
    }

    .card-wrapper.compact .center-suit {
      font-size: 17px;
    }

    .special-score-chip {
      font-size: 8px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid currentColor;
      background: rgba(0, 0, 0, 0.55);
      white-space: nowrap;
    }

    .special-score-chip.best {
      color: #00e676;
    }

    .special-score-chip.zero {
      color: #00f0ff;
    }

    .special-score-chip.worst {
      color: #ff1744;
    }

    /* Slim bottom 3s peek timer track (zero overlap with rank/suit) */
    .peek-progress-track {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .peek-progress-fill {
      height: 100%;
      background: var(--color-primary);
      animation: peekDrain 3s linear forwards;
    }

    @keyframes peekDrain {
      from { transform: scaleX(1); transform-origin: left center; }
      to { transform: scaleX(0); transform-origin: left center; }
    }
  `]
})
export class CardComponent {
  @Input() card: Card | null = null;
  @Input() isEmptySlot: boolean = false;
  @Input() compact: boolean = false;
  @Input() isFaceUp: boolean = false;
  @Input() isTemporarilyOpen: boolean = false;
  @Input() isSelectable: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() isFrozen: boolean = false;
  @Input() disabled: boolean = false;
  @Input() slotIndex?: number;

  @Output() cardClicked = new EventEmitter<number | undefined>();

  constructor(public themeService: ThemeService, private sanitizer: DomSanitizer) {}

  get sanitizedBackSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.themeService.currentTheme().cardBackSvg);
  }

  isSpecialPointCard(card: Card): boolean {
    return card.pointValue === -1 || card.suit === 'joker' || card.pointValue === 13;
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

  onCardClick(): void {
    if (this.disabled || this.isFrozen || this.isEmptySlot) return;
    this.cardClicked.emit(this.slotIndex);
  }
}
