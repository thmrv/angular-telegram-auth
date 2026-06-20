import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { TelegramUser } from './auth.service';
import { environment } from '../../environments/environment';

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
  private readonly API_ENDPOINT = environment.apiEndpoint;

  constructor(private http: HttpClient) {}

  verifyAuth(user: TelegramUser): Observable<AuthResponse> {
    const url = `${this.BASE_URL}${this.API_ENDPOINT}`;

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
      'Content-Type': 'application/json'
    });

    console.log('Sending auth request to:', url);
    console.log('Payload:', payload);

    return this.http.post<AuthResponse>(url, payload, { headers })
      .pipe(
        timeout(10000),
        map((response) => {
          console.log('Backend response:', response);
          return {
            ...response
          };
        }),
        catchError(this.handleError)
      );
  }

  healthCheck(): Observable<{ status: string; message: string }> {
    return this.http.options(`${this.BASE_URL}${this.API_ENDPOINT}`)
      .pipe(
        timeout(5000),
        map(() => ({
          status: 'online',
          message: 'Backend is reachable'
        })),
        catchError((error) => {
          console.warn('Health check failed:', error);
          return of({
            status: 'unknown',
            message: 'Cannot reach backend (this is expected if CORS is not configured)'
          });
        })
      );
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
