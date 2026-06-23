// environment.prod.ts
export const environment = {
  production: true,
  backendUrl: '',  // empty
  sessionEndpoint: '/api/auth/session',   // now a function path
  loginEndpoint: '/api/auth/login',       // now a function path
  useProxy: true   // we don't use the angular proxy anymore
};