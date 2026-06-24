import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, of, BehaviorSubject } from 'rxjs';
import { catchError, map, timeout, tap, switchMap, filter, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type AuthProvider = 'TELEGRAM' | 'VKONTAKTE' | 'YANDEX';

export interface SessionResponse {
  sessionId: string;
  updatedAt: string;
  csrfToken: string;
  user: {
    id: string;
    status: string;
  } | null;
}

export interface AuthLoginRequest {
  provider: AuthProvider;
  token: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  private readonly BASE_URL = environment.backendUrl;
  private readonly SESSION_ENDPOINT = environment.sessionEndpoint;
  private readonly LOGIN_ENDPOINT = environment.loginEndpoint;
  private readonly USE_PROXY = environment.useProxy;

  private csrfTokenSubject = new BehaviorSubject<string | null>(null);
  private sessionIdSubject = new BehaviorSubject<string | null>(null);
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private initializationAttempted = false;

  constructor(private http: HttpClient) {
    this.initializeSession();
  }

  private getFullUrl(endpoint: string): string {
    if (this.USE_PROXY) {
      return endpoint;
    }
    return `${this.BASE_URL}${endpoint}`;
  }

  private initializeSession(): void {
    if (this.initializationAttempted) {
      return;
    }
    this.initializationAttempted = true;

    if (this.initializationPromise) {
      return;
    }

    this.initializationPromise = this.fetchSession()
      .toPromise()
      .then((response) => {
        if (response) {
          this.csrfTokenSubject.next(response.csrfToken);
          this.sessionIdSubject.next(response.sessionId);
          this.isInitialized = true;
          console.log('Session initialized with CSRF token');
        }
      })
      .catch((error) => {
        console.error('Failed to initialize session:', error);
        // Retry after delay, but only once
        setTimeout(() => {
          this.initializationAttempted = false;
          this.initializationPromise = null;
          this.initializeSession();
        }, 5000);
      });
  }

  fetchSession(): Observable<SessionResponse> {
    const url = this.getFullUrl(this.SESSION_ENDPOINT);
    console.log('Fetching session from:', url);

    return this.http.get<SessionResponse>(url)
      .pipe(
        timeout(10000),
        tap((response) => {
          console.log('Session response:', response);
        }),
        catchError((error) => {
          console.error('Session fetch error:', error);
          return this.handleError(error);
        })
      );
  }

  private ensureSessionInitialized(): Observable<boolean> {
    if (this.isInitialized && this.csrfTokenSubject.value) {
      return of(true);
    }

    // Wait for initialization to complete
    return new Observable<boolean>((observer) => {
      const checkInterval = setInterval(() => {
        if (this.isInitialized && this.csrfTokenSubject.value) {
          clearInterval(checkInterval);
          observer.next(true);
          observer.complete();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        observer.error(new Error('Session initialization timeout'));
      }, 10000);
    });
  }

  getCsrfToken(): string | null {
    return this.csrfTokenSubject.value;
  }

  getSessionId(): string | null {
    return this.sessionIdSubject.value;
  }

  refreshSession(): Observable<SessionResponse> {
    // Reset state and fetch a new session
    this.isInitialized = false;
    this.csrfTokenSubject.next(null);
    this.sessionIdSubject.next(null);
    this.initializationAttempted = false;
    this.initializationPromise = null;

    return this.fetchSession().pipe(
      tap((response) => {
        this.csrfTokenSubject.next(response.csrfToken);
        this.sessionIdSubject.next(response.sessionId);
        this.isInitialized = true;
        console.log('Session refreshed with new CSRF token');
      })
    );
  }

  /**
   * Unified authentication method for all providers
   * Sends request in the format:
   * POST /api/auth/login
   * { "provider": "TELEGRAM|VKONTAKTE|YANDEX", "token": "..." }
   * with X-CSRF-TOKEN header
   */
  authenticate(provider: AuthProvider, token: string): Observable<AuthResponse> {
    return this.ensureSessionInitialized().pipe(
      switchMap(() => {
        const url = this.getFullUrl(this.LOGIN_ENDPOINT);
        // Always read the latest token from the subject just before sending
        const csrfToken = this.csrfTokenSubject.value;

        if (!csrfToken) {
          throw new Error('CSRF token not available');
        }

        const payload: AuthLoginRequest = {
          provider: provider,
          token: token
        };

        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken
        });

        console.log(`Authenticating with ${provider} provider`);
        console.log('Request URL:', url);
        console.log('Using CSRF token:', csrfToken);
        console.log('Payload:', payload);

        return this.http.post<AuthResponse>(url, payload, { headers })
          .pipe(
            timeout(10000),
            map((response) => {
              console.log('Auth response:', response);
              const result: AuthResponse = {
                success: response.success !== undefined ? response.success : true
              };
              Object.keys(response).forEach(key => {
                if (key !== 'success') {
                  result[key] = response[key];
                }
              });
              return result;
            }),
            catchError((error) => {
              // If CSRF token is invalid, refresh and retry once
              if (error.status === 403 || error.status === 401) {
                console.warn('CSRF token may be invalid, refreshing...');
                return this.refreshSession().pipe(
                  switchMap(() => {
                    const newCsrfToken = this.csrfTokenSubject.value;
                    const newHeaders = new HttpHeaders({
                      'Content-Type': 'application/json',
                      'X-CSRF-TOKEN': newCsrfToken || ''
                    });

                    console.log('Retrying with new CSRF token:', newCsrfToken);

                    return this.http.post<AuthResponse>(url, payload, { headers: newHeaders })
                      .pipe(
                        timeout(10000),
                        map((retryResponse) => {
                          const result: AuthResponse = {
                            success: retryResponse.success !== undefined ? retryResponse.success : true
                          };
                          Object.keys(retryResponse).forEach(key => {
                            if (key !== 'success') {
                              result[key] = retryResponse[key];
                            }
                          });
                          return result;
                        }),
                        catchError(this.handleError)
                      );
                  })
                );
              }
              return this.handleError(error);
            })
          );
      })
    );
  }

  /**
   * Convenience method for Telegram authentication
   */
  authenticateTelegram(idToken: string): Observable<AuthResponse> {
    return this.authenticate('TELEGRAM', idToken);
  }

  /**
   * Convenience method for VK authentication
   */
  authenticateVK(accessToken: string): Observable<AuthResponse> {
    return this.authenticate('VKONTAKTE', accessToken);
  }

  /**
   * Convenience method for Yandex authentication
   */
  authenticateYandex(token: string): Observable<AuthResponse> {
    return this.authenticate('YANDEX', token);
  }

  /**
   * Health check – uses existing session state if available,
   * does NOT fetch a new session to avoid duplicates.
   */
  healthCheck(): Observable<{ status: string; message: string; csrfAvailable: boolean }> {
    // If we already have a valid session, return that info immediately
    if (this.isInitialized && this.csrfTokenSubject.value) {
      return of({
        status: 'online',
        message: 'Backend is reachable (session active)',
        csrfAvailable: true
      });
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return new Observable((observer) => {
        this.initializationPromise?.then(() => {
          observer.next({
            status: 'online',
            message: 'Backend is reachable (session initialized)',
            csrfAvailable: !!this.csrfTokenSubject.value
          });
          observer.complete();
        }).catch(() => {
          observer.next({
            status: 'unknown',
            message: 'Cannot reach backend',
            csrfAvailable: false
          });
          observer.complete();
        });
      });
    }

    // No session, try to fetch one (only if not attempted yet)
    if (!this.initializationAttempted) {
      this.initializeSession();
      return this.healthCheck(); // recurse to check again
    }

    // Fallback: return unknown
    return of({
      status: 'unknown',
      message: 'Cannot reach backend',
      csrfAvailable: false
    });
  }

  isSessionReady(): boolean {
    return this.isInitialized && !!this.csrfTokenSubject.value;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Network error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:
          errorMessage = 'Network error - CORS or connection issue';
          break;
        case 403:
          errorMessage = 'Forbidden - Invalid CSRF token or session expired';
          break;
        case 401:
          errorMessage = 'Unauthorized - Session invalid';
          break;
        case 404:
          errorMessage = 'Endpoint not found (404) - The API path may be incorrect';
          break;
        case 500:
          errorMessage = 'Internal server error (500) - Backend issue';
          break;
        default:
          errorMessage = error.error?.message || `Server error: ${error.status}`;
      }
    }

    console.error('Backend error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}
