import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, TelegramUser } from '../services/auth.service';
import { BackendService } from '../services/backend.service';
import { Subscription } from 'rxjs';

declare global {
  interface Window {
    onTelegramAuth: (user: TelegramUser) => void;
    Telegram: {
      Login: {
        auth: (options: {
          bot_id: string;
          request_access?: string;
          lang?: string;
          onAuth: (user: TelegramUser) => void;
        }) => void;
      };
    };
  }
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
})
export class AuthComponent implements OnInit, OnDestroy {
  user: TelegramUser | null = null;
  isLoading = false;
  isAuthenticated = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  backendOnline = false;
  backendChecked = false;
  backendResponse: any = null;
  requestDetails: any = null;
  csrfToken: string | null = null;
  sessionId: string | null = null;
  sessionReady = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private backendService: BackendService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.checkBackendHealth();

    // Check session status periodically
    this.updateSessionStatus();

    this.subscriptions.push(
      this.authService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.user = user;
          this.isAuthenticated = !!user;
          if (user) {
            this.successMessage = 'Successfully authenticated with Telegram!';
            setTimeout(() => (this.successMessage = null), 5000);
          }
        });
      })
    );

    this.subscriptions.push(
      this.authService.error$.subscribe((error) => {
        this.ngZone.run(() => {
          this.errorMessage = error;
          this.isLoading = false;
          setTimeout(() => (this.errorMessage = null), 6000);
        });
      })
    );

    this.subscriptions.push(
      this.authService.loading$.subscribe((loading) => {
        this.ngZone.run(() => {
          this.isLoading = loading;
        });
      })
    );

    this.initTelegramWidget();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    if (window.onTelegramAuth) {
      window.onTelegramAuth = () => {};
    }
  }

  updateSessionStatus(): void {
    this.csrfToken = this.backendService.getCsrfToken();
    this.sessionId = this.backendService.getSessionId();
    this.sessionReady = this.backendService.isSessionReady();

    // Update periodically
    setInterval(() => {
      this.ngZone.run(() => {
        this.csrfToken = this.backendService.getCsrfToken();
        this.sessionId = this.backendService.getSessionId();
        this.sessionReady = this.backendService.isSessionReady();
      });
    }, 5000);
  }

  initTelegramWidget(): void {
    const botId = this.authService.getBotId();

    if (window.Telegram && window.Telegram.Login) {
      window.Telegram.Login.auth({
        bot_id: botId,
        request_access: 'write',
        lang: 'en',
        onAuth: (user: TelegramUser) => this.handleAuth(user),
      });
    } else {
      console.warn('Telegram Login widget not loaded yet, waiting...');
      const checkWidget = setInterval(() => {
        if (window.Telegram && window.Telegram.Login) {
          clearInterval(checkWidget);
          window.Telegram.Login.auth({
            bot_id: botId,
            request_access: 'write',
            lang: 'en',
            onAuth: (user: TelegramUser) => this.handleAuth(user),
          });
        }
      }, 500);

      setTimeout(() => clearInterval(checkWidget), 10000);
    }

    window.onTelegramAuth = (user: TelegramUser) => {
      this.ngZone.run(() => this.handleAuth(user));
    };
  }

  handleAuth(user: TelegramUser): void {
    this.ngZone.run(() => {
      this.isLoading = true;
      this.errorMessage = null;
      this.successMessage = null;
      this.backendResponse = null;

      this.authService.setUser(user);

      const csrfToken = this.backendService.getCsrfToken();

      this.requestDetails = {
        session: {
          sessionId: this.backendService.getSessionId(),
          csrfToken: csrfToken,
          ready: this.backendService.isSessionReady()
        },
        request: {
          url: 'https://luckystack.redpillvps.pro/api/auth/login/telegram',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken || 'NOT_AVAILABLE'
          },
          body: {
            id: user.id,
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            username: user.username || '',
            photo_url: user.photo_url || '',
            auth_date: user.auth_date,
            hash: user.hash || ''
          }
        }
      };

      this.sendAuthDataToBackend(user).then(
        (response) => {
          this.ngZone.run(() => {
            this.isLoading = false;
            this.backendResponse = response;
            this.successMessage = 'Auth data sent to backend!';
            setTimeout(() => (this.successMessage = null), 5000);
          });
        },
        (err) => {
          this.ngZone.run(() => {
            this.isLoading = false;
            this.errorMessage = err.message || 'Failed to send auth data to backend';
          });
        }
      );
    });
  }

  async sendAuthDataToBackend(user: TelegramUser): Promise<any> {
    try {
      const response = await this.backendService.verifyAuth(user).toPromise();
      return response;
    } catch (error: any) {
      console.error('Backend auth error:', error);
      throw new Error(error.message || 'Backend verification failed');
    }
  }

  async checkBackendHealth(): Promise<void> {
    try {
      const response = await this.backendService.healthCheck().toPromise();
      this.backendOnline = response?.status === 'online';
      if (response?.csrfAvailable) {
        this.csrfToken = this.backendService.getCsrfToken();
        this.sessionId = this.backendService.getSessionId();
        this.sessionReady = this.backendService.isSessionReady();
      }
    } catch (error) {
      this.backendOnline = false;
    } finally {
      this.backendChecked = true;
    }
  }

  refreshSession(): void {
    this.backendService.refreshSession().subscribe({
      next: (response) => {
        this.csrfToken = response.csrfToken;
        this.sessionId = response.sessionId;
        this.sessionReady = true;
        this.successMessage = 'Session refreshed with new CSRF token';
        setTimeout(() => (this.successMessage = null), 3000);
      },
      error: (error) => {
        this.errorMessage = 'Failed to refresh session: ' + error.message;
        setTimeout(() => (this.errorMessage = null), 3000);
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.backendResponse = null;
    this.requestDetails = null;
    this.successMessage = 'Logged out successfully';
    setTimeout(() => (this.successMessage = null), 3000);
  }

  refreshAuth(): void {
    this.initTelegramWidget();
  }

  getBotId(): string {
    return this.authService.getBotId();
  }

  getFormattedUserInfo(): { label: string; value: string | number }[] {
    if (!this.user) return [];
    return [
      { label: 'ID', value: this.user.id },
      { label: 'First Name', value: this.user.first_name },
      { label: 'Last Name', value: this.user.last_name || '-' },
      { label: 'Username', value: this.user.username || '-' },
      { label: 'Auth Date', value: new Date(this.user.auth_date * 1000).toLocaleString() },
      { label: 'Hash', value: this.user.hash?.substring(0, 20) + '...' },
    ];
  }

  getRequestDetails(): { label: string; value: string }[] {
    if (!this.requestDetails) return [];
    const details = [];

    // Session info
    if (this.requestDetails.session) {
      details.push({
        label: 'Session ID',
        value: this.requestDetails.session.sessionId || 'Not available'
      });
      details.push({
        label: 'CSRF Token',
        value: this.requestDetails.session.csrfToken || 'Not available'
      });
      details.push({
        label: 'Session Ready',
        value: this.requestDetails.session.ready ? 'Yes' : 'No'
      });
    }

    // Request info
    if (this.requestDetails.request) {
      details.push({
        label: 'URL',
        value: this.requestDetails.request.url
      });
      details.push({
        label: 'Method',
        value: this.requestDetails.request.method
      });
      details.push({
        label: 'Headers',
        value: JSON.stringify(this.requestDetails.request.headers, null, 2)
      });
      details.push({
        label: 'Body',
        value: JSON.stringify(this.requestDetails.request.body, null, 2)
      });
    }

    return details;
  }
}
