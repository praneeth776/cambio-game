import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { LobbyComponent } from './components/lobby/lobby.component';
import { ArenaComponent } from './components/arena/arena.component';
import { RulesModalComponent } from './components/rules-modal/rules-modal.component';
import { GameService } from './services/game.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    LobbyComponent,
    ArenaComponent,
    RulesModalComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  showRulesModal = false;

  constructor(
    public gameService: GameService,
    public themeService: ThemeService
  ) {}
}
