import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService, TelegramUser } from '../services/auth.service';
import { BackendService } from '../services/backend.service';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
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
  botId: string = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private backendService: BackendService,
    private ngZone: NgZone,
    private sanitizer: DomSanitizer
  ) {
    this.botId = this.authService.getBotId();
  }

  ngOnInit(): void {
    this.checkBackendHealth();
    this.updateSessionStatus();

    this.subscriptions.push(
      this.authService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.user = user;
          this.isAuthenticated = !!user;
          if (user) {
            this.successMessage = 'Успешная авторизация через Telegram!';
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

    window.addEventListener('message', this.handleTelegramMessage.bind(this));
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    window.removeEventListener('message', this.handleTelegramMessage.bind(this));
  }

  handleTelegramMessage(event: MessageEvent): void {
    if (event.origin !== 'https://oauth.telegram.org') {
      return;
    }

    try {
      const data = JSON.parse(event.data);
      if (data && data.id && data.auth_date && data.hash) {
        this.ngZone.run(() => {
          const user: TelegramUser = {
            id: data.id,
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            username: data.username || '',
            photo_url: data.photo_url || '',
            auth_date: data.auth_date,
            hash: data.hash
          };
          this.handleAuth(user);
        });
      }
    } catch (e) {
      console.warn('Failed to parse Telegram widget message:', e);
    }
  }

  updateSessionStatus(): void {
    this.csrfToken = this.backendService.getCsrfToken();
    this.sessionId = this.backendService.getSessionId();
    this.sessionReady = this.backendService.isSessionReady();

    setInterval(() => {
      this.ngZone.run(() => {
        this.csrfToken = this.backendService.getCsrfToken();
        this.sessionId = this.backendService.getSessionId();
        this.sessionReady = this.backendService.isSessionReady();
      });
    }, 5000);
  }

  getTelegramWidgetUrl(): string {
    const redirectUrl = window.location.origin;
    return `https://oauth.telegram.org/embed/${this.botId}?size=large&origin=${encodeURIComponent(redirectUrl)}&request_access=write&return_to=${encodeURIComponent(redirectUrl)}`;
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
            this.successMessage = 'Данные авторизации отправлены в бэкенд!';
            setTimeout(() => (this.successMessage = null), 5000);
          });
        },
        (err) => {
          this.ngZone.run(() => {
            this.isLoading = false;
            if (err.response) {
              this.backendResponse = err.response;
              this.successMessage = 'Запрос выполнен (с предупреждением CORS)';
              setTimeout(() => (this.successMessage = null), 5000);
            } else {
              this.errorMessage = err.message || 'Не удалось отправить данные авторизации в бэкенд';
            }
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
      if (error.response) {
        throw error;
      }
      throw new Error(error.message || 'Ошибка верификации в бэкенде');
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
        this.successMessage = 'Сессия обновлена с новым CSRF токеном';
        setTimeout(() => (this.successMessage = null), 3000);
      },
      error: (error) => {
        this.errorMessage = 'Не удалось обновить сессию: ' + error.message;
        setTimeout(() => (this.errorMessage = null), 3000);
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.backendResponse = null;
    this.requestDetails = null;
    this.successMessage = 'Выход выполнен успешно';
    setTimeout(() => (this.successMessage = null), 3000);
  }

  refreshAuth(): void {
    const widgetContainer = document.getElementById('telegram-login-widget');
    if (widgetContainer) {
      const iframe = widgetContainer.querySelector('iframe');
      if (iframe) {
        iframe.src = iframe.src;
      }
    }
  }

  getBotId(): string {
    return this.authService.getBotId();
  }

  getFormattedUserInfo(): { label: string; value: string | number }[] {
    if (!this.user) return [];
    return [
      { label: 'ID', value: this.user.id },
      { label: 'Имя', value: this.user.first_name },
      { label: 'Фамилия', value: this.user.last_name || '-' },
      { label: 'Имя пользователя', value: this.user.username || '-' },
      { label: 'Фото URL', value: this.user.photo_url || '-' },
      { label: 'Дата авторизации', value: new Date(this.user.auth_date * 1000).toLocaleString('ru-RU') },
      { label: 'Хеш', value: this.user.hash || '-' },
    ];
  }

  getRequestDetails(): { label: string; value: string }[] {
    if (!this.requestDetails) return [];
    const details = [];

    if (this.requestDetails.session) {
      details.push({
        label: 'ID сессии',
        value: this.requestDetails.session.sessionId || 'Недоступно'
      });
      details.push({
        label: 'CSRF токен',
        value: this.requestDetails.session.csrfToken || 'Недоступно'
      });
      details.push({
        label: 'Сессия готова',
        value: this.requestDetails.session.ready ? 'Да' : 'Нет'
      });
    }

    if (this.requestDetails.request) {
      details.push({
        label: 'URL',
        value: this.requestDetails.request.url
      });
      details.push({
        label: 'Метод',
        value: this.requestDetails.request.method
      });
      details.push({
        label: 'Заголовки',
        value: JSON.stringify(this.requestDetails.request.headers, null, 2)
      });
      details.push({
        label: 'Тело запроса',
        value: JSON.stringify(this.requestDetails.request.body, null, 2)
      });
    }

    return details;
  }
}
