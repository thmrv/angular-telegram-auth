import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, TelegramUser } from '../services/auth.service';
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
  botId: string = '';

  private subscriptions: Subscription[] = [];
  private telegramPopup: Window | null = null;
  private vkPopup: Window | null = null;
  private yandexPopup: Window | null = null;

  constructor(
    public telegramAuthService: AuthService,
    public vkAuthService: VKAuthService,
    public yandexAuthService: YandexAuthService,
    private backendService: BackendService,
    private ngZone: NgZone
  ) {
    this.botId = this.telegramAuthService.getBotId();
  }

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
            setTimeout(() => (this.telegramSuccess = null), 5000);
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

    // Listen for messages from popups
    window.addEventListener('message', this.handlePopupMessage.bind(this));
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    window.removeEventListener('message', this.handlePopupMessage.bind(this));
    if (this.telegramPopup) this.telegramPopup.close();
    if (this.vkPopup) this.vkPopup.close();
    if (this.yandexPopup) this.yandexPopup.close();
  }

  // ==================== POPUP MESSAGE HANDLER ====================

  handlePopupMessage(event: MessageEvent): void {
    // Telegram messages
    if (event.origin === 'https://oauth.telegram.org') {
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
            this.handleTelegramAuth(user);
          });
        }
      } catch (e) {
        console.warn('Failed to parse Telegram message:', e);
      }
      return;
    }

    // VK messages
    if (event.origin === 'https://oauth.vk.com' || event.origin === 'https://vk.com') {
      try {
        const data = event.data;
        if (data && data.type === 'auth' && data.payload) {
          const payload = data.payload;
          if (payload.user_id) {
            this.ngZone.run(() => {
              const user: VKUser = {
                id: parseInt(payload.user_id, 10),
                first_name: payload.first_name || '',
                last_name: payload.last_name || '',
                photo: payload.photo || '',
                hash: payload.hash || ''
              };
              this.handleVKAuth(user);
            });
          }
        }
      } catch (e) {
        console.warn('Failed to parse VK message:', e);
      }
      return;
    }

    // Yandex messages (from our callback HTML)
    if (event.origin === window.location.origin) {
      try {
        const data = event.data;
        if (data && data.type === 'yandex' && data.payload) {
          this.ngZone.run(() => {
            const payload = data.payload;
            const user: YandexUser = {
              id: payload.id,
              first_name: payload.first_name || '',
              last_name: payload.last_name || '',
              display_name: payload.display_name || '',
              avatar_url: payload.avatar_url || '',
              email: payload.email || '',
              hash: payload.hash || ''
            };
            this.handleYandexAuth(user);
          });
        } else if (data && data.error) {
          this.ngZone.run(() => {
            this.yandexError = data.error || 'Ошибка авторизации Yandex';
            this.yandexIsLoading = false;
          });
        }
      } catch (e) {
        console.warn('Failed to parse Yandex message:', e);
      }
      return;
    }
  }

  // ==================== TELEGRAM AUTH ====================

  openTelegramPopup(): void {
    const url = this.getTelegramWidgetUrl();
    const width = 600;
    const height = 500;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    this.telegramPopup = window.open(
      url,
      'TelegramLogin',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!this.telegramPopup) {
      this.telegramError = 'Popup blocked. Please allow popups for this site.';
      return;
    }

    const checkPopup = setInterval(() => {
      if (this.telegramPopup && this.telegramPopup.closed) {
        clearInterval(checkPopup);
        if (!this.telegramIsAuthenticated) {
          this.telegramError = 'Authorization cancelled or timed out.';
          this.telegramIsLoading = false;
        }
      }
    }, 500);
  }

  getTelegramWidgetUrl(): string {
    const redirectUrl = window.location.origin;
    return `https://oauth.telegram.org/embed/${this.botId}?size=large&origin=${encodeURIComponent(redirectUrl)}&request_access=write&return_to=${encodeURIComponent(redirectUrl)}`;
  }

  handleTelegramAuth(user: TelegramUser): void {
    this.ngZone.run(() => {
      this.telegramIsLoading = true;
      this.telegramError = null;
      this.telegramSuccess = null;
      this.backendResponse = null;

      this.telegramAuthService.setUser(user);

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
            auth_date: user.auth_date,
            hash: user.hash || ''
          }
        }
      };

      this.sendAuthDataToBackend(user).then(
        (response) => {
          this.ngZone.run(() => {
            this.telegramIsLoading = false;
            this.backendResponse = response;
            this.telegramSuccess = 'Данные авторизации отправлены в бэкенд!';
            setTimeout(() => (this.telegramSuccess = null), 5000);
          });
        },
        (err) => {
          this.ngZone.run(() => {
            this.telegramIsLoading = false;
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
    const url = this.vkAuthService.getVKAuthUrl();
    const width = 600;
    const height = 500;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    this.vkPopup = window.open(
      url,
      'VKAuth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!this.vkPopup) {
      this.vkError = 'Popup blocked. Please allow popups for this site.';
      return;
    }

    const checkPopup = setInterval(() => {
      if (this.vkPopup && this.vkPopup.closed) {
        clearInterval(checkPopup);
        if (!this.vkIsAuthenticated) {
          this.vkError = 'Authorization cancelled or timed out.';
          this.vkIsLoading = false;
        }
      }
    }, 500);
  }

  handleVKAuth(user: VKUser): void {
    this.ngZone.run(() => {
      this.vkIsLoading = true;
      this.vkError = null;
      this.vkSuccess = null;

      this.vkAuthService.setUser(user);
      this.vkIsLoading = false;
      this.vkSuccess = `Авторизация через VK выполнена! Привет, ${user.first_name}!`;
      setTimeout(() => (this.vkSuccess = null), 5000);
    });
  }

  // ==================== YANDEX AUTH ====================

  openYandexPopup(): void {
    const url = this.yandexAuthService.getYandexAuthUrl();
    const width = 600;
    const height = 500;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    this.yandexPopup = window.open(
      url,
      'YandexAuth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!this.yandexPopup) {
      this.yandexError = 'Popup blocked. Please allow popups for this site.';
      return;
    }

    const checkPopup = setInterval(() => {
      if (this.yandexPopup && this.yandexPopup.closed) {
        clearInterval(checkPopup);
        if (!this.yandexIsAuthenticated) {
          this.yandexError = 'Authorization cancelled or timed out.';
          this.yandexIsLoading = false;
        }
      }
    }, 500);
  }

  handleYandexAuth(user: YandexUser): void {
    this.ngZone.run(() => {
      this.yandexIsLoading = true;
      this.yandexError = null;
      this.yandexSuccess = null;

      this.yandexAuthService.setUser(user);
      this.yandexIsLoading = false;
      this.yandexSuccess = `Авторизация через Yandex выполнена! Привет, ${user.first_name}!`;
      setTimeout(() => (this.yandexSuccess = null), 5000);
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
      { label: 'Дата авторизации', value: new Date(this.telegramUser.auth_date * 1000).toLocaleString('ru-RU') },
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
