import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

declare global {
  interface Window {
    onTelegramAuth: (user: TelegramUser) => void;
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  access_token?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TelegramAuthService {
  // IMPORTANT: Replace this with your actual bot ID from @BotFather
  private readonly AUTH_URI = 'https://oauth.telegram.org/auth';
  private readonly BOT_ID = '8728240009';
  private readonly REDIRECT_URI = window.location.origin;

  private userSubject = new BehaviorSubject<TelegramUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  user$: Observable<TelegramUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();

  constructor() {
    const savedUser = localStorage.getItem('telegram_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
        } else {
          localStorage.removeItem('telegram_user');
        }
      } catch (e) {
        localStorage.removeItem('telegram_user');
      }
    }

    // Check for Telegram callback
    this.checkTelegramCallback();
  }

  /**
   * Start Telegram OAuth flow - using the embed widget approach which is more reliable
   */
  async startTelegramAuth(): Promise<void> {
    this.setLoading(true);
    this.setError(null);

    // Use the embed widget approach which is more reliable
    const url = await this.getEmbedWidgetUrl();
    console.log('Telegram Auth URL:', url);

    const width = 600;
    const height = 500;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      url,
      'TelegramAuth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      this.setError('Popup blocked. Please allow popups for this site.');
      this.setLoading(false);
      return;
    }

    // Set up the callback function that Telegram will call
    window.onTelegramAuth = (user: TelegramUser) => {
      this.handleTelegramAuth(user);
    };

    // Check if popup closed
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup);
        // Clean up
        window.onTelegramAuth = () => { };
        if (!this.userSubject.value) {
          this.setError('Authorization cancelled or timed out.');
          this.setLoading(false);
        }
      }
    }, 500);
  }

  /**
   * Get the embed widget URL - this is the most reliable method
   */
  private async getEmbedWidgetUrl(): Promise<any> {
    const origin = window.location.origin;
    const state = this.generateState();
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    //return `https://oauth.telegram.org/embed/${this.BOT_ID}?size=large&origin=${encodeURIComponent(origin)}&request_access=write&return_to=${encodeURIComponent(origin)}`;
    /*const url = `${this.AUTH_URI}?` +
      `client_id=${this.BOT_ID}` +
      `&redirect_uri=${this.REDIRECT_URI}` +
      `&response_type=code` +
      `&scope=openid%20profile%20phone` +
      `&state=${state}` +
      `&code_challenge=${codeChallenge}` + 
      `&code_challenge_method=S256` +
      `&origin=${origin}`;*/
    const url = `https://oauth.telegram.org/auth?response_type=post_message&client_id=${this.BOT_ID}&redirect_uri=${this.REDIRECT_URI}&scope=openid profile telegram%3Abot_access`;
    return url;
  }

  private generateState(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 16;
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  private generateCodeVerifier(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const length = 64;
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }
    return result;
  }

  // 2. Create SHA-256 challenge
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Handle Telegram auth callback from the embed widget
   */
  private handleTelegramAuth(user: TelegramUser): void {
    console.log('Telegram auth callback received:', user);

    if (!user || !user.id || !user.auth_date || !user.hash) {
      this.setError('Invalid Telegram user data received.');
      this.setLoading(false);
      return;
    }

    this.setUser(user);
    this.setLoading(false);
    this.setError(null);
  }

  /**
   * Check for Telegram OAuth callback in URL (for redirect flow)
   */
  checkTelegramCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const tgAuth = urlParams.get('tgAuth');

    if (tgAuth) {
      try {
        const userData = JSON.parse(decodeURIComponent(tgAuth));
        if (userData && userData.id && userData.auth_date && userData.hash) {
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);

          const user: TelegramUser = {
            id: userData.id,
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            username: userData.username || '',
            photo_url: userData.photo_url || '',
            auth_date: userData.auth_date,
            hash: userData.hash
          };
          this.setUser(user);
          this.setError(null);
        }
      } catch (e) {
        console.warn('Failed to parse Telegram callback:', e);
      }
    }
  }

  setUser(user: TelegramUser): void {
    localStorage.setItem('telegram_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
  }

  getUser(): TelegramUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('telegram_user');
    this.userSubject.next(null);
    this.errorSubject.next(null);
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

  getBotId(): string {
    return this.BOT_ID;
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
