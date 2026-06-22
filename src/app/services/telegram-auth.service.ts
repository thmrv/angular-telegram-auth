import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  phone_number?: string;
}

// Extend Window interface for Telegram Login library
declare global {
  interface Window {
    Telegram: {
      Login: {
        init: (options: TelegramInitOptions, callback: TelegramAuthCallback) => void;
        open: (callback?: TelegramAuthCallback) => void;
        auth: (options: TelegramInitOptions, callback: TelegramAuthCallback) => void;
      };
    };
  }
}

export interface TelegramInitOptions {
  client_id: number;
  request_access?: ('phone' | 'write')[];
  lang?: string;
  nonce?: string;
  origin?: string;
}

export type TelegramAuthCallback = (data: TelegramAuthResponse) => void;

export interface TelegramAuthResponse {
  id_token?: string;
  user?: TelegramUser;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TelegramAuthService {
  // IMPORTANT: Replace these with your actual bot credentials from @BotFather
  private readonly CLIENT_ID = 8728240009; // Your bot's Client ID
  private readonly CLIENT_SECRET = 'AAFXKTKRZHml7cRPkE4Hw_h8gM4Ui7R1-7g'; // Your bot's Client Secret

  private userSubject = new BehaviorSubject<TelegramUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private accessTokenSubject = new BehaviorSubject<string | null>(null);
  private idTokenSubject = new BehaviorSubject<string | null>(null);

  user$: Observable<TelegramUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  accessToken$: Observable<string | null> = this.accessTokenSubject.asObservable();
  idToken$: Observable<string | null> = this.idTokenSubject.asObservable();

  private isInitialized = false;
  private initCallback: TelegramAuthCallback | null = null;
  private pendingAuthCallback: TelegramAuthCallback | null = null;

  constructor(private ngZone: NgZone) {
    const savedUser = localStorage.getItem('telegram_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
          if (user.access_token) {
            this.accessTokenSubject.next(user.access_token);
          }
          if (user.id_token) {
            this.idTokenSubject.next(user.id_token);
          }
        } else {
          localStorage.removeItem('telegram_user');
        }
      } catch (e) {
        localStorage.removeItem('telegram_user');
      }
    }

    // Load the Telegram Login library
    this.loadTelegramLibrary();
  }

  /**
   * Load the Telegram Login library dynamically
   */
  private loadTelegramLibrary(): void {
    // Check if already loaded
    if (window.Telegram && window.Telegram.Login) {
      this.isInitialized = true;
      console.log('Telegram Login library already loaded');
      this.initializeLibrary();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-login.js';
    script.async = true;
    script.onload = () => {
      console.log('Telegram Login library loaded');
      this.isInitialized = true;
      this.initializeLibrary();
    };
    script.onerror = () => {
      console.error('Failed to load Telegram Login library');
      this.setError('Failed to load Telegram Login library. Please refresh the page.');
    };
    document.head.appendChild(script);
  }

  /**
   * Initialize the Telegram Login library
   */
  private initializeLibrary(): void {
    if (!window.Telegram || !window.Telegram.Login) {
      console.error('Telegram Login library not available');
      return;
    }

    const origin = window.location.origin;

    const options: TelegramInitOptions = {
      client_id: this.CLIENT_ID,
      request_access: ['phone'],
      lang: 'ru',
      origin: origin
    };

    // Store the callback for later use
    this.initCallback = (data: TelegramAuthResponse) => {
      this.ngZone.run(() => {
        this.handleAuthResponse(data);
      });
    };

    // Initialize the SDK
    window.Telegram.Login.init(options, this.initCallback);
    console.log('Telegram Login library initialized with client_id:', this.CLIENT_ID);
  }

  /**
   * Start Telegram authentication using the official library
   */
  startTelegramAuth(): void {
    this.setLoading(true);
    this.setError(null);

    // Check if library is loaded and initialized
    if (!this.isInitialized || !window.Telegram || !window.Telegram.Login) {
      // Try loading again
      this.loadTelegramLibrary();
      setTimeout(() => {
        if (this.isInitialized) {
          this.startTelegramAuth();
        } else {
          this.setError('Telegram Login library is still loading. Please try again.');
          this.setLoading(false);
        }
      }, 1500);
      return;
    }

    // Open the login popup
    window.Telegram.Login.open((data: TelegramAuthResponse) => {
      this.ngZone.run(() => {
        this.handleAuthResponse(data);
      });
    });
  }

  /**
   * Handle authentication response from Telegram
   */
  private handleAuthResponse(data: TelegramAuthResponse): void {
    console.log('Telegram auth response:', data);

    if (data.error) {
      this.setError(data.error);
      this.setLoading(false);
      return;
    }

    if (data.id_token) {
      // Store ID token
      this.idTokenSubject.next(data.id_token);

      // Parse ID token to get user data
      const user = this.parseIdToken(data.id_token);
      if (user) {
        user.id_token = data.id_token;
        this.processUserData(user);
      } else {
        this.setError('Failed to parse user data from ID token');
        this.setLoading(false);
      }
    } else if (data.user) {
      // Direct user data from callback
      this.processUserData(data.user);
    } else {
      this.setError('Invalid response from Telegram');
      this.setLoading(false);
    }
  }

  /**
   * Parse ID token to extract user data
   */
  private parseIdToken(idToken: string): TelegramUser | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT token');
      }

      const payload = JSON.parse(atob(parts[1]));
      console.log('ID Token payload:', payload);

      // Map the claims to our user object
      const user: TelegramUser = {
        id: payload.sub || payload.id || 0,
        first_name: payload.name?.split(' ')[0] || '',
        last_name: payload.name?.split(' ').slice(1).join(' ') || '',
        username: payload.preferred_username || '',
        photo_url: payload.picture || '',
        auth_date: payload.iat || Math.floor(Date.now() / 1000),
        hash: idToken.substring(0, 10),
        id_token: idToken,
        phone_number: payload.phone_number || ''
      };

      return user;
    } catch (error) {
      console.error('Failed to parse ID token:', error);
      return null;
    }
  }

  /**
   * Process user data and complete authentication
   */
  private processUserData(user: TelegramUser): void {
    console.log('Processing user data:', user);

    if (!user.id) {
      this.setError('Invalid user data received');
      this.setLoading(false);
      return;
    }

    this.setUser(user);
    this.setLoading(false);
    this.setError(null);
  }

  setUser(user: TelegramUser): void {
    localStorage.setItem('telegram_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
    if (user.access_token) {
      this.accessTokenSubject.next(user.access_token);
    }
    if (user.id_token) {
      this.idTokenSubject.next(user.id_token);
    }
  }

  getUser(): TelegramUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('telegram_user');
    this.userSubject.next(null);
    this.errorSubject.next(null);
    this.accessTokenSubject.next(null);
    this.idTokenSubject.next(null);
  }

  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  setError(error: string | null): void {
    this.errorSubject.next(error);
    if (error) {
      this.loadingSubject.next(false);
    }
  }

  getClientId(): number {
    return this.CLIENT_ID;
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }

  getAccessToken(): string | null {
    return this.accessTokenSubject.value;
  }

  getIdToken(): string | null {
    return this.idTokenSubject.value;
  }
}
