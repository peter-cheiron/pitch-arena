export interface Message {
    id?: string;
    from: string;
    message: string;
    date?: Date;
    image?: string;
    read: boolean;
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