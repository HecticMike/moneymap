/**
 * Google authorisation, using Google Identity Services directly.
 *
 * v1 went through `@react-oauth/google` with `prompt: 'consent'`, which forces
 * the full consent screen on *every* session — the single biggest reason sync
 * felt manual. GIS is driven directly here because the wrapper does not expose
 * the `prompt` control that re-use depends on.
 *
 * ## What is and is not achievable without a backend
 *
 * A browser-only app cannot hold a refresh token; that requires a client secret,
 * which cannot ship in a public bundle. So the honest ceiling is:
 *
 *   - one tap to authorise, re-using the existing grant (no consent screen
 *     after the first time)
 *   - roughly an hour of genuinely automatic sync per token
 *   - a re-tap when the token expires
 *
 * `requestAccessToken` also opens a popup, and popups outside a user gesture
 * are blocked by default. Renewal is therefore *attempted* silently and falls
 * back to a visible "reconnect" affordance rather than pretending to be
 * seamless and quietly failing. Truly invisible refresh needs the token broker.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Treat a token as dead a minute early, so it cannot expire mid-request. */
const EXPIRY_SAFETY_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    /** True when the failure is expected to clear if the user taps again. */
    readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

let scriptPromise: Promise<GoogleOAuth2> | null = null;

const loadGis = async (): Promise<GoogleOAuth2> => {
  if (scriptPromise != null) return scriptPromise;

  scriptPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const existing = window.google?.accounts?.oauth2;
    if (existing != null) {
      resolve(existing);
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2 == null) {
        reject(new AuthError('Google sign-in loaded but did not initialise.', true));
        return;
      }
      resolve(oauth2);
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new AuthError('Could not reach Google sign-in. Check your connection.', true));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
};

interface PendingRequest {
  resolve: (token: string) => void;
  reject: (error: AuthError) => void;
}

export interface AuthSnapshot {
  configured: boolean;
  /** A usable, unexpired token is held. */
  signedIn: boolean;
  /** Consent has been granted before, so renewal should not need a prompt. */
  everGranted: boolean;
  expiresAt: number | null;
  error: string | null;
}

const GRANTED_KEY = 'moneymap.google.granted';

class GoogleAuth {
  private client: TokenClient | null = null;
  private token: string | null = null;
  private expiresAt: number | null = null;
  private pending: PendingRequest | null = null;
  private error: string | null = null;
  private listeners = new Set<(snapshot: AuthSnapshot) => void>();

  readonly clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

  get configured(): boolean {
    return /^[0-9]+-[0-9a-z_-]+\.apps\.googleusercontent\.com$/i.test(this.clientId);
  }

  /**
   * Whether consent has ever been granted on this device. Only a boolean is
   * persisted — never the token itself, which stays in memory. A token in
   * localStorage is an hour-long bearer credential sitting in reach of any
   * script on the origin, for no benefit, since it expires anyway.
   */
  private get everGranted(): boolean {
    try {
      return localStorage.getItem(GRANTED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private set everGranted(value: boolean) {
    try {
      if (value) localStorage.setItem(GRANTED_KEY, '1');
      else localStorage.removeItem(GRANTED_KEY);
    } catch {
      /* Private browsing. Degrades to prompting again, which is safe. */
    }
  }

  snapshot(): AuthSnapshot {
    return {
      configured: this.configured,
      signedIn: this.validToken() != null,
      everGranted: this.everGranted,
      expiresAt: this.expiresAt,
      error: this.error
    };
  }

  subscribe(listener: (snapshot: AuthSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** The current token, or null if absent or close enough to expiry to be unsafe. */
  validToken(): string | null {
    if (this.token == null || this.expiresAt == null) return null;
    return Date.now() < this.expiresAt - EXPIRY_SAFETY_MS ? this.token : null;
  }

  private async ensureClient(): Promise<TokenClient> {
    if (this.client != null) return this.client;
    if (!this.configured) {
      throw new AuthError(
        'Google sign-in is not configured. VITE_GOOGLE_CLIENT_ID is missing or malformed.',
        false
      );
    }

    const oauth2 = await loadGis();
    this.client = oauth2.initTokenClient({
      client_id: this.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        const pending = this.pending;
        this.pending = null;

        if (response.error != null || response.access_token == null) {
          const message = response.error_description ?? response.error ?? 'Authorisation failed.';
          this.error = message;
          this.emit();
          pending?.reject(new AuthError(message, true));
          return;
        }

        this.token = response.access_token;
        this.expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        this.everGranted = true;
        this.error = null;
        this.emit();
        pending?.resolve(response.access_token);
      },
      error_callback: (failure) => {
        const pending = this.pending;
        this.pending = null;

        // popup_closed: user dismissed it. popup_failed_to_open: blocked
        // because there was no user gesture — the expected outcome of an
        // automatic renewal attempt, and not worth showing as an error.
        const blocked = failure.type === 'popup_failed_to_open';
        const message = blocked
          ? 'Google could not open its sign-in window without a tap.'
          : (failure.message ?? 'Sign-in was cancelled.');

        if (!blocked) {
          this.error = message;
          this.emit();
        }
        pending?.reject(new AuthError(message, true));
      }
    });

    return this.client;
  }

  /**
   * Get a token, reusing the cached one when it is still good.
   *
   * `interactive: false` asks Google not to prompt. It succeeds when consent
   * already exists, the Google session is live, and a popup is permitted — and
   * fails cleanly otherwise, which is the caller's cue to show a reconnect
   * button rather than to surface an error.
   */
  async getToken({ interactive }: { interactive: boolean }): Promise<string> {
    const cached = this.validToken();
    if (cached != null) return cached;

    if (!interactive && !this.everGranted) {
      throw new AuthError('Not connected to Google Drive yet.', true);
    }

    const client = await this.ensureClient();

    if (this.pending != null) {
      throw new AuthError('A sign-in request is already in progress.', true);
    }

    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
      try {
        // '' asks for no prompt where possible; 'consent' forces the full
        // screen and is reserved for an explicit reconnect after failure.
        client.requestAccessToken({ prompt: interactive && !this.everGranted ? 'consent' : '' });
      } catch (cause) {
        this.pending = null;
        reject(new AuthError(cause instanceof Error ? cause.message : 'Could not start sign-in.', true));
      }
    });
  }

  signOut(): void {
    const token = this.token;
    this.token = null;
    this.expiresAt = null;
    this.error = null;
    this.everGranted = false;

    if (token != null) {
      try {
        window.google?.accounts?.oauth2?.revoke(token);
      } catch {
        /* Revocation is best-effort; the token expires within the hour anyway. */
      }
    }
    this.emit();
  }

  /** Drop the cached token without revoking, so the next call re-acquires. */
  invalidate(): void {
    this.token = null;
    this.expiresAt = null;
    this.emit();
  }
}

export const googleAuth = new GoogleAuth();
