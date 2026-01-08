import { Auth, onAuthStateChanged, type User } from "@angular/fire/auth";
import { inject, Injectable, PLATFORM_ID, signal } from "@angular/core";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  getCountFromServer,
  setDoc,
  onSnapshot,
  QueryConstraint,
  WhereFilterOp,
  DocumentSnapshot,
  startAfter,
  arrayRemove,
  Firestore,
} from "@angular/fire/firestore";
import { isPlatformBrowser } from "@angular/common";

type OrderBy = typeof orderBy;
type Where = typeof where;
type Limit = typeof limit;

type FlattenKeyPath<T extends object, Key = keyof T> = Key extends string
  ? // @ts-ignore
    T[Key] extends
      | unknown[]
      | string
      | number
      | null
      | undefined
      | boolean
      | symbol
    ? Key
    : // @ts-ignore
      `${Key}.${FlattenKeyPath<T[Key]>}`
  : never;

@Injectable({
  providedIn: "root",
})
export class DbInstanceService<T extends object> {
  collectionName: string;
  subCollectionName: string;

  user = signal<User | null>(null);
  //private db = getFirestore();
  
  private db = inject(Firestore); // ✅ uses the DI-provided, persistent instance

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private auth = this.isBrowser ? inject(Auth, { optional: true }) : null;

  constructor() {
    if (this.auth) {
      onAuthStateChanged(this.auth, (user) => {
        this.user.set(user);
      });
    }
  }

  getDB() {
    return this.db;
  }

  /**
   * used to create anonymous messages for example
   *
   * @param data
   * @returns
   */
  async createAnonymous(data: Partial<T>): Promise<string> {
    const dbCollection = collection(this.db, this.collectionName);
    const res = await addDoc(dbCollection, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: null,
    });

    return res.id;
  }

/**
 * Realtime list with server-side constraints and optional client-side filter.
 *
 * @param callback       called with the (optionally filtered) array
 * @param constraints    Firestore query constraints (where, orderBy, limit, etc.)
 * @param clientFilter   optional predicate to further filter in-memory
 * @returns              unsubscribe function
 */
listDocsRealtime(
  callback: (data: T[]) => void,
  constraints: QueryConstraint[] = [],
  clientFilter?: (item: T) => boolean
): () => void {

  //console.log(constraints)

  const colRef = collection(this.db, this.collectionName);
  const qRef = constraints.length ? query(colRef, ...constraints) : colRef;

  const unsubscribe = onSnapshot(qRef, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as T));
    const out = clientFilter ? list.filter(clientFilter) : list;
    callback(out);
  });

  return unsubscribe;
}

  /**
   * To a MAX of 10.
   * @param ids
   * @param collectionName
   * @returns
   */
  async getDocsByIds(ids: string[], forceRefresh = false): Promise<any[]> {
    const results: any[] = [];
    const missing: string[] = [];

    if (missing.length > 0) {
      const dbCollection = collection(this.db, this.collectionName);
      const chunks = this.chunkArray(missing, 10);

      for (const chunk of chunks) {
        const q = query(dbCollection, where("__name__", "in", chunk));
        const snapshot = await getDocs(q);

        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          results.push(data);

        });
      }
    }

    return results;
  }

  chunkArray<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }

  async listDocs(): Promise<T[]> {
    const colRef = collection(this.db, this.collectionName);
    const res = await getDocs(colRef);

    const list: T[] = [];
    for (const snap of res.docs) {
      const docData = { id: snap.id, ...snap.data() } as T;
      list.push(docData);
    }

    return list;
  }


  async getMyDocs(): Promise<T[]> {
    const userId = this.user().uid
    return this.runQuery({
      where: where("userId", "==", userId)
    })
  }

  async listYours(userId): Promise<T[]> {
    return this.runQuery({
      where: where("userId", "==", userId)
    })
  }

  /**
   * 
   * let cursor: DocumentSnapshot | undefined;

    const { items, lastDoc } = await repo.listDocs({
      limit: 10,
      orderByField: 'createdAt',
      orderDirection: 'desc',
      startAfterDoc: cursor
    });

    cursor = lastDoc; // Save this to fetch the next page
   * 
   * @param opts the different options 
   * @returns a list of docs constrained by the above
   */
  async paginate(opts?: {
    limit?: number;
    startAfterDoc?: DocumentSnapshot; // for pagination
    orderByField?: string; // required for startAfter
    orderDirection?: "asc" | "desc";
  }): Promise<{ items: T[]; lastDoc?: DocumentSnapshot }> {
    const dbCollection = collection(this.db, this.collectionName);
    const qConstraints: QueryConstraint[] = [];

    // Optional ordering
    if (opts?.orderByField) {
      qConstraints.push(
        orderBy(opts.orderByField, opts.orderDirection || "asc")
      );
    }

    // Optional pagination cursor
    if (opts?.startAfterDoc) {
      qConstraints.push(startAfter(opts.startAfterDoc));
    }

    // Optional limit
    if (opts?.limit) {
      qConstraints.push(limit(opts.limit));
    }

    const q = query(dbCollection, ...qConstraints);
    const res = await getDocs(q);

    const items = res.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
    const lastDoc = res.docs.length ? res.docs[res.docs.length - 1] : undefined;

    return { items, lastDoc };
  }

  /**
   * This gets the latest docs and their child docs
   *
   * @param subCollectionName
   * @param filters
   * @param sortBy
   * @returns
   */

  async listDocsWithSubcollectionConstraints<T = any>(
    subCollectionName?: string,
    filters: { field: string; op: WhereFilterOp; value: any }[] = [],
    sortBy: { field: string; direction?: "asc" | "desc" } = null,
    forceRefresh = false
  ): Promise<(T & { [key: string]: any })[]> {
    const constraints: QueryConstraint[] = [];

    for (const f of filters) {
      constraints.push(where(f.field, f.op, f.value));
    }

    if (sortBy) {
      constraints.push(orderBy(sortBy.field, sortBy.direction || "desc"));
    }

    const dbCollection = collection(this.db, this.collectionName);
    const q =
      constraints.length > 0
        ? query(dbCollection, ...constraints)
        : dbCollection;
    const res = await getDocs(q);

    const list: (T & { [key: string]: any })[] = [];
    

    for (const docSnap of res.docs) {
      const id = docSnap.id;

      const data = { id, ...docSnap.data() } as T;
  
      if (subCollectionName) {
        const subColRef = collection(docSnap.ref, subCollectionName);
        const subSnap = await getDocs(subColRef);
        const subDocs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data[subCollectionName] = subDocs;
      }

      list.push(data);
    }

    return list;
  }

  /**
   * The other query function is too complicated, move to this:
   *
   * where can be an array of: where: where("parentId", "==", this.challenge().id)
   *
   * @param opts
   * @returns
   */
  async runQuery(opts: { orderBy?; where?; limit? }): Promise<T[]> {
    const dbCollection = collection(this.getDB(), this.collectionName);
    const qConstraints: QueryConstraint[] = [];

    if (opts.where) {
      const whereArray = Array.isArray(opts.where) ? opts.where : [opts.where];
      qConstraints.push(...whereArray);
    }

    if (opts.orderBy) qConstraints.push(opts.orderBy);
    if (opts.limit !== undefined) qConstraints.push(limit(opts.limit));

    const q = query(dbCollection, ...qConstraints);
    const res = await getDocs(q);

    const source = res.metadata.fromCache ? "local cache" : "server";
    console.log("Data came from " + JSON.stringify(res.metadata));

    return res.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
  }

  /**
   *
   * @returns a lost of documents for a user userId == uid
   
  async countYours(userId): Promise<number> {
    const dbCollection = collection(this.db, this.collectionName);
    const res = await getCountFromServer(
      query(dbCollection, where("userId", "==", userId))
    );

    return res.data().count;
  }*/

  async count(
    fn: (opts: {
      where: Where;
      limit: Limit;
    }) => ReturnType<OrderBy | Where | Limit>[]
  ): Promise<number> {
    const dbCollection = collection(this.db, this.collectionName);
    const res = await getCountFromServer(
      query(dbCollection, ...fn({ where, limit }))
    );
    return res.data().count;
  }

  async getSubcollectionCount(
    parentId: string,
    subCollection: string
  ): Promise<number> {
    const subRef = collection(
      doc(this.db, this.collectionName, parentId),
      subCollection
    );
    const snapshot = await getCountFromServer(subRef);
    return snapshot.data().count;
  }

  async getById(id: string): Promise<T> {
    const docRef = doc(this.db, this.collectionName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error(`Document ${id} not found`);

    const data = { id: snap.id, ...snap.data() } as T;
    

    return data;
  }

    async getSubcollectionEntry<T = any>(
      parentId: string,
      childId: string,
      subCollectionName: string,
      parentCollection: string = this.collectionName
    ): Promise<(T & { parentId: string; childId: string }) | null> {
      const parentRef = doc(this.db, parentCollection, parentId);
      const childRef = doc(parentRef, subCollectionName, childId);

      const [parentSnap, childSnap] = await Promise.all([
        getDoc(parentRef),
        getDoc(childRef),
      ]);

      if (!parentSnap.exists() || !childSnap.exists()) return null;

      return {
        parentId,
        childId,
        ...(childSnap.data() || {}),
      } as T & { parentId: string; childId: string };
    }


  /**
   *
   *
   * @param id
   * @param subCollectionName
   * @returns
   */
  async getByIdWithSubcollection<T = any>(
    id: string,
    subCollectionName?: string
  ): Promise<(T & { [key: string]: any }) | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = { id: docSnap.id, ...docSnap.data() } as T;

    // Optionally load subcollection
    if (subCollectionName) {
      const subColRef = collection(docRef, subCollectionName);
      const subSnap = await getDocs(subColRef);
      const subDocs = subSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      data[subCollectionName] = subDocs;
    }

    return data;
  }

  /**
   *
   * @param parentId
   * @param subCollectionName
   * @param data
   * @param parentCollection
   */
  async addToSubcollection(
    parentId: string,
    subCollectionName: string,
    data: any,
    parentCollection: string = this.collectionName
  ): Promise<string> {
    const parentRef = doc(this.db, parentCollection, parentId);
    const subRef = collection(parentRef, subCollectionName);
    //I forgor to do this before so we lost the created at
    const docRef = await addDoc(subRef, {
      ...data,
      userId: this.user().uid, //use the uid generated by google auth to ensure same id in storage
      createdAt: serverTimestamp(),
      updatedAt: null,
    });
    return docRef.id;
  }

  async getSubcollection<T = any>(
    parentId: string,
    subCollectionName: string,
    parentCollection: string = this.collectionName
  ): Promise<T[]> {
    const parentRef = doc(this.db, parentCollection, parentId);
    const subRef = collection(parentRef, subCollectionName);
    const snapshot = await getDocs(subRef);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as T));
  }

  async createWithCustomid(data: Partial<T>): Promise<string> {
    const newDocRef = doc(this.db, this.collectionName, this.user().uid);
    const docId = newDocRef.id; // Retrieve the generated document ID

    await setDoc(
      newDocRef,
      {
        ...data,
        userId: this.user().uid, //use the uid generated by google auth to ensure same id in storage
        createdAt: serverTimestamp(),
        updatedAt: null,
      },
      { merge: true }
    );

    return docId;
  }

  async create(data: Partial<T>): Promise<string> {
    const dbCollection = collection(this.db, this.collectionName);
    const res = await addDoc(dbCollection, {
      ...data,
      userId: this.user().uid,
      createdAt: serverTimestamp(),
      updatedAt: null,
      type: this.collectionName,
    });

    return res.id;
  }

  async exists(id: string): Promise<boolean> {
    const res = await getDoc(doc(this.db, this.collectionName, id));
    return res.exists();
  }

  async update(
    id: string,
    data: Partial<T> | Record<FlattenKeyPath<T>, unknown>
  ) {
    const docRef = doc(this.db, this.collectionName, id);
    await updateDoc(docRef, {
      ...(data as T) /* force generic T, firestore doesnt like Partial<T>*/,
      updatedAt: serverTimestamp(),
    });
  }

  async updateArray(id: string, data: Partial<T>) {
    const docRef = doc(this.db, this.collectionName, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string) {
    await deleteDoc(doc(this.db, this.collectionName, id));
  }

  async removeFromArray(docId: string, field: string, itemToRemove: any) {
    const ref = doc(this.db, this.collectionName, docId);
    await updateDoc(ref, {
      [field]: arrayRemove(itemToRemove),
    });
  }

  async deleteFromSubcollection(
    parentId: string,
    subcollectionName: string,
    subDocId: string
  ) {
    const subDocRef = doc(
      this.db,
      this.collectionName,
      parentId,
      subcollectionName,
      subDocId
    );
    await deleteDoc(subDocRef);
  }
}