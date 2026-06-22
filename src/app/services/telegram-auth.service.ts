import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  access_token?: string;
  refresh_token?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TelegramAuthService {
  // IMPORTANT: Replace this with your actual bot ID from @BotFather
  private readonly BOT_ID = '8728240009';
  private readonly REDIRECT_URI = window.location.origin + '/auth';
  private readonly AUTH_URL = 'https://oauth.telegram.org/auth';
  private readonly TOKEN_URL = 'https://oauth.telegram.org/token';

  private userSubject = new BehaviorSubject<TelegramUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private accessTokenSubject = new BehaviorSubject<string | null>(null);

  user$: Observable<TelegramUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  accessToken$: Observable<string | null> = this.accessTokenSubject.asObservable();

  // PKCE storage
  private codeVerifier: string | null = null;
  private state: string | null = null;

  constructor() {
    const savedUser = localStorage.getItem('telegram_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
          if (user.access_token) {
            this.accessTokenSubject.next(user.access_token);
          }
        } else {
          localStorage.removeItem('telegram_user');
        }
      } catch (e) {
        localStorage.removeItem('telegram_user');
      }
    }

    // Check for Telegram OAuth callback
    this.checkTelegramCallback();
  }

  /**
   * Generate PKCE code verifier (43-128 characters)
   */
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

  /**
   * Generate PKCE code challenge from verifier using SHA-256
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Generate random state string
   */
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

  /**
   * Start Telegram OAuth flow with PKCE
   */
  async startTelegramAuth(): Promise<void> {
    try {
      this.setLoading(true);
      this.setError(null);

      // Generate PKCE parameters
      this.codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
      this.state = this.generateState();

      // Store for callback validation
      localStorage.setItem('telegram_code_verifier', this.codeVerifier);
      localStorage.setItem('telegram_state', this.state);

      // Build the proper OAuth URL
      const redirectUri = encodeURIComponent(this.REDIRECT_URI);
      const url = `${this.AUTH_URL}?` +
        `client_id=${this.BOT_ID}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code` +
        `&scope=openid%20profile%20phone` +
        `&state=${this.state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

      console.log('Telegram Auth URL:', url);

      // Open popup
      const width = 600;
      const height = 600;
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

      // Check if popup closed
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          if (!this.userSubject.value) {
            this.setError('Authorization cancelled or timed out.');
            this.setLoading(false);
          }
          localStorage.removeItem('telegram_state');
          localStorage.removeItem('telegram_code_verifier');
        }
      }, 500);

    } catch (error) {
      console.error('Telegram auth error:', error);
      this.setError('Failed to initialize Telegram authentication');
      this.setLoading(false);
    }
  }

  /**
   * Check for Telegram OAuth callback in URL
   */
  checkTelegramCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Validate state
      const savedState = localStorage.getItem('telegram_state');
      if (state === savedState) {
        this.exchangeCodeForToken(code);
      } else {
        this.setError('Security validation failed. Invalid state parameter.');
      }
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForToken(code: string): Promise<void> {
    try {
      const verifier = localStorage.getItem('telegram_code_verifier');

      if (!verifier) {
        this.setError('Code verifier not found. Please try again.');
        this.setLoading(false);
        return;
      }

      // Build token exchange request
      const params = new URLSearchParams({
        client_id: this.BOT_ID,
        grant_type: 'authorization_code',
        code: code,
        code_verifier: verifier,
        redirect_uri: this.REDIRECT_URI
      });

      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Telegram token response:', data);

      if (data.access_token) {
        // Store tokens
        this.accessTokenSubject.next(data.access_token);

        // Fetch user info from the token
        await this.fetchTelegramUserInfo(data.access_token);

        // Store refresh token if provided
        if (data.refresh_token) {
          const currentUser = this.userSubject.value;
          if (currentUser) {
            currentUser.refresh_token = data.refresh_token;
            localStorage.setItem('telegram_user', JSON.stringify(currentUser));
          }
        }

        // Clean up
        localStorage.removeItem('telegram_state');
        localStorage.removeItem('telegram_code_verifier');
        this.setLoading(false);
      } else {
        throw new Error(data.error_description || 'Failed to get access token');
      }
    } catch (error: any) {
      console.error('Token exchange error:', error);
      this.setError(error.message || 'Failed to exchange authorization code');
      this.setLoading(false);
    }
  }

  /**
   * Fetch Telegram user info using access token
   */
  private async fetchTelegramUserInfo(accessToken: string): Promise<void> {
    try {
      // Decode the ID token to get user info
      // The ID token is a JWT that contains user information
      const response = await fetch('https://oauth.telegram.org/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userData = await response.json();
      console.log('Telegram user info:', userData);

      if (userData.id) {
        const user: TelegramUser = {
          id: userData.id,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          username: userData.username || '',
          photo_url: userData.photo_url || '',
          auth_date: Math.floor(Date.now() / 1000),
          hash: accessToken.substring(0, 10),
          access_token: accessToken
        };

        this.setUser(user);
        this.setLoading(false);
        this.setError(null);
      }
    } catch (error: any) {
      console.error('Fetch user info error:', error);
      this.setError(error.message || 'Failed to fetch user information');
      this.setLoading(false);
    }
  }

  setUser(user: TelegramUser): void {
    localStorage.setItem('telegram_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
    if (user.access_token) {
      this.accessTokenSubject.next(user.access_token);
    }
  }

  getUser(): TelegramUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('telegram_user');
    localStorage.removeItem('telegram_state');
    localStorage.removeItem('telegram_code_verifier');
    this.userSubject.next(null);
    this.errorSubject.next(null);
    this.accessTokenSubject.next(null);
    this.codeVerifier = null;
    this.state = null;
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
    return !!this.userSubject.value && !!this.accessTokenSubject.value;
  }

  getAccessToken(): string | null {
    return this.accessTokenSubject.value;
  }
}
