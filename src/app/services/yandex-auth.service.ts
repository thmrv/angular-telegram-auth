import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface YandexUser {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  avatar_url?: string;
  email?: string;
  hash?: string;
}

@Injectable({
  providedIn: 'root',
})
export class YandexAuthService {
  // IMPORTANT: Replace this with your actual Yandex OAuth client ID
  // Get one at https://oauth.yandex.ru/client/new
  private readonly YANDEX_CLIENT_ID = '6da0a6d27d154349a3a37d14dd8ac126';
  private readonly REDIRECT_URI = window.location.origin + '/assets/yandex-callback.html';

  private userSubject = new BehaviorSubject<YandexUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private authWindow: Window | null = null;

  user$: Observable<YandexUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();

  constructor() {
    const savedUser = localStorage.getItem('yandex_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
        } else {
          localStorage.removeItem('yandex_user');
        }
      } catch (e) {
        localStorage.removeItem('yandex_user');
      }
    }

    // Listen for Yandex callback messages
    window.addEventListener('message', this.handleYandexMessage.bind(this));
  }

  /**
   * Start Yandex OAuth flow
   */
  startYandexAuth(): void {
    this.setLoading(true);
    this.setError(null);

    const url = this.getYandexAuthUrl();
    const width = 600;
    const height = 500;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    this.authWindow = window.open(
      url,
      'YandexAuth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!this.authWindow) {
      this.setError('Popup blocked. Please allow popups for this site.');
      this.setLoading(false);
      return;
    }

    // Check if popup closed
    const checkPopup = setInterval(() => {
      if (this.authWindow && this.authWindow.closed) {
        clearInterval(checkPopup);
        if (!this.userSubject.value) {
          this.setError('Authorization cancelled or timed out.');
          this.setLoading(false);
        }
      }
    }, 500);
  }

  /**
   * Handle Yandex OAuth callback messages
   */
  private handleYandexMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) {
      return;
    }

    try {
      const data = event.data;
      if (data && data.type === 'yandex' && data.payload) {
        const payload = data.payload;
        const user: YandexUser = {
          id: payload.id,
          first_name: payload.first_name || '',
          last_name: payload.last_name || '',
          display_name: payload.display_name || '',
          avatar_url: payload.avatar_url || '',
          email: payload.email || '',
          hash: payload.hash || ''
        };
        this.setUser(user);
        this.setLoading(false);
        this.setError(null);
      } else if (data && data.error) {
        this.setError(data.error || 'Ошибка авторизации Yandex');
        this.setLoading(false);
      }
    } catch (e) {
      console.warn('Failed to parse Yandex message:', e);
    }
  }

  /**
   * Get Yandex OAuth URL
   */
  getYandexAuthUrl(): string {
    const redirectUri = encodeURIComponent(this.REDIRECT_URI);
    return `https://oauth.yandex.ru/authorize?client_id=${this.YANDEX_CLIENT_ID}&response_type=token&display=popup&redirect_uri=${redirectUri}`;
  }

  /**
   * Set user data
   */
  setUser(user: YandexUser): void {
    localStorage.setItem('yandex_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
  }

  /**
   * Get current user
   */
  getUser(): YandexUser | null {
    return this.userSubject.value;
  }

  /**
   * Logout user
   */
  logout(): void {
    localStorage.removeItem('yandex_user');
    this.userSubject.next(null);
    this.errorSubject.next(null);
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  /**
   * Set error message
   */
  setError(error: string | null): void {
    this.errorSubject.next(error);
    if (error) {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Get Yandex client ID
   */
  getYandexClientId(): string {
    return this.YANDEX_CLIENT_ID;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
