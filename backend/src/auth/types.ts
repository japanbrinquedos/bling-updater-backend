export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope?: string;
  // epoch millis
  expiresAt: number;
};

export type AuthStatus = {
  authenticated: boolean;
  expires_in?: number;
  has_refresh?: boolean;
  scope?: string;
};

export type AuthError = {
  ok: false;
  error: string | unknown;
};
