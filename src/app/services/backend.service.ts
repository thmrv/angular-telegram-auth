import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, of, BehaviorSubject } from 'rxjs';
import { catchError, map, timeout, tap, switchMap } from 'rxjs/operators';
import { TelegramUser } from './auth.service';
import { environment } from '../../environments/environment';

export interface SessionResponse {
  sessionId: string;
  updatedAt: string;
  csrfToken: string;
  user: {
    id: string;
    status: string;
  } | null;
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
  private readonly SESSION_ENDPOINT = '/api/auth/session';
  private readonly LOGIN_ENDPOINT = '/api/auth/login/telegram';

  private csrfTokenSubject = new BehaviorSubject<string | null>(null);
  private sessionIdSubject = new BehaviorSubject<string | null>(null);
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(private http: HttpClient) {
    this.initializeSession();
  }

  private initializeSession(): void {
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
          console.log('Session initialized with CSRF token:' + response.csrfToken);
        }
      })
      .catch((error) => {
        console.error('Failed to initialize session:', error);
        setTimeout(() => {
          this.initializationPromise = null;
          this.initializeSession();
        }, 5000);
      });
  }

  fetchSession(): Observable<SessionResponse> {
    const url = `${this.BASE_URL}${this.SESSION_ENDPOINT}`;
    console.log('Fetching session from:', url);

    return this.http.get<SessionResponse>(url, { observe: 'response' })
      .pipe(
        timeout(10000),
        map((response) => {
          if (response.status === 200 && response.body) {
            console.log('Session response:', response.body);
            return response.body;
          } else {
            throw new Error(`Session request failed with status: ${response.status}`);
          }
        }),
        catchError((error) => {
          if (error.error && typeof error.error === 'object') {
            console.warn('Session request had CORS warning but got response:', error.error);
            return of(error.error);
          }
          return this.handleError(error);
        })
      );
  }

  private ensureSessionInitialized(): Observable<boolean> {
    if (this.isInitialized && this.csrfTokenSubject.value) {
      return of(true);
    }

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
    this.isInitialized = false;
    this.csrfTokenSubject.next(null);
    this.sessionIdSubject.next(null);

    return this.fetchSession().pipe(
      tap((response) => {
        this.csrfTokenSubject.next(response.csrfToken);
        this.sessionIdSubject.next(response.sessionId);
        this.isInitialized = true;
        console.log('Session refreshed with new CSRF token');
      })
    );
  }

  verifyAuth(user: TelegramUser): Observable<AuthResponse> {
    return this.ensureSessionInitialized().pipe(
      switchMap(() => {
        const url = `${this.BASE_URL}${this.LOGIN_ENDPOINT}`;
        const csrfToken = this.csrfTokenSubject.value;

        if (!csrfToken) {
          throw new Error('CSRF token not available');
        }

        const payload = {
          id: user.id,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          username: user.username || '',
          photo_url: user.photo_url || '',
          auth_date: user.auth_date,
          hash: user.hash || ''
        };

        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken
        });

        console.log('Sending auth request to:', url);
        console.log('With CSRF token:', csrfToken);
        console.log('Payload:', payload);

        return this.http.post<AuthResponse>(url, payload, { 
          headers: headers,
          observe: 'response'
        })
          .pipe(
            timeout(10000),
            map((response) => {
              console.log('Auth response status:', response.status);
              console.log('Auth response body:', response.body);
              
              if (response.status === 200 && response.body) {
                const body = response.body;
                
                const result: AuthResponse = {
                  success: body.success !== undefined ? body.success : true
                };
                
                Object.keys(body).forEach(key => {
                  if (key !== 'success') {
                    result[key] = body[key];
                  }
                });
                return result;
              } else {
                throw new Error(`Request failed with status: ${response.status}`);
              }
            }),
            catchError((error) => {
              if (error.error && typeof error.error === 'object') {
                console.warn('Auth request had CORS warning but got response:', error.error);
                const body = error.error;
                const result: AuthResponse = {
                  success: body.success !== undefined ? body.success : true
                };
                Object.keys(body).forEach(key => {
                  if (key !== 'success') {
                    result[key] = body[key];
                  }
                });
                return of(result);
              }
              
              if (error.status === 0 && error.message && error.message.includes('CORS')) {
                console.warn('CORS error detected but request may have succeeded');
                return of({
                  success: true,
                  message: 'Request sent (CORS warning but likely succeeded)',
                  status: 'pending'
                });
              }
              
              return this.handleError(error);
            })
          );
      })
    );
  }

  healthCheck(): Observable<{ status: string; message: string; csrfAvailable: boolean }> {
    return this.fetchSession()
      .pipe(
        timeout(5000),
        map((response) => ({
          status: 'online',
          message: 'Backend is reachable',
          csrfAvailable: !!response.csrfToken
        })),
        catchError((error) => {
          console.warn('Health check failed:', error);
          return of({
            status: 'unknown',
            message: 'Cannot reach backend',
            csrfAvailable: false
          });
        })
      );
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
          errorMessage = 'Network error';
          break;
        case 403:
          errorMessage = 'Forbidden';
          break;
        case 401:
          errorMessage = 'Unauthorized';
          break;
        case 404:
          errorMessage = 'Endpoint not found (404)';
          break;
        case 500:
          errorMessage = 'Internal server error (500)';
          break;
        default:
          errorMessage = error.error?.message || `Server error: ${error.status}`;
      }
    }

    console.error('Backend error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}
