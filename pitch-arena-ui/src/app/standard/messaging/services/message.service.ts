import { Message } from "src/app/standard/messaging/models/message";
import { inject, Injectable } from "@angular/core";
import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  or,
  query,
  setDoc,
  updateDoc,
  where,
} from "@angular/fire/firestore";
import { DbUserService } from "#services/db";

@Injectable({
  providedIn: "root",
})
export class MessagingService {
  private userService = inject(DbUserService);
  private db = inject(Firestore)

  // Listen for new messages in a conversation in real-time
  listenForMessages(
    threadId: string,
    callback: (messages: any[]) => void
  ): () => void {
    const threadRef = doc(this.db, "threads", threadId);

    // Set up the onSnapshot listener to listen for real-time updates
    const unsubscribe = onSnapshot(threadRef, (snapshot) => {
      const conversationData = snapshot.data();
      const messages = conversationData
        ? conversationData["conversation"] || []
        : [];
      callback(messages); // Pass the updated messages array to the callback
    });

    // Return the unsubscribe function to stop listening when no longer needed
    return unsubscribe;
  }

  /**
   * 
   * @param callback 
   * @returns 
   */
  listenForGlobalUnreadMessages(
    callback: (hasUnread: boolean, unreadCount: number, unreadThreads: string[]) => void
  ): () => void {
    const threadsRef = collection(this.db, "threads");

    const unsubscribe = onSnapshot(threadsRef, async (snapshot) => {
      let unreadCount = 0;
      const unreadThreads: string[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const messages: any[] = data['conversation'] || [];

        const hasUnread = messages.some(msg => msg.read === false);

        if (hasUnread) {
          unreadThreads.push(docSnap.id);
          unreadCount += messages.filter(msg => msg.read === false).length;
        }
      });

      callback(unreadCount > 0, unreadCount, unreadThreads);
    });

    return unsubscribe;
  }


  /**
   * What I want to test now is if I can send messages as a SUPER user.
   * Do I need to test whether this is working securely and that not anyone can send anyone a message.
   *
   * TODO think about how to constrain the system to avoid too many messages.
   *
   * @param from email
   * @param to email
   * @returns a promise
   */
  async createNewConversation(from: string, to: string): Promise<any> {
    const threadsRef = collection(this.db, "threads");
    const threadsQuery = query(
      threadsRef,
      where("from", "==", from),
      where("to", "==", to)
    );
  
    const snapshot = await getDocs(threadsQuery);
  
    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      return {
        id: existingDoc.id,
        ...existingDoc.data()
      };
    }
  
    const fromUser = await this.userService.getById(from);
    const newThreadRef = doc(threadsRef); // Auto-generated ID
  
    const newConversation = {
      from,
      fromUser,
      to,
      conversation: [] // Or omit this if unused
    };
  
    await setDoc(newThreadRef, newConversation);
  
    return {
      id: newThreadRef.id,
      ...newConversation
    };
  }
  

  // Retrieve threads where the user is either sender or recipient
  getThreads(uid: string): Promise<any[]> {
    const threadsRef = collection(this.db, "threads");
    const threadsQuery = query(
      threadsRef,
      or(where("from", "==", uid), where("to", "==", uid))
    );
    return getDocs(threadsQuery).then((snapshot) => {
      const threads = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return threads;
    });
  }

  // Get the last message from a thread to check if it has been read and who sent it
  getLastMessage(threadId: string): Promise<any> {
    const threadRef = doc(this.db, "threads", threadId);
    return getDoc(threadRef).then((snapshot) => {
      const conversation = snapshot.data()?.["conversation"] || [];
      const lastMessage =
        conversation.length > 0 ? conversation[conversation.length - 1] : null;
      return lastMessage;
    });
  }

  markAllAsRead(threadId: string): void {
    const threadRef = doc(this.db, "threads", threadId);

    getDoc(threadRef)
      .then((threadSnap) => {
        if (threadSnap.exists()) {
          const threadData = threadSnap.data();

          // Update all conversations to set `read` to true
          const updatedConversations = threadData["conversation"].map(
            (conversation: any) => {
              return { ...conversation, read: true };
            }
          );

          // Write the updated array back to Firestore
          updateDoc(threadRef, { conversation: updatedConversations })
            .then(() => {
              console.log("All conversations marked as read.");
            })
            .catch((error) => {
              console.error("Error updating conversations:", error);
            });
        } else {
          console.error("Thread not found!");
        }
      })
      .catch((error) => {
        console.error("Error fetching thread:", error);
      });
  }

  /**
   *
   * @param threadId
   * @param message see the model losers
   * @returns
   */
  sendMessage(threadId: string, message: Message): Promise<void> {
    const threadRef = doc(this.db, "threads", threadId);
    return updateDoc(threadRef, {
      conversation: arrayUnion(message),
    }).then(() => {});
  }
}
