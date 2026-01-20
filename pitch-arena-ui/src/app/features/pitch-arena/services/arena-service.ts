import { inject, Injectable } from '@angular/core';
import { ArenaConfig } from '../models/arena-config';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ArenaService {
  http = inject(HttpClient);

  async getArenaConfig(path) {
    console.log("looking for", path)
    try {
      const cfg = await firstValueFrom(
        this.http.get<ArenaConfig>('/assets/arenas/' + path + '.json')
      );
      return cfg;
    }catch(err){
      console.log(err)
      return null;
    } 
  }

  //TODO provide some demo hardcoded configs for ease of use.
}
