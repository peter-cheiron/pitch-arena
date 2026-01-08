// services/user-activity.service.ts
import { Injectable } from '@angular/core';
import { collection, addDoc, Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserActivityService {
  private db = inject(Firestore); // ✅ uses the DI-provided, persistent instance

  //private db = getFirestore();
  private auth = inject(Auth);

  log(action: string, data: any = {}) {
    const uid = this.auth.currentUser?.uid ?? 'anonymous';
    const activity = {
      uid,
      action,
      data,
      timestamp: new Date().toISOString(),
    };
    try {
      addDoc(collection(this.db, 'userActivity'), activity);
    } catch (e) {
      console.warn('Activity logging failed', e);
    }
  }
}
