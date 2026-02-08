// groups/{groupId}
export interface Group {
  name: string;
  ownerId: string;
  visibility: 'private' | 'public';        
  createdAt: Date; 
  updatedAt: Date;
  members: Member[];
  invitees: Invitee[];
  items: Item[];
  id?: string;
}

// groups/{groupId}/members/{uid}
export interface Member {
  userId: string;                           // == uid (duplicate for easier queries)
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
  id?: string;
}

// (optional) groups/{groupId}/invites/{inviteId}
export interface Invitee {
  email?: string;
  token?: string;                           // short-lived join token
  role: 'member' | 'viewer';
  createdAt: Date;
  expiresAt: Date;
  id?: string;
}

// (example) group-scoped content
// groups/{groupId}/items/{itemId}
export interface Item{
  title: string; 
  id?: string;
  description?: string;
  createdBy: string; 
  createdAt: Date;
  updatedAt: Date;
}
