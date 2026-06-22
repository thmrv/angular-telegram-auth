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
  private readonly YANDEX_CLIENT_ID = '6da0a6d27d154349a3a37d14dd8ac126';
  private readonly REDIRECT_URI = window.location.origin + '/assets/yandex-callback.html';

  private userSubject = new BehaviorSubject<YandexUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

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
  }

  setUser(user: YandexUser): void {
    localStorage.setItem('yandex_user', JSON.stringify(user));
    this.userSubject.next(user);
    this.errorSubject.next(null);
  }

  getUser(): YandexUser | null {
    return this.userSubject.value;
  }

  logout(): void {
    localStorage.removeItem('yandex_user');
    this.userSubject.next(null);
    this.errorSubject.next(null);
  }

  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  setError(error: string | null): void {
    this.errorSubject.next(error);
  }

  getYandexClientId(): string {
    return this.YANDEX_CLIENT_ID;
  }

  getYandexAuthUrl(): string {
    const redirectUri = encodeURIComponent(this.REDIRECT_URI);
    return `https://oauth.yandex.ru/authorize?client_id=${this.YANDEX_CLIENT_ID}&response_type=token&display=popup&redirect_uri=${redirectUri}`;
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
