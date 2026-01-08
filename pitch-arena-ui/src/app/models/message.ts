export interface Message {
    id?: string;
    from: string;
    message: string;
    date?: Date;
    image?: string;
    read: boolean;
    offer?: any;//need to create an actual offer
    wish?: string;//a reference to the wish not the wish
    preview?: any;
    subject?: string;
  }

  export interface User {
    id: string;
    name: string;
    avatarUrl?: string;
  }
  
  export interface MessageThread {
    contactId: string;
    messages: Message[];
  }
  
  export interface ContactSummary {
    user: { id: string; name: string }; // Extend later
    lastMessage: Message;
    unreadCount: number;
  }