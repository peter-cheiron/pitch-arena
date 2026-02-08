import { HttpLoaderFactory } from './app/app.config';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

import {
  provideAnalytics,
  getAnalytics,
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';

import {
  withInterceptorsFromDi,
  provideHttpClient,
  HttpClient,
} from '@angular/common/http';

import { environment } from '#environments/environment';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { importProvidersFrom } from '@angular/core';
import { routes } from './app/app.routes';

//uncomment if you want a lot of logs
//import { setLogLevel } from 'firebase/firestore';
//setLogLevel('debug'); // do this once during app init (dev only)


// 👉 Firestore cache imports (from Firebase JS SDK, not AngularFire)
import {
  CACHE_SIZE_UNLIMITED,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { App } from './app/app';
import { provideRouter } from '@angular/router';

const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Firebase API called outside injection context')) {
    return; // suppress that noisy dev warning
  }
  originalWarn(...args);
};

bootstrapApplication(App, {
  providers: [
    importProvidersFrom(
      BrowserModule,
      FormsModule,
      ReactiveFormsModule,
      TranslateModule.forRoot({
        loader: { provide: TranslateLoader, useFactory: HttpLoaderFactory, deps: [HttpClient] },
      })
    ),

    provideRouter(routes), 

    // Pick ONE animations strategy (kept the standard one here)
    provideAnimations(),

    // Firebase core
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),

    // ✅ Firestore with persistent cache + multi-tab
    provideFirestore(() =>
      initializeFirestore(getApp(), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
           cacheSizeBytes: CACHE_SIZE_UNLIMITED, // uncomment if you want no LRU eviction
        }),
      })
    ),

    // Other Firebase services (unchanged)
    provideAuth(() => getAuth()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,
    provideFunctions(() => getFunctions()),
    provideMessaging(() => getMessaging()),
    provideStorage(() => getStorage()),

    provideHttpClient(withInterceptorsFromDi()),
    // { provide: ErrorHandler, useClass: CustomErrorHandler }
  ],
});
