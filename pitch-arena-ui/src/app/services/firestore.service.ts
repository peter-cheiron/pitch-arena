// firestore.service.ts
import { collection, getCountFromServer, Firestore } from '@angular/fire/firestore';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private db = inject(Firestore);

  async countDocs(collectionPath: string): Promise<number> {
    const collRef = collection(this.db, collectionPath);
    const snapshot = await getCountFromServer(collRef);
    return snapshot.data().count;
  }
}
