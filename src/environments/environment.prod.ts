export const environment = {
  production: true,
  // On Vercel, use relative path so rewrites handle the proxy
  backendUrl: '',
  sessionEndpoint: '/api/auth/session',
  loginEndpoint: '/api/auth/login/telegram',
  useProxy: true
};
