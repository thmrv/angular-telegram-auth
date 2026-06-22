import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  photo?: string;
  hash: string;
}

@Injectable({
  providedIn: 'root',
})
export class VKAuthService {
  private readonly VK_APP_ID = '54647196';
  private readonly VK_API_VERSION = '5.131';
  private readonly REDIRECT_URI = window.location.origin + '/auth';

  private userSubject = new BehaviorSubject<VKUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  user$: Observable<VKUser | null> = this.userSubject.asObservable();
  loading$: Observable<boolean> = this.loadingSubject.asObservable();
  error$: Observable<string | null> = this.errorSubject.asObservable();

  constructor() {
    const savedUser = localStorage.getItem('vk_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user && user.id) {
          this.userSubject.next(user);
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

  checkVKCallback(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = urlParams.get('hash');
    const userId = urlParams.get('user_id');

    if (hash && userId) {
      const user: VKUser = {
        id: parseInt(userId, 10),
        first_name: urlParams.get('first_name') || '',
        last_name: urlParams.get('last_name') || '',
        photo: urlParams.get('photo') || '',
        hash: hash
      };
      this.setUser(user);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  setUser(user: VKUser): void {
    localStorage.setItem('vk_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
  }

  getUser(): VKUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('vk_user');
    this.userSubject.next(null);
    this.errorSubject.next(null);
  }

  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  setError(error: string | null): void {
    this.errorSubject.next(error);
  }

  getVKAppId(): string {
    return this.VK_APP_ID;
  }

  getVKAuthUrl(): string {
    const redirectUri = encodeURIComponent(this.REDIRECT_URI);
    return `https://oauth.vk.com/authorize?client_id=${this.VK_APP_ID}&display=popup&redirect_uri=${redirectUri}&scope=email&response_type=token&v=${this.VK_API_VERSION}&state=123456`;
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
