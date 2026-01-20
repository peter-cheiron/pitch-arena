import { Component, NgZone, inject, signal } from '@angular/core';
import { ChatUIMessage, ChatUiComponent } from './chat-ui';
import { ArenaConfig } from '../models/arena-config';
import { HostService } from '../services/host.service';
import { ArenaService } from '../services/arena-service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'chat-page',
  imports: [ChatUiComponent],
  templateUrl: './host-page.html',
})
export class HostPage {
  hostService = inject(HostService);
  arenaService = inject(ArenaService);
  route = inject(ActivatedRoute);
  zone = inject(NgZone);
  arenaConfig = signal<ArenaConfig>(null);

  //some local values
  host = null;
  maxRounds = signal<number>(3);
  round = signal<number>(1);
  arenaLoaded = signal<boolean>(false);

  //the state of the game
  profile = null;
  lastQuestion = null;
  eventLog = signal<
    Array<{
      ts: number;
      type: string;
      payload: unknown;
    }>
  >([]);

  messages = signal<ChatUIMessage[]>([
    {
      id: this.generateID(),
      text: 'welcome to host test room',
      role: 'system',
    },
  ]);

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path');
    if (path) {
      this.loadArena(path);
    } else {
      //load a default
      const test = 'solo_vc'; //"arena_gemini3_fast"
      this.loadArena(test);
    }
  }

  private async loadArena(path) {
    try {
      this.logEvent('arena.load.start', { path });
      const cfg = await this.arenaService.getArenaConfig(path);
      this.arenaConfig.set(cfg);
      this.logEvent('arena.load.config', { path, cfg });

      this.host = cfg.judges.find(j => j.id === "host")
      this.logEvent('arena.load.host', { host: this.host });

      const maxRoundsFromCfg = cfg.objective?.constraints?.maxRounds;

      if (
        typeof maxRoundsFromCfg === 'number' &&
        Number.isFinite(maxRoundsFromCfg) &&
        maxRoundsFromCfg > 0
      ) {
        this.maxRounds.set(maxRoundsFromCfg);
        if (this.round() > maxRoundsFromCfg) this.round.set(maxRoundsFromCfg);
      }
      this.profile = this.hostService.getNewProfile(this.host.profileConfig)
      this.logEvent('arena.profile.init', { profile: this.profile });
      const hostWelcome = "welcome to the arena, tell us who you are and why you are here today?"
      this.lastQuestion = hostWelcome; 
      //perhaps we wnat a welcome message first
      this.arenaLoaded.set(true);
      this.messages.update(messages => [
        ...messages,
        this.createMessage('at', hostWelcome),
      ]);
      this.logEvent('message.system', { text: hostWelcome });
    } finally {
      //add in timing etc
    }
  }

  gotMessage(message) {
    //this will be the user text only so
    const chat = this.createMessage('user', message);
    this.messages.update(messages => [...messages, chat]);
    this.logEvent('message.user', { message: chat });
    //then we get the reply

    //so do we want to manage the prompting or do we leave it to the host
    //service ... 
    const prompt = this.hostService.getPrompt(this.arenaConfig(), 
      this.host, {
        profile: this.profile,
        lastQ: this.lastQuestion,
        lastA: message,
    });
    this.logEvent('prompt.created', { prompt });

    this.hostService.runPrompt(message, prompt, null).then(answer => {
      this.logEvent('prompt.response.raw', { answer });
      //here we get
      //phase, ready, nextQuestion and profile
      const answerObj = JSON.parse(answer)
      this.logEvent('prompt.response.parsed', { answerObj });
      if(answerObj.ready){
        this.messages.update(messages => [
          ...messages,
          this.createMessage('ai', 'and we are now ready for the judges'),
        ]);
        this.logEvent('message.ai', { text: 'and we are now ready for the judges' });
      }else{
        this.profile = this.hostService.mergeProfiles(this.profile, answerObj.profile);
          this.lastQuestion = answerObj.nextQuestion;
          const message = this.createMessage('ai', this.lastQuestion)
          this.messages.update(messages => [
            ...messages,
            message
          ]);  
          this.logEvent('message.ai', { message });
      }
    })
    
  }

  createMessage(type, text) {
    return {
      id: this.generateID(),
      text: text,
      role: type,
    };
  }

  generateID() {
    return crypto.randomUUID();
  }

  /**
   * consider whether to make this optional to avoid memory
   * @param type of event
   * @param payload the event
   */
  private logEvent(type, payload) {
    this.eventLog.update(events => [
      ...events,
      {
        ts: Date.now(),
        type,
        payload,
      },
    ]);
  }
}
