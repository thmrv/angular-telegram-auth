import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  photo?: string;
  hash: string;
  access_token?: string;
  refresh_token?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VKAuthService {
  // IMPORTANT: Replace this with your actual VK App ID from https://vk.com/apps
  private readonly VK_APP_ID = 'YOUR_VK_APP_ID_HERE';
  private readonly REDIRECT_URI = window.location.origin + '/auth';
  private readonly VK_API_VERSION = '5.199';

  private userSubject = new BehaviorSubject<VKUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private accessTokenSubject = new BehaviorSubject<string | null>(null);

  user$: Observable<VKUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();
  accessToken$: Observable<string | null> = this.accessTokenSubject.asObservable();

  // PKCE storage
  private codeVerifier: string | null = null;
  private state: string | null = null;
  private deviceId: string | null = null;

  constructor() {
    const savedUser = localStorage.getItem('vk_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
          if (user.access_token) {
            this.accessTokenSubject.next(user.access_token);
          }
        } else {
          localStorage.removeItem('vk_user');
        }
      } catch (e) {
        localStorage.removeItem('vk_user');
      }
    }

    // Check for VK auth callback
    this.checkVKCallback();
  }

  /**
   * Generate PKCE code verifier (43-128 characters)
   */
  private generateCodeVerifier(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const length = 64; // Recommended length
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
   * Start VK OAuth flow with PKCE
   */
  async startVKAuth(): Promise<void> {
    try {
      this.setLoading(true);
      this.setError(null);

      // Generate PKCE parameters
      this.codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
      this.state = this.generateState();
      
      // Store state for validation
      localStorage.setItem('vk_auth_state', this.state);
      localStorage.setItem('vk_code_verifier', this.codeVerifier);

      // Build VK OAuth URL with PKCE parameters
      const redirectUri = encodeURIComponent(this.REDIRECT_URI);
      const url = `https://id.vk.com/authorize?` +
        `response_type=code` +
        `&client_id=${this.VK_APP_ID}` +
        `&redirect_uri=${redirectUri}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256` +
        `&state=${this.state}` +
        `&scope=vkid.personal_info` +
        `&v=${this.VK_API_VERSION}`;

      console.log('VK Auth URL:', url);

      // Open popup
      const width = 600;
      const height = 500;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        url,
        'VKAuth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        this.setError('Popup blocked. Please allow popups for this site.');
        this.setLoading(false);
        return;
      }

      // Listen for VK callback via postMessage
      const vkMessageListener = (event: MessageEvent) => {
        // VK sends messages from their domain
        if (event.origin === 'https://id.vk.com' || 
            event.origin === 'https://oauth.vk.com' || 
            event.origin === 'https://vk.com') {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            
            // Handle VK ID SDK callback
            if (data && data.type === 'auth' && data.payload) {
              const payload = data.payload;
              
              // Validate state
              const savedState = localStorage.getItem('vk_auth_state');
              if (payload.state !== savedState) {
                this.setError('Security validation failed. Invalid state parameter.');
                this.setLoading(false);
                return;
              }

              // Check for authorization code
              if (payload.code) {
                this.deviceId = payload.device_id || null;
                this.exchangeCodeForToken(payload.code, payload.device_id);
              } else if (payload.error) {
                this.setError(payload.error_description || 'VK authorization failed');
                this.setLoading(false);
              }
            }
          } catch (e) {
            console.warn('Failed to parse VK message:', e);
          }
        }
      };

      window.addEventListener('message', vkMessageListener);

      // Check if popup closed
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          window.removeEventListener('message', vkMessageListener);
          if (!this.userSubject.value) {
            this.setError('Authorization cancelled or timed out.');
            this.setLoading(false);
          }
          localStorage.removeItem('vk_auth_state');
          localStorage.removeItem('vk_code_verifier');
        }
      }, 500);

    } catch (error) {
      console.error('VK auth error:', error);
      this.setError('Failed to initialize VK authentication');
      this.setLoading(false);
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForToken(code: string, deviceId: string | null): Promise<void> {
    try {
      const verifier = localStorage.getItem('vk_code_verifier');
      
      if (!verifier) {
        this.setError('Code verifier not found. Please try again.');
        this.setLoading(false);
        return;
      }

      // Build the token exchange request
      const params = new URLSearchParams({
        client_id: this.VK_APP_ID,
        grant_type: 'authorization_code',
        code: code,
        code_verifier: verifier,
        redirect_uri: this.REDIRECT_URI
      });

      if (deviceId) {
        params.append('device_id', deviceId);
      }

      const response = await fetch('https://id.vk.com/oauth2/auth', {
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
      console.log('VK token response:', data);

      if (data.access_token) {
        // Store tokens
        this.accessTokenSubject.next(data.access_token);
        
        // Fetch user info
        await this.fetchVKUserInfo(data.access_token);
        
        // Store refresh token if provided
        if (data.refresh_token) {
          const currentUser = this.userSubject.value;
          if (currentUser) {
            currentUser.refresh_token = data.refresh_token;
            localStorage.setItem('vk_user', JSON.stringify(currentUser));
          }
        }
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
   * Fetch VK user info using access token
   */
  private async fetchVKUserInfo(accessToken: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.vk.com/method/users.get?access_token=${accessToken}&v=${this.VK_API_VERSION}&fields=photo_200`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.error_msg || 'VK API error');
      }

      const userData = data.response[0];
      if (userData) {
        const user: VKUser = {
          id: userData.id,
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          photo: userData.photo_200 || '',
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

  /**
   * Check for VK OAuth callback in URL
   */
  checkVKCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const deviceId = urlParams.get('device_id');

    if (code && state) {
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Validate state
      const savedState = localStorage.getItem('vk_auth_state');
      if (state === savedState) {
        this.exchangeCodeForToken(code, deviceId);
      } else {
        this.setError('Security validation failed. Invalid state parameter.');
      }
    }
  }

  setUser(user: VKUser): void {
    localStorage.setItem('vk_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
    if (user.access_token) {
      this.accessTokenSubject.next(user.access_token);
    }
  }

  getUser(): VKUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('vk_user');
    localStorage.removeItem('vk_auth_state');
    localStorage.removeItem('vk_code_verifier');
    this.userSubject.next(null);
    this.errorSubject.next(null);
    this.accessTokenSubject.next(null);
    this.codeVerifier = null;
    this.state = null;
    this.deviceId = null;
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

  getVKAppId(): string {
    return this.VK_APP_ID;
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value && !!this.accessTokenSubject.value;
  }

  getAccessToken(): string | null {
    return this.accessTokenSubject.value;
  }
}
