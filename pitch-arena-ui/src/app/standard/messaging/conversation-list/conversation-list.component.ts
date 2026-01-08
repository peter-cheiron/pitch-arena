import { AuthService } from "#services/auth";
import { DbUserService } from "#services/db";
import { MessagingService } from "../services/message.service";
import { TranslatePipe } from "@ngx-translate/core";
import {
  Component,
  Input,
  OnChanges,
  Output,
  EventEmitter,
  inject,
  effect,
  SimpleChanges,
} from "@angular/core";

@Component({
  standalone: true,
  selector: "app-conversation-list",
  templateUrl: "./conversation-list.component.html",
  imports: [TranslatePipe]
})
export class ConversationListComponent implements OnChanges {
  @Input() conversations: any[] = [];
  @Output() conversationSelected = new EventEmitter<any>();

  private profileService = inject(DbUserService);
  private messagingService = inject(MessagingService);
  private auth = inject(AuthService);

  userId;
  
  images = {
  }

  constructor() {
    effect(() => {
      if (this.auth.user()) {
        this.userId = this.auth.user().uid;

        this.populateConversationData();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversations'] && this.userId) {
      this.populateConversationData();
    }
  }

  private populateConversationData() {
    if (!this.conversations?.length) {
      return;
    }

    this.conversations = this.conversations.map((thread) => {
      const otherUserId = thread.from === this.userId ? thread.to : thread.from;
      return { ...thread, use: otherUserId };
    });

    

    this.conversations.forEach((thread) => {
      if (thread.use) {
        this.profileService.getById(thread.use).then(user => {
          this.images[user.userId] = user.profileImage ?? undefined;
          thread.fromUser = thread.fromUser ?? user;
        });
      }

      this.messagingService.getLastMessage(thread.id).then((message) => {
        thread.last = message?.message || "";
        thread.read = message?.read;
        thread.by = message?.from === this.userId;
      });
    });
  }


  // Method to handle conversation selection
  selectConversation(conversation: any) {
    //on this event we should mark all messages as read!
    this.conversationSelected.emit(conversation);
  }
}
