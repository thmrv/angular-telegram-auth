import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TelegramAuthService, TelegramUser } from '../services/telegram-auth.service';
import { VKAuthService, VKUser } from '../services/vk-auth.service';
import { YandexAuthService, YandexUser } from '../services/yandex-auth.service';
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
  // Telegram state
  telegramUser: TelegramUser | null = null;
  telegramIsLoading = false;
  telegramIsAuthenticated = false;
  telegramError: string | null = null;
  telegramSuccess: string | null = null;

  // VK state
  vkUser: VKUser | null = null;
  vkIsLoading = false;
  vkIsAuthenticated = false;
  vkError: string | null = null;
  vkSuccess: string | null = null;

  // Yandex state
  yandexUser: YandexUser | null = null;
  yandexIsLoading = false;
  yandexIsAuthenticated = false;
  yandexError: string | null = null;
  yandexSuccess: string | null = null;

  // Shared state
  backendOnline = false;
  backendChecked = false;
  backendResponse: any = null;
  requestDetails: any = null;
  csrfToken: string | null = null;
  sessionId: string | null = null;
  sessionReady = false;

  private subscriptions: Subscription[] = [];

  constructor(
    public telegramAuthService: TelegramAuthService,
    public vkAuthService: VKAuthService,
    public yandexAuthService: YandexAuthService,
    private backendService: BackendService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.checkBackendHealth();
    this.updateSessionStatus();

    // Telegram subscriptions using the new library
    this.subscriptions.push(
      this.telegramAuthService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.telegramUser = user;
          this.telegramIsAuthenticated = !!user;
          if (user) {
            this.telegramSuccess = 'Успешная авторизация через Telegram!';
            this.telegramIsLoading = false;
            setTimeout(() => (this.telegramSuccess = null), 5000);

            // Send auth data to backend
            this.sendTelegramAuthToBackend(user);
          }
        });
      })
    );

    this.subscriptions.push(
      this.telegramAuthService.error$.subscribe((error) => {
        this.ngZone.run(() => {
          this.telegramError = error;
          this.telegramIsLoading = false;
          setTimeout(() => (this.telegramError = null), 6000);
        });
      })
    );

    this.subscriptions.push(
      this.telegramAuthService.loading$.subscribe((loading) => {
        this.ngZone.run(() => {
          this.telegramIsLoading = loading;
        });
      })
    );

    // VK subscriptions
    this.subscriptions.push(
      this.vkAuthService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.vkUser = user;
          this.vkIsAuthenticated = !!user;
          if (user) {
            this.vkSuccess = 'Успешная авторизация через VK!';
            this.vkIsLoading = false;
            setTimeout(() => (this.vkSuccess = null), 5000);
          }
        });
      })
    );

    this.subscriptions.push(
      this.vkAuthService.error$.subscribe((error) => {
        this.ngZone.run(() => {
          this.vkError = error;
          this.vkIsLoading = false;
          setTimeout(() => (this.vkError = null), 6000);
        });
      })
    );

    this.subscriptions.push(
      this.vkAuthService.loading$.subscribe((loading) => {
        this.ngZone.run(() => {
          this.vkIsLoading = loading;
        });
      })
    );

    // Yandex subscriptions
    this.subscriptions.push(
      this.yandexAuthService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.yandexUser = user;
          this.yandexIsAuthenticated = !!user;
          if (user) {
            this.yandexSuccess = 'Успешная авторизация через Yandex!';
            this.yandexIsLoading = false;
            setTimeout(() => (this.yandexSuccess = null), 5000);
          }
        });
      })
    );

    this.subscriptions.push(
      this.yandexAuthService.error$.subscribe((error) => {
        this.ngZone.run(() => {
          this.yandexError = error;
          this.yandexIsLoading = false;
          setTimeout(() => (this.yandexError = null), 6000);
        });
      })
    );

    this.subscriptions.push(
      this.yandexAuthService.loading$.subscribe((loading) => {
        this.ngZone.run(() => {
          this.yandexIsLoading = loading;
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ==================== TELEGRAM AUTH ====================

  openTelegramPopup(): void {
    this.telegramIsLoading = true;
    this.telegramError = null;
    this.telegramSuccess = null;
    // Using the new Telegram Login library
    this.telegramAuthService.startTelegramAuth();
  }

  sendTelegramAuthToBackend(user: TelegramUser): void {
    this.ngZone.run(() => {
      this.backendResponse = null;

      const csrfToken = this.backendService.getCsrfToken();

      this.requestDetails = {
        provider: 'telegram',
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
            auth_date: user.auth_date || Math.floor(Date.now() / 1000),
            hash: user.hash || '',
            id_token: user.id_token || '',
            phone_number: user.phone_number || ''
          }
        }
      };

      this.sendAuthDataToBackend(user).then(
        (response) => {
          this.ngZone.run(() => {
            this.backendResponse = response;
            this.telegramSuccess = 'Данные авторизации отправлены в бэкенд!';
            setTimeout(() => (this.telegramSuccess = null), 5000);
          });
        },
        (err) => {
          this.ngZone.run(() => {
            if (err.response) {
              this.backendResponse = err.response;
              this.telegramSuccess = 'Запрос выполнен (с предупреждением CORS)';
              setTimeout(() => (this.telegramSuccess = null), 5000);
            } else {
              this.telegramError = err.message || 'Не удалось отправить данные авторизации в бэкенд';
            }
          });
        }
      );
    });
  }

  // ==================== VK AUTH ====================

  openVKPopup(): void {
    this.vkIsLoading = true;
    this.vkError = null;
    this.vkSuccess = null;
    this.vkAuthService.startVKAuth();
  }

  // ==================== YANDEX AUTH ====================

  openYandexPopup(): void {
    this.yandexIsLoading = true;
    this.yandexError = null;
    this.yandexSuccess = null;
    this.yandexAuthService.startYandexAuth();
  }

  // ==================== SHARED METHODS ====================

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
        this.telegramSuccess = 'Сессия обновлена с новым CSRF токеном';
        setTimeout(() => (this.telegramSuccess = null), 3000);
      },
      error: (error) => {
        this.telegramError = 'Не удалось обновить сессию: ' + error.message;
        setTimeout(() => (this.telegramError = null), 3000);
      }
    });
  }

  // ==================== GETTERS ====================

  getFormattedTelegramUserInfo(): { label: string; value: string | number }[] {
    if (!this.telegramUser) return [];
    return [
      { label: 'ID', value: this.telegramUser.id },
      { label: 'Имя', value: this.telegramUser.first_name },
      { label: 'Фамилия', value: this.telegramUser.last_name || '-' },
      { label: 'Имя пользователя', value: this.telegramUser.username || '-' },
      { label: 'Фото URL', value: this.telegramUser.photo_url || '-' },
      { label: 'Телефон', value: this.telegramUser.phone_number || '-' },
      { label: 'Дата авторизации', value: new Date((this.telegramUser.auth_date || 0) * 1000).toLocaleString('ru-RU') },
      { label: 'ID Token', value: this.telegramUser.id_token ? this.telegramUser.id_token.substring(0, 30) + '...' : '-' },
      { label: 'Access Token', value: this.telegramUser.access_token ? this.telegramUser.access_token.substring(0, 20) + '...' : '-' },
      { label: 'Хеш', value: this.telegramUser.hash || '-' },
    ];
  }

  getFormattedVKUserInfo(): { label: string; value: string | number }[] {
    if (!this.vkUser) return [];
    return [
      { label: 'ID', value: this.vkUser.id },
      { label: 'Имя', value: this.vkUser.first_name },
      { label: 'Фамилия', value: this.vkUser.last_name || '-' },
      { label: 'Фото URL', value: this.vkUser.photo || '-' },
      { label: 'Access Token', value: this.vkUser.access_token ? this.vkUser.access_token.substring(0, 20) + '...' : '-' },
      { label: 'Хеш', value: this.vkUser.hash || '-' },
    ];
  }

  getFormattedYandexUserInfo(): { label: string; value: string | number }[] {
    if (!this.yandexUser) return [];
    return [
      { label: 'ID', value: this.yandexUser.id },
      { label: 'Имя', value: this.yandexUser.first_name },
      { label: 'Фамилия', value: this.yandexUser.last_name || '-' },
      { label: 'Отображаемое имя', value: this.yandexUser.display_name || '-' },
      { label: 'Email', value: this.yandexUser.email || '-' },
      { label: 'Фото URL', value: this.yandexUser.avatar_url || '-' },
      { label: 'Хеш', value: this.yandexUser.hash || '-' },
    ];
  }

  getRequestDetails(): { label: string; value: string }[] {
    if (!this.requestDetails) return [];
    const details = [];

    if (this.requestDetails.provider) {
      details.push({
        label: 'Провайдер',
        value: this.requestDetails.provider
      });
    }

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
