import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { MessagingService } from './services/message.service';
import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatWindowComponent } from "./chat-window/chat-window.component";
import { ConversationListComponent } from "./conversation-list/conversation-list.component";
import { where } from '@angular/fire/firestore';
import { UiButtonPillComponent } from "#ui";
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-messaging',
  templateUrl: './messaging.component.html',
  imports: [
    TranslatePipe,
    FormsModule, ChatWindowComponent, ConversationListComponent, UiButtonPillComponent]
})
/**
 * TODO make the first part of the thread about optionally something like the topic to make the message threads clearer
 */
export class MessagingComponent {
  conversations: any[] = [];
  selectedConversation: any = null;
  messages: any[] = [];
  newRecipientEmail = '';
  
  private unsubscribeFromMessages: () => void; // Store the unsubscribe function

  private messagingService = inject(MessagingService)
  private auth = inject(AuthService)
  private userService = inject(DbUserService)

  userId;

  constructor(){
    effect(() => {
      if(this.auth.user()){
          this.userId = this.auth.user().uid;
          this.fetchConversations(this.auth.user().uid);
        }
      })
  }

  ngOnDestroy(): void {
    // Unsubscribe from the message listener when the component is destroyed
    if (this.unsubscribeFromMessages) {
      this.unsubscribeFromMessages();
    }
  }

  fetchConversations(id) {
    this.messagingService.getThreads(id)
      .then((threads) => {
        console.log(threads)
        this.conversations = threads;
      })
      .catch((error) => console.error("Error fetching threads: ", error));
  }

  selectConversation(conversation: any) {
    if (this.selectedConversation?.id !== conversation.id) {
      this.selectedConversation = conversation;
      this.messagingService.markAllAsRead(conversation.id);
      this.listenForNewMessages(conversation.id);
    }
  }

  listenForNewMessages(threadId: string) {
    // Unsubscribe from the previous conversation if there’s already a listener
    if (this.unsubscribeFromMessages) {
      this.unsubscribeFromMessages();
    }

    // Set up the real-time listener for new messages
    this.unsubscribeFromMessages = this.messagingService.listenForMessages(threadId, (messages) => {
      this.messages = messages;
    });
  }

  fetchMessages(threadId: string) {
    this.messagingService.getLastMessage(threadId)
      .then((lastMessage) => {
        // Initialize the messages array with the conversation from the selected conversation
        this.messages = this.selectedConversation.conversation || [];
  
        // Only push the last message if it's not already in the messages array
        if (lastMessage && (this.messages.length === 0 || this.messages[this.messages.length - 1].date !== lastMessage.date)) {
          this.messages.push(lastMessage);
        }
      })
      .catch((error) => console.error("Error fetching last message: ", error));
  }
  

  async startNewConversation() {
    const email = this.newRecipientEmail.trim();
    if (!email) return;

    try {
      const [recipient] = await this.userService.runQuery({
        where: where("email", "==", email)
      });

      const toUserId = (recipient as any)?.id || (recipient as any)?.userId;
      if (!toUserId) {
        console.error(`No user found for email ${email}`);
        return;
      }

      const newConversation = await this.messagingService.createNewConversation(this.userId, toUserId);
      this.conversations = [...this.conversations, newConversation];
      this.newRecipientEmail = ''; // Clear input field
      // Do not automatically select the conversation yet
    } catch (error) {
      console.error("Error creating new conversation: ", error);
    }
  }
}
