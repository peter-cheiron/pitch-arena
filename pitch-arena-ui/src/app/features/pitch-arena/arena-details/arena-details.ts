import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArenaConfig } from '../arena-models';
import { ArenaService } from '../services/arena-service';
import { UiButtonPillComponent } from '#ui';
import { JudgeCard } from '../arena/ui/judge-card/judge-card';

@Component({
  selector: 'app-arena-details',
  imports: [UiButtonPillComponent, JudgeCard],
  templateUrl: './arena-details.html',
  standalone: true
})
export class ArenaDetails {
  route = inject(ActivatedRoute);
  router = inject(Router);
  arenaService = inject(ArenaService);

  arenaConfig = signal<ArenaConfig | null>(null);
  arenaPath = signal<string | null>(null);

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path');
    if (path) {
      this.arenaPath.set(path);
      this.loadArena(path);
    }
  }

  private async loadArena(path: string) {
    const cfg = await this.arenaService.getArenaConfig(path);
    if (cfg) {
      this.arenaConfig.set(cfg);
    }
  }

  launchArena(noDeck) {
    const path = this.arenaPath();
    if (!path) return;
    if(noDeck)
      this.router.navigateByUrl("/arena/" + path);
    else
      this.router.navigateByUrl("/deck/" + path);
  }

  launchLab() {
    const path = this.arenaPath();
    if (!path) return;
    this.router.navigateByUrl("/lab/" + path);
  }
}
