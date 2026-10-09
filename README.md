# CAMBIO // Online Multiplayer Card Game

An online, responsive implementation of the classic bluffing and memory card game **Cambio** (also known as Cabo / Cactus / Golf variant) built with **Angular 19**, **Signals**, and **serverless P2P WebRTC**. Supports up to **8 players** simultaneously directly through the browser with **zero backend server required**, optimized for free hosting on **GitHub Pages**.

---

## ⚡ Highlights

- **Up to 8-Player Multiplayer:** Serverless WebRTC peer-to-peer mesh networking powered by [Trystero](https://github.com/dmotz/trystero). No server bills, no backend database setup, and no accounts required.
- **Pluggable & Isolated Theme System:** Theming and design sources are decoupled from the UI logic in `src/app/themes/`. Switch effortlessly between:
  - **⚡ Cyberpunk Noir:** High-tech HUD, neon cyan/magenta glow, encrypted memory chips, digital audio SFX.
  - **🔮 Arcane Tarot:** Velvet darkness, gold-foil constellation cards, arcane runes, celestial aesthetics.
  - **♠️ Classic Speakeasy:** 1920s emerald felt poker table, brass gold accents, traditional playing cards.
- **Smart AI Bots:** Host can add 1 to 7 AI bots in the lobby with human-like memory and tactics for solo play or testing.
- **Rich Interactive Card Engine:**
  - 3D card flips with custom SVG card backs.
  - Initial 2-card peek phase.
  - Power Cards: Rank 7–8 (*Peek Own*), Rank 9–10 (*Peek Opponent*), Jack–Queen (*Blind Swap*), Red King (*0 Pts*), Black King (*13 Pts*).
  - The signature **Slap / Snap rule**: Shed matching cards out of turn, or draw a penalty for mistimed guesses.
  - **Cambio Extraction Call:** Final round trigger with audio siren and pulsating table warning.
  - Built-in Web Audio API synthesizer for zero-dependency sound effects.
- **Zero-Touch GitHub Pages Deployment:** Pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds and deploys on every push to `main`.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Run the Angular development server
npm start
```

Navigate to `http://localhost:4200/` in your browser.

---

## 🌐 How to Host on Your GitHub (GitHub Pages)

### 1. Create a Repository on GitHub
1. Go to [GitHub.com](https://github.com/new) and click **New Repository**.
2. Name it (for example: `cambio-game`). Leave "Initialize with a README" **unchecked**.

### 2. Push this Project to Your Remote
In your terminal inside this project directory (`cambio-game`):

```bash
git add .
git commit -m "Initial commit: Cambio 8-player Angular game with Cyberpunk & Tarot themes"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/cambio-game.git
git push -u origin main
```

### 3. Enable GitHub Pages via GitHub Actions
1. On your GitHub repository page, go to **Settings** > **Pages** (in the left sidebar).
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. That's it! GitHub Actions will run `.github/workflows/deploy.yml` and publish your game to:
   `https://<YOUR_GITHUB_USERNAME>.github.io/cambio-game/`

---

## 🎨 Adding or Modifying Themes

All themes implement the `ThemeConfig` interface and live in `src/app/themes/`:

```
src/app/themes/
├── theme.interface.ts     # Strong contract for palette, labels, SVGs
├── cyberpunk.theme.ts     # Cyberpunk Noir definitions
├── tarot.theme.ts         # Arcane Tarot definitions
├── classic.theme.ts       # Speakeasy definitions
└── index.ts               # Registry & barrel exports
```

To add a new theme (e.g. `Pixel Arcade`):
1. Create `pixel.theme.ts` adhering to `ThemeConfig`.
2. Register it in `src/app/themes/index.ts`.
3. It will automatically populate the theme switcher!

---

## 📜 Cambio Rules Quick Reference

- **Objective:** End the game with the lowest total card points.
- **Deal:** 4 face-down cards per player in a 2×2 grid. You peek at your bottom two cards only once at the start.
- **Values:**
  - Red Kings (♥ / ♦): **0 pts** (Best card!)
  - Ace: **1 pt**
  - Numbers 2–10: **Face value**
  - Jack (J) & Queen (Q): **11 & 12 pts**
  - Black Kings (♣ / ♠): **13 pts** (Worst card!)
- **Actions on Discard:**
  - 7 & 8: Peek at one of your own cards.
  - 9 & 10: Peek at one card of any opponent.
  - Jack & Queen: Swap any two cards in play without looking.
- **Slap (Match Discard):** If the discard card matches the rank of any card you own, slap it in immediately to discard it. If you guessed wrong, draw a penalty card!
- **Calling Cambio:** Declare on your turn before drawing. All other players get one last turn, then all cards are flipped and totaled!
