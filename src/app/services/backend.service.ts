import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TelegramAuthService, TelegramUser } from '../services/telegram-auth.service';
import { VKAuthService, VKUser } from '../services/vk-auth.service';
import { YandexAuthService, YandexUser } from '../services/yandex-auth.service';
import { BackendService, AuthResponse } from '../services/backend.service';
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
  backendResponse: AuthResponse | null = null;
  requestDetails: any = null;
  csrfToken: string | null = null;
  sessionId: string | null = null;
  sessionReady = false;

  // Resend button state
  resendAvailable = false;
  resendIsLoading = false;
  resendError: string | null = null;
  resendSuccess: string | null = null;

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

    // Telegram subscriptions
    this.subscriptions.push(
      this.telegramAuthService.user$.subscribe((user) => {
        this.ngZone.run(() => {
          this.telegramUser = user;
          this.telegramIsAuthenticated = !!user;
          if (user) {
            this.telegramSuccess = 'Успешная авторизация через Telegram!';
            this.telegramIsLoading = false;
            setTimeout(() => (this.telegramSuccess = null), 5000);

            if (user.id_token) {
              this.sendTelegramAuthToBackend(user.id_token);
            }
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

            if (user.access_token) {
              this.sendVKAuthToBackend(user.access_token);
            }
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

            if (user.hash) {
              this.sendYandexAuthToBackend(user.hash);
            }
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
    this.backendResponse = null;
    this.resendAvailable = false;
    this.telegramAuthService.startTelegramAuth();
  }

  sendTelegramAuthToBackend(idToken: string): void {
    this.ngZone.run(() => {
      this.backendResponse = null;
      this.buildRequestDetails('TELEGRAM', idToken);
      this.backendService.authenticateTelegram(idToken).subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.backendResponse = response;
            this.telegramSuccess = 'Данные авторизации отправлены в бэкенд!';
            this.resendAvailable = true;
            setTimeout(() => (this.telegramSuccess = null), 5000);
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.telegramError = err.message || 'Не удалось отправить данные авторизации в бэкенд';
            this.resendAvailable = true;
          });
        }
      });
    });
  }

  // ==================== VK AUTH ====================

  openVKPopup(): void {
    this.vkIsLoading = true;
    this.vkError = null;
    this.vkSuccess = null;
    this.backendResponse = null;
    this.resendAvailable = false;
    this.vkAuthService.startVKAuth();
  }

  sendVKAuthToBackend(accessToken: string): void {
    this.ngZone.run(() => {
      this.backendResponse = null;
      this.buildRequestDetails('VKONTAKTE', accessToken);
      this.backendService.authenticateVK(accessToken).subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.backendResponse = response;
            this.vkSuccess = 'Данные авторизации отправлены в бэкенд!';
            this.resendAvailable = true;
            setTimeout(() => (this.vkSuccess = null), 5000);
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.vkError = err.message || 'Не удалось отправить данные авторизации в бэкенд';
            this.resendAvailable = true;
          });
        }
      });
    });
  }

  // ==================== YANDEX AUTH ====================

  openYandexPopup(): void {
    this.yandexIsLoading = true;
    this.yandexError = null;
    this.yandexSuccess = null;
    this.backendResponse = null;
    this.resendAvailable = false;
    this.yandexAuthService.startYandexAuth();
  }

  sendYandexAuthToBackend(token: string): void {
    this.ngZone.run(() => {
      this.backendResponse = null;
      this.buildRequestDetails('YANDEX', token);
      this.backendService.authenticateYandex(token).subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.backendResponse = response;
            this.yandexSuccess = 'Данные авторизации отправлены в бэкенд!';
            this.resendAvailable = true;
            setTimeout(() => (this.yandexSuccess = null), 5000);
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.yandexError = err.message || 'Не удалось отправить данные авторизации в бэкенд';
            this.resendAvailable = true;
          });
        }
      });
    });
  }

  // ==================== HELPER: Build Request Details ====================

  private buildRequestDetails(provider: AuthProvider, token: string): void {
    const csrfToken = this.backendService.getCsrfToken();
    // If token is available, show first 20 chars; otherwise show "Загрузка..."
    const displayToken = csrfToken ? csrfToken.substring(0, 20) + '...' : 'Загрузка...';

    this.requestDetails = {
      provider: provider,
      method: 'POST',
      endpoint: '/api/auth/login',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': displayToken
      },
      body: {
        provider: provider,
        token: token.substring(0, 20) + '...'
      }
    };
  }

  // ==================== RESEND AUTH ====================

  resendAuthRequest(): void {
    if (!this.resendAvailable) {
      return;
    }

    this.resendIsLoading = true;
    this.resendError = null;
    this.resendSuccess = null;
    this.backendResponse = null;

    // Update request details to show resend attempt with current CSRF token
    const csrfToken = this.backendService.getCsrfToken();
    if (this.requestDetails) {
      this.requestDetails = {
        ...this.requestDetails,
        resend: true,
        timestamp: new Date().toISOString(),
        headers: {
          ...this.requestDetails.headers,
          'X-CSRF-TOKEN': csrfToken ? csrfToken.substring(0, 20) + '...' : 'Загрузка...'
        }
      };
    }

    this.backendService.resendLastAuth().subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          this.resendIsLoading = false;
          this.backendResponse = response;
          this.resendSuccess = 'Запрос успешно повторно отправлен!';
          setTimeout(() => (this.resendSuccess = null), 5000);
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.resendIsLoading = false;
          this.resendError = err.message || 'Не удалось повторно отправить запрос';
          setTimeout(() => (this.resendError = null), 5000);
        });
      }
    });
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
        this.ngZone.run(() => {
          this.csrfToken = response.csrfToken;
          this.sessionId = response.sessionId;
          this.sessionReady = true;
          this.telegramSuccess = 'Сессия обновлена с новым CSRF токеном';
          this.resendAvailable = false; // disable resend until new auth
          // Update request details if they exist to show new token
          if (this.requestDetails) {
            this.requestDetails = {
              ...this.requestDetails,
              headers: {
                ...this.requestDetails.headers,
                'X-CSRF-TOKEN': response.csrfToken ? response.csrfToken.substring(0, 20) + '...' : 'Загрузка...'
              }
            };
          }
          setTimeout(() => (this.telegramSuccess = null), 3000);
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          this.telegramError = 'Не удалось обновить сессию: ' + error.message;
          setTimeout(() => (this.telegramError = null), 3000);
        });
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

    details.push({
      label: 'Провайдер',
      value: this.requestDetails.provider
    });

    details.push({
      label: 'Метод',
      value: this.requestDetails.method
    });

    details.push({
      label: 'Endpoint',
      value: this.requestDetails.endpoint
    });

    details.push({
      label: 'Заголовки',
      value: JSON.stringify(this.requestDetails.headers, null, 2)
    });

    details.push({
      label: 'Тело запроса',
      value: JSON.stringify(this.requestDetails.body, null, 2)
    });

    if (this.requestDetails.resend) {
      details.push({
        label: 'Повторная отправка',
        value: 'Да'
      });
      details.push({
        label: 'Время повторной отправки',
        value: this.requestDetails.timestamp || ''
      });
    }

    return details;
  }
}
