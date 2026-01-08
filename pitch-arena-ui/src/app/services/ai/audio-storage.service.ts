// audio-storage.service.ts
import { Injectable } from '@angular/core';
import { getApp } from '@angular/fire/app';
import { getDownloadURL, getStorage, ref, uploadBytes } from '@angular/fire/storage';


@Injectable({ providedIn: 'root' })
export class AudioStorageService {
  private storage = getStorage(getApp());

  /**
   * Upload an audio file and return its download URL.
   */
  uploadRecording(file: File, path?: string): Promise<string> {
    const timestamp = Date.now();
    const filePath = path || `recordings/${timestamp}-${file.name}`;
    const storageRef = ref(this.storage, filePath);

    return uploadBytes(storageRef, file).then(() => {
      return getDownloadURL(storageRef);
    });
  }

  /**
   * Given a storage path, return a fresh download URL.
   */
  getRecordingUrl(path: string): Promise<string> {
    const storageRef = ref(this.storage, path);
    return getDownloadURL(storageRef);
  }
}
