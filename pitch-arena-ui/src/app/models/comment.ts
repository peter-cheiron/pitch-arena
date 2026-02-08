export interface Comment {
    id?: string;
    userId?: string;
    referenceId: string;
    authorId: string;
    message: string;
    upvotes: number;
    subject: string;
    image?: string;
    userName?: string;
    createdAt?: Date;
    avatar?: string;
  }
  