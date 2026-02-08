export type ReactionKey = 'fire'|'hundred'|'heart'|'like'|'wow'|'ok';

export interface Reaction {
  id?: string;
  targetId: string;               // duplicate for easy queries/rules
  userId: string;                 // auth uid
  reactions?: { [K in ReactionKey]?: {
      count: number;
      reactors: string[];
  } }; 
}


