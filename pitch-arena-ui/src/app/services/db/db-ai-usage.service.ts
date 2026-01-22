import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';

export type AiUsageContext = {
  arenaId?: string;
  sessionId?: string;
  //userId?: string;
  round?: number;
  date?: Date;
  judgeId?: string;
  durationMs?: number;
  inputChars?: number;
  purpose:
    | 'warmup'
    | 'judge_question'
    | 'resolution_eval'
    | 'parse_claims'
    | 'parse_assumptions'
    | 'update_context'
    | 'final_summary'
    | 'reprompt'
    | 'dev';
};

@Injectable({
  providedIn: 'root'
})
export class DbAIUsageService  extends DbInstanceService<AiUsageContext> {

  constructor() { 
    super();
    this.collectionName = 'aiusage';
  }

  logUsage(aiUsage: AiUsageContext){
    this.create(aiUsage).then(id => {
      console.log("usage logged", id, aiUsage)
    })
  }
  
}
