# Angular Telegram Auth with External Backend

This project demonstrates Telegram authentication with a third-party external backend at `https://luckystack.redpillvps.pro/api/auth/login/telegram`.

## Key Modifications

### External Backend Integration
- No local backend required - All auth requests go directly to the external API
- Exact request format as specified:
  ```python
  requests.post(
      "https://luckystack.redpillvps.pro/api/auth/login/telegram",
      headers={"Content-Type": "application/json"},
      json={
          "id": 1,
          "first_name": "",
          "last_name": "",
          "username": "",
          "photo_url": "",
          "auth_date": 1,
          "hash": ""
      }
  )
```

### Request Visibility

- Live request viewer - Shows the exact payload being sent
- Response display - Shows the backend's response (even on error)
- Network debugging - Console logs for monitoring

## Setup

1. Create Telegram Bot via @BotFather
1. Update Bot ID in `src/app/services/auth.service.ts`:

```
private readonly BOT_ID = 'YOUR_BOT_ID_HERE';
```
1. Install dependencies:

```
npm install
```
1. Run the app:

```
npm start
```

Access at [http://localhost:4200](http://localhost:4200)

## External Backend Configuration

The backend URL is configured in environment files:

- `src/environments/environment.ts` (development)
- `src/environments/environment.prod.ts` (production)

### Changing the Backend URL

Edit the `backendUrl` in the appropriate environment file:

```
export const environment = {
  production: false,
  backendUrl: 'https://luckystack.redpillvps.pro',
  apiEndpoint: '/api/auth/login/telegram',
};
```

## How It Works

1. User authenticates via Telegram - Widget returns user data
1. Frontend constructs payload - Matches the exact required format
1. Sends POST request to external backend
1. Displays request details - Shows URL, headers, and body
1. Shows backend response - Success or error details

## Troubleshooting 404 Errors

The endpoint `https://luckystack.redpillvps.pro/api/auth/login/telegram` currently returns 404, which means:

**Possible causes:**

- The endpoint path is incorrect
- The server is not running
- CORS blocking the request (check browser console)

**To test the endpoint:**

```
curl -X POST https://luckystack.redpillvps.pro/api/auth/login/telegram \
  -H "Content-Type: application/json" \
  -d '{"id":1,"first_name":"Test","last_name":"User","username":"testuser","photo_url":"","auth_date":1704067200,"hash":"testhash"}'
```

The frontend will show you the exact request being sent, making it easy to debug.

## Project Structure

```
src/
├── app/
│   ├── auth/
│   │   ├── auth.component.ts
│   │   ├── auth.component.html
│   │   └── auth.component.css
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── backend.service.ts
│   ├── app.config.ts
│   └── app.routes.ts
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
└── index.html
```

## Development Tips

- Check Network Tab - Open DevTools Network to see the actual request
- Console Logs - All requests are logged with full payload
- CORS Issues - If blocked, the backend needs to allow your origin

## License

MIT

