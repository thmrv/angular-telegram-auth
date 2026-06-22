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
  // IMPORTANT: Replace this with your actual VK App ID from https://vk.com/apps
  private readonly VK_APP_ID = '54647196';

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

  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }
}
