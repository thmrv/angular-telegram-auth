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
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly BOT_ID = '8728240009';

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
        const isValid = this.validateUser(user);
        if (isValid) {
          this.userSubject.next(user);
        } else {
          localStorage.removeItem('telegram_user');
        }
      } catch (e) {
        localStorage.removeItem('telegram_user');
      }
    }
  }

  setUser(user: TelegramUser): void {
    if (this.validateUser(user)) {
      localStorage.setItem('telegram_user', JSON.stringify(user));
      this.userSubject.next(user);
      this.errorSubject.next(null);
    } else {
      this.errorSubject.next('Invalid user data received');
    }
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
  }

  getBotId(): string {
    return this.BOT_ID;
  }

  private validateUser(user: TelegramUser): boolean {
    return !!(
      user &&
      user.id &&
      user.first_name &&
      user.auth_date &&
      user.hash
    );
  }

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
