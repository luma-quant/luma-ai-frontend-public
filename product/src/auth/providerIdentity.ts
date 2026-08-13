import type {
  IdentityProvider,
  ProviderSsoCredential,
} from './types';

const GOOGLE_GIS_SRC = 'https://accounts.google.com/gsi/client?hl=en';
const APPLE_SIGN_IN_SRC = (
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/'
  + 'appleid.auth.js'
);

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
  state?: string;
}

interface GoogleIdentityServices {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    ux_mode: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'filled_black';
      size: 'large';
      text: 'continue_with';
      shape: 'rectangular';
      logo_alignment: 'left';
      width: number;
      locale: 'en';
    },
  ): void;
}

interface AppleSignInResponse {
  authorization?: {
    code?: string;
    id_token?: string;
    state?: string;
  };
}

interface AppleIdentityServices {
  auth: {
    init(config: {
      clientId: string;
      scope: string;
      redirectURI: string;
      state: string;
      nonce: string;
      usePopup: true;
    }): void;
    signIn(): Promise<AppleSignInResponse>;
  };
}

interface IdentityWindow extends Window {
  google?: {
    accounts?: {
      id?: GoogleIdentityServices;
    };
  };
  AppleID?: AppleIdentityServices;
}

export interface ProviderRuntimeConfig {
  googleClientId: string;
  appleClientId: string;
  appleRedirectUri: string;
}

export interface ProviderAvailability {
  available: boolean;
  unavailableMessage: string | null;
}

export type ProviderAvailabilityMap = Record<
  IdentityProvider,
  ProviderAvailability
>;

export type ProviderTokenAcquirer = (
  provider: IdentityProvider,
) => Promise<ProviderSsoCredential>;

export interface GoogleButtonCallbacks {
  onCredential: (
    credential: Extract<ProviderSsoCredential, { provider: 'google' }>,
  ) => void;
  onError: (error: Error) => void;
}

export type GoogleButtonRenderer = (
  container: HTMLElement,
  callbacks: GoogleButtonCallbacks,
) => Promise<() => void>;

interface ProviderBridgeRuntime {
  window: IdentityWindow;
  document: Document;
  crypto: Pick<Crypto, 'getRandomValues'>;
}

type SdkLoader = (
  source: string,
  runtime: ProviderBridgeRuntime,
  isReady: () => boolean,
) => Promise<void>;

interface ProviderBridgeOptions {
  runtime?: ProviderBridgeRuntime;
  loadSdk?: SdkLoader;
}

const sdkLoads = new Map<string, Promise<void>>();

function browserRuntime(): ProviderBridgeRuntime {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Provider sign-in requires a browser.');
  }
  return {
    window: window as IdentityWindow,
    document,
    crypto: window.crypto,
  };
}

async function loadSdkScript(
  source: string,
  runtime: ProviderBridgeRuntime,
  isReady: () => boolean,
): Promise<void> {
  if (isReady()) return;

  const pendingLoad = sdkLoads.get(source);
  if (pendingLoad) {
    await pendingLoad;
    if (!isReady()) {
      throw new Error('The identity provider SDK did not initialize.');
    }
    return;
  }

  const load = new Promise<void>((resolve, reject) => {
    const existing = Array.from(runtime.document.scripts).find(
      (script) => script.src === source,
    );
    const script = existing ?? runtime.document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (isReady()) {
        resolve();
      } else {
        reject(new Error('The identity provider SDK did not initialize.'));
      }
    };
    const handleError = () => {
      cleanup();
      reject(new Error('The identity provider SDK could not be loaded.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.src = source;
      script.async = true;
      script.defer = true;
      script.dataset.lumaIdentitySdk = 'true';
      runtime.document.head.appendChild(script);
    }
  });

  sdkLoads.set(source, load);
  try {
    await load;
  } catch (error) {
    sdkLoads.delete(source);
    throw error;
  }
}

function normalizeEnvironmentValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readProviderRuntimeConfig(): ProviderRuntimeConfig {
  const environment = (
    import.meta as ImportMeta & { readonly env?: ImportMetaEnv }
  ).env;
  return {
    googleClientId: normalizeEnvironmentValue(
      environment?.VITE_GOOGLE_CLIENT_ID,
    ),
    appleClientId: normalizeEnvironmentValue(
      environment?.VITE_APPLE_CLIENT_ID,
    ),
    appleRedirectUri: normalizeEnvironmentValue(
      environment?.VITE_APPLE_REDIRECT_URI,
    ),
  };
}

function validAppleRedirectUri(value: string): boolean {
  try {
    const redirect = new URL(value);
    return (
      redirect.protocol === 'https:'
      && redirect.hostname.length > 0
      && redirect.hostname !== 'localhost'
      && redirect.pathname !== '/'
      && !redirect.username
      && !redirect.password
      && !redirect.search
      && !redirect.hash
    );
  } catch {
    return false;
  }
}

export function getProviderAvailability(
  config: ProviderRuntimeConfig,
): ProviderAvailabilityMap {
  const googleMissing = !config.googleClientId;
  const appleMissing: string[] = [];
  if (!config.appleClientId) appleMissing.push('web client ID');
  if (!config.appleRedirectUri) appleMissing.push('redirect URL');

  let appleMessage: string | null = null;
  if (appleMissing.length > 0) {
    appleMessage = (
      `Apple Sign-In is currently unavailable because its ${
        appleMissing.join(' and ')
      } ${appleMissing.length === 1 ? 'is' : 'are'} not configured.`
    );
  } else if (!validAppleRedirectUri(config.appleRedirectUri)) {
    appleMessage = (
      'Apple Sign-In is currently unavailable because its redirect URL is '
      + 'not a registered HTTPS callback URL.'
    );
  }

  return {
    google: {
      available: !googleMissing,
      unavailableMessage: googleMissing
        ? (
          'Google Sign-In is currently unavailable because its web client '
          + 'ID is not configured.'
        )
        : null,
    },
    apple: {
      available: appleMessage === null,
      unavailableMessage: appleMessage,
    },
  };
}

export function createSecureOAuthValue(
  cryptoApi: Pick<Crypto, 'getRandomValues'>,
): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
}

export function parseAppleSignInResponse(
  response: AppleSignInResponse,
  expectedState: string,
  nonce: string,
): ProviderSsoCredential {
  const authorization = response.authorization;
  if (
    !authorization
    || typeof authorization.state !== 'string'
    || authorization.state !== expectedState
  ) {
    throw new Error(
      'Apple Sign-In could not verify the security state. Please try again.',
    );
  }
  if (
    typeof authorization.id_token !== 'string'
    || !authorization.id_token
    || typeof authorization.code !== 'string'
    || !authorization.code
  ) {
    throw new Error(
      'Apple Sign-In returned an incomplete authorization response.',
    );
  }
  return {
    provider: 'apple',
    id_token: authorization.id_token,
    code: authorization.code,
    nonce,
  };
}

export function createProviderTokenAcquirer(
  config: ProviderRuntimeConfig,
  options: ProviderBridgeOptions = {},
): ProviderTokenAcquirer {
  const availability = getProviderAvailability(config);
  const loadSdk = options.loadSdk ?? loadSdkScript;

  const acquireApple = async (): Promise<ProviderSsoCredential> => {
    if (!availability.apple.available) {
      throw new Error(availability.apple.unavailableMessage ?? undefined);
    }
    const runtime = options.runtime ?? browserRuntime();
    await loadSdk(
      APPLE_SIGN_IN_SRC,
      runtime,
      () => Boolean(runtime.window.AppleID?.auth),
    );
    const appleIdentity = runtime.window.AppleID;
    if (!appleIdentity?.auth) {
      throw new Error('Apple Sign-In could not initialize.');
    }

    const state = createSecureOAuthValue(runtime.crypto);
    const nonce = createSecureOAuthValue(runtime.crypto);
    appleIdentity.auth.init({
      clientId: config.appleClientId,
      scope: 'name email',
      redirectURI: config.appleRedirectUri,
      state,
      nonce,
      usePopup: true,
    });

    let response: AppleSignInResponse;
    try {
      response = await appleIdentity.auth.signIn();
    } catch {
      throw new Error(
        'Apple Sign-In was cancelled or could not be completed.',
      );
    }
    return parseAppleSignInResponse(response, state, nonce);
  };

  return async (provider) => {
    if (provider === 'google') {
      throw new Error(
        availability.google.unavailableMessage
          ?? 'Use the visible Google Sign-In button.',
      );
    }
    return acquireApple();
  };
}

export function createGoogleButtonRenderer(
  config: ProviderRuntimeConfig,
  options: ProviderBridgeOptions = {},
): GoogleButtonRenderer {
  const availability = getProviderAvailability(config);
  const loadSdk = options.loadSdk ?? loadSdkScript;
  let initializedClientId: string | null = null;
  let activeResponseHandler:
    | ((response: GoogleCredentialResponse) => void)
    | null = null;

  return async (container, callbacks) => {
    if (!availability.google.available) {
      throw new Error(availability.google.unavailableMessage ?? undefined);
    }

    const runtime = options.runtime ?? browserRuntime();
    let active = true;
    let activating = false;
    let responseHandler:
      | ((response: GoogleCredentialResponse) => void)
      | null = null;
    const activationButton = runtime.document.createElement('button');
    activationButton.type = 'button';
    activationButton.textContent = 'Continue with Google';
    activationButton.className = (
      'btn-cyber-glass w-full px-4 py-3 text-sm font-medium text-white '
      + 'disabled:opacity-50'
    );

    const activateGoogle = async () => {
      if (!active || activating) return;
      activating = true;
      activationButton.disabled = true;
      activationButton.textContent = 'Loading Google Sign-In…';

      try {
        await loadSdk(
          GOOGLE_GIS_SRC,
          runtime,
          () => Boolean(runtime.window.google?.accounts?.id),
        );
        if (!active) return;

        const googleIdentity = runtime.window.google?.accounts?.id;
        if (!googleIdentity) {
          throw new Error('Google Sign-In could not initialize.');
        }

        responseHandler = (response) => {
          if (typeof response.credential !== 'string' || !response.credential) {
            callbacks.onError(
              new Error('Google Sign-In returned no identity credential.'),
            );
            return;
          }
          callbacks.onCredential({
            provider: 'google',
            token: response.credential,
          });
        };
        activeResponseHandler = responseHandler;

        if (initializedClientId === null) {
          googleIdentity.initialize({
            client_id: config.googleClientId,
            callback: (response) => activeResponseHandler?.(response),
            auto_select: false,
            ux_mode: 'popup',
          });
          initializedClientId = config.googleClientId;
        }

        container.replaceChildren();
        googleIdentity.renderButton(container, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.max(240, Math.min(320, container.clientWidth || 300)),
          locale: 'en',
        });
      } catch (error) {
        if (!active) return;
        activating = false;
        activationButton.disabled = false;
        activationButton.textContent = 'Continue with Google';
        callbacks.onError(
          error instanceof Error
            ? error
            : new Error('Google Sign-In could not be loaded.'),
        );
      }
    };

    const handleActivation = () => {
      void activateGoogle();
    };
    activationButton.addEventListener('click', handleActivation);
    container.replaceChildren(activationButton);

    return () => {
      active = false;
      activationButton.removeEventListener('click', handleActivation);
      if (activeResponseHandler === responseHandler) {
        activeResponseHandler = null;
      }
      container.replaceChildren();
    };
  };
}

export const providerRuntimeConfig = readProviderRuntimeConfig();
export const providerAvailability = getProviderAvailability(
  providerRuntimeConfig,
);
export const acquireProviderToken = createProviderTokenAcquirer(
  providerRuntimeConfig,
);
export const renderGoogleIdentityButton = createGoogleButtonRenderer(
  providerRuntimeConfig,
);
