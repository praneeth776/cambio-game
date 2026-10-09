import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-rules-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal-dialog" (click)="$event.stopPropagation()">
        
        <div class="modal-header">
          <h2>📖 CAMBIO // PROTOCOL BRIEFING</h2>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <section class="rule-section">
            <h3>🎯 OBJECTIVE</h3>
            <p>
              Hold the <strong>lowest total card points</strong> among all players. Each player starts with 4 face-down cards in a 2x2 grid. You only know the two bottom cards initially!
            </p>
          </section>

          <section class="rule-section">
            <h3>🃏 CARD VALUES</h3>
            <div class="values-grid">
              <div class="val-card best">
                <span class="label">RED KING (♥ / ♦)</span>
                <span class="pts">0 PTS</span>
                <small>The ultimate card!</small>
              </div>
              <div class="val-card">
                <span class="label">ACE</span>
                <span class="pts">1 PT</span>
              </div>
              <div class="val-card">
                <span class="label">2 THRU 10</span>
                <span class="pts">FACE VALUE</span>
              </div>
              <div class="val-card">
                <span class="label">JACK (J) & QUEEN (Q)</span>
                <span class="pts">11 & 12 PTS</span>
              </div>
              <div class="val-card worst">
                <span class="label">BLACK KING (♣ / ♠)</span>
                <span class="pts">13 PTS</span>
                <small>Heavy penalty!</small>
              </div>
            </div>
          </section>

          <section class="rule-section">
            <h3>⚡ SPECIAL ACTION CARDS (WHEN DISCARDED)</h3>
            <ul class="action-list">
              <li>
                <strong>Rank 7 or 8: PEEK OWN (DECRYPT CORE)</strong>
                <p>Look at one of your own hidden cards.</p>
              </li>
              <li>
                <strong>Rank 9 or 10: PEEK OPPONENT (INFILTRATE TARGET)</strong>
                <p>Look at one card belonging to any rival.</p>
              </li>
              <li>
                <strong>Jack or Queen: SWAP (NEURAL SPOOF)</strong>
                <p>Swap any two cards on the board without looking at them!</p>
              </li>
            </ul>
          </section>

          <section class="rule-section">
            <h3>💥 THE SLAP / SNAP RULE</h3>
            <p>
              Whenever <em>any</em> card is placed on top of the Discard pile, if you know you possess a card of that <strong>exact same rank</strong>, hit <strong>SLAP</strong> immediately!
            </p>
            <p>
              ✓ If matched: Your card is discarded into the pile (you now have fewer cards!).<br>
              ✗ If wrong: You draw a penalty card from the deck!
            </p>
          </section>

          <section class="rule-section">
            <h3>🚨 CALLING CAMBIO (EXTRACTION)</h3>
            <p>
              At the start of your turn, before drawing, you can shout <strong>CAMBIO</strong> if you believe you have the lowest score. Every other player gets <strong>one final turn</strong>, then all cards are flipped. Lowest total score wins!
            </p>
          </section>
        </div>

        <div class="modal-footer">
          <button class="got-it-btn" (click)="close.emit()">UNDERSTOOD</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(5px);
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .modal-dialog {
      background: var(--color-surface, #111422);
      border: 2px solid var(--color-primary);
      border-radius: 16px;
      max-width: 600px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 0 40px var(--color-primary-glow);
      font-family: var(--font-main);
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--color-border);
    }

    .modal-header h2 {
      font-size: 16px;
      margin: 0;
      color: var(--color-primary);
      letter-spacing: 1.5px;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 18px;
      cursor: pointer;
    }

    .close-btn:hover {
      color: var(--color-danger);
    }

    .modal-body {
      padding: 20px 24px;
      overflow-y: auto;
      color: var(--color-text);
      font-size: 13px;
      line-height: 1.6;
    }

    .rule-section {
      margin-bottom: 20px;
    }

    .rule-section h3 {
      font-size: 13px;
      color: var(--color-accent);
      margin: 0 0 8px 0;
      letter-spacing: 1px;
    }

    .values-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin-top: 8px;
    }

    .val-card {
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      padding: 8px;
      border-radius: 6px;
      text-align: center;
      display: flex;
      flex-direction: column;
    }

    .val-card.best {
      border-color: var(--color-success);
      color: var(--color-success);
    }

    .val-card.worst {
      border-color: var(--color-danger);
      color: var(--color-danger);
    }

    .val-card .label { font-size: 10px; font-weight: bold; }
    .val-card .pts { font-size: 14px; font-weight: 900; margin: 2px 0; }
    .val-card small { font-size: 9px; opacity: 0.8; }

    .action-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .action-list li {
      background: var(--color-surface-elevated);
      border-left: 3px solid var(--color-primary);
      padding: 8px 12px;
      margin-bottom: 6px;
      border-radius: 0 6px 6px 0;
    }

    .action-list p {
      margin: 2px 0 0 0;
      color: var(--color-text-muted);
      font-size: 12px;
    }

    .modal-footer {
      padding: 12px 24px;
      border-top: 1px solid var(--color-border);
      display: flex;
      justify-content: flex-end;
    }

    .got-it-btn {
      background: var(--color-primary);
      color: #0b0f19;
      border: none;
      font-weight: 900;
      padding: 10px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-family: var(--font-main);
    }
  `]
})
export class RulesModalComponent {
  @Output() close = new EventEmitter<void>();
  constructor(public themeService: ThemeService) {}
}
