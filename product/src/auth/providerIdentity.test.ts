import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGoogleButtonRenderer,
  createProviderTokenAcquirer,
  getProviderAvailability,
} from './providerIdentity';

const configuredProviders = {
  googleClientId: 'google-web-client.apps.googleusercontent.com',
  appleClientId: 'tech.lumaquant.web',
  appleRedirectUri: 'https://ai.lumaquant.tech/auth/apple/callback',
};

interface GoogleCredentialResponse {
  credential?: string;
}

interface FakeGoogleContainer {
  clientWidth: number;
  replaceCount: number;
  children: unknown[];
  replaceChildren(...children: unknown[]): void;
}

interface FakeGoogleActivationButton {
  type: string;
  textContent: string;
  className: string;
  disabled: boolean;
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
  click(): void;
}

function createGoogleActivationButton(): FakeGoogleActivationButton {
  const clickListeners = new Set<() => void>();
  return {
    type: '',
    textContent: '',
    className: '',
    disabled: false,
    addEventListener(event, listener) {
      if (event === 'click') clickListeners.add(listener);
    },
    removeEventListener(event, listener) {
      if (event === 'click') clickListeners.delete(listener);
    },
    click() {
      if (this.disabled) return;
      for (const listener of clickListeners) listener();
    },
  };
}

function createGoogleHarness(
  loadSdk: () => Promise<void> = async () => undefined,
) {
  let credentialCallback:
    | ((response: GoogleCredentialResponse) => void)
    | undefined;
  let initializeCalls = 0;
  let loadCalls = 0;
  const renderCalls: Array<{
    parent: HTMLElement;
    options: Record<string, unknown>;
  }> = [];

  const googleIdentity = {
    initialize(config: {
      callback: (response: GoogleCredentialResponse) => void;
    }) {
      initializeCalls += 1;
      credentialCallback = config.callback;
    },
    renderButton(
      parent: HTMLElement,
      options: Record<string, unknown>,
    ) {
      renderCalls.push({ parent, options });
    },
  };
  const runtime = {
    window: {
      google: {
        accounts: {
          id: googleIdentity,
        },
      },
    },
    document: {
      createElement(tagName: string) {
        assert.equal(tagName, 'button');
        return createGoogleActivationButton();
      },
    },
    crypto: {
      getRandomValues<T extends ArrayBufferView | null>(values: T): T {
        return values;
      },
    },
  };
  const injectedLoader = async (
    _source: string,
    _runtime: unknown,
    isReady: () => boolean,
  ) => {
    loadCalls += 1;
    await loadSdk();
    assert.equal(isReady(), true);
  };

  return {
    runtime,
    loadSdk: injectedLoader,
    renderCalls,
    get initializeCalls() {
      return initializeCalls;
    },
    get loadCalls() {
      return loadCalls;
    },
    respond(response: GoogleCredentialResponse) {
      assert.ok(credentialCallback, 'Google GIS callback was initialized');
      credentialCallback(response);
    },
  };
}

function createGoogleContainer(width = 304): FakeGoogleContainer {
  return {
    clientWidth: width,
    replaceCount: 0,
    children: [],
    replaceChildren(...children) {
      this.replaceCount += 1;
      this.children = children;
    },
  };
}

function getGoogleActivationButton(
  container: FakeGoogleContainer,
): FakeGoogleActivationButton {
  assert.equal(container.children.length, 1);
  return container.children[0] as FakeGoogleActivationButton;
}

async function flushGoogleActivation(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('GIS loads only after the first-party Google activation click', async () => {
  const harness = createGoogleHarness();
  const renderer = createGoogleButtonRenderer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });
  const container = createGoogleContainer();
  const credentials: unknown[] = [];
  const errors: Error[] = [];

  const cleanup = await renderer(container as never, {
    onCredential: (credential) => credentials.push(credential),
    onError: (error) => errors.push(error),
  });

  assert.equal(harness.loadCalls, 0);
  assert.equal(harness.initializeCalls, 0);
  assert.equal(harness.renderCalls.length, 0);
  const activationButton = getGoogleActivationButton(container);
  assert.equal(activationButton.type, 'button');
  assert.equal(activationButton.textContent, 'Continue with Google');

  activationButton.click();
  await flushGoogleActivation();

  assert.equal(harness.loadCalls, 1);
  assert.equal(harness.initializeCalls, 1);
  assert.equal(harness.renderCalls.length, 1);
  assert.equal(harness.renderCalls[0].parent, container);
  assert.deepEqual(harness.renderCalls[0].options, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: 304,
    locale: 'en',
  });

  harness.respond({ credential: 'google-id-token' });
  assert.deepEqual(credentials, [{
    provider: 'google',
    token: 'google-id-token',
  }]);
  assert.deepEqual(errors, []);

  cleanup();
  assert.equal(container.replaceCount, 3);
});

test('GIS is initialized once while a re-render routes to the latest handler', async () => {
  const harness = createGoogleHarness();
  const renderer = createGoogleButtonRenderer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });
  const firstCredentials: unknown[] = [];
  const secondCredentials: unknown[] = [];

  const firstContainer = createGoogleContainer();
  const cleanupFirst = await renderer(
    firstContainer as never,
    {
      onCredential: (credential) => firstCredentials.push(credential),
      onError: assert.fail,
    },
  );
  const secondContainer = createGoogleContainer();
  const cleanupSecond = await renderer(
    secondContainer as never,
    {
      onCredential: (credential) => secondCredentials.push(credential),
      onError: assert.fail,
    },
  );

  assert.equal(harness.loadCalls, 0);
  getGoogleActivationButton(firstContainer).click();
  await flushGoogleActivation();
  getGoogleActivationButton(secondContainer).click();
  await flushGoogleActivation();

  assert.equal(harness.initializeCalls, 1);
  assert.equal(harness.renderCalls.length, 2);
  harness.respond({ credential: 'retry-id-token' });
  assert.deepEqual(firstCredentials, []);
  assert.deepEqual(secondCredentials, [{
    provider: 'google',
    token: 'retry-id-token',
  }]);

  cleanupFirst();
  cleanupSecond();
});

test('a GIS load failure can be retried after explicit activation', async () => {
  let loadAttempts = 0;
  const harness = createGoogleHarness(async () => {
    loadAttempts += 1;
    if (loadAttempts === 1) {
      throw new Error('GIS SDK unavailable');
    }
  });
  const renderer = createGoogleButtonRenderer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });
  const errors: Error[] = [];
  const container = createGoogleContainer();

  await renderer(container as never, {
    onCredential: () => undefined,
    onError: (error) => errors.push(error),
  });
  const activationButton = getGoogleActivationButton(container);
  assert.equal(loadAttempts, 0);
  activationButton.click();
  await flushGoogleActivation();
  assert.equal(loadAttempts, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /GIS SDK unavailable/);
  assert.equal(activationButton.disabled, false);

  activationButton.click();
  await flushGoogleActivation();
  assert.equal(loadAttempts, 2);
  assert.equal(harness.renderCalls.length, 1);
  assert.equal('prompt' in harness.runtime.window.google.accounts.id, false);
});

test('an incomplete GIS response reports an error and accepts a later credential', async () => {
  const harness = createGoogleHarness();
  const renderer = createGoogleButtonRenderer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });
  const credentials: unknown[] = [];
  const errors: Error[] = [];

  const activationContainer = createGoogleContainer();
  await renderer(activationContainer as never, {
    onCredential: (credential) => credentials.push(credential),
    onError: (error) => errors.push(error),
  });
  assert.equal(harness.loadCalls, 0);
  getGoogleActivationButton(activationContainer).click();
  await flushGoogleActivation();
  harness.respond({});
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /no identity credential/);

  harness.respond({ credential: 'valid-after-error' });
  assert.deepEqual(credentials, [{
    provider: 'google',
    token: 'valid-after-error',
  }]);
});

test('missing provider values disable both SDK flows truthfully', async () => {
  const missingConfig = {
    googleClientId: '',
    appleClientId: '',
    appleRedirectUri: '',
  };
  const availability = getProviderAvailability(missingConfig);
  assert.equal(availability.google.available, false);
  assert.match(
    availability.google.unavailableMessage ?? '',
    /web client ID is not configured/,
  );
  assert.equal(availability.apple.available, false);
  assert.match(
    availability.apple.unavailableMessage ?? '',
    /web client ID and redirect URL are not configured/,
  );

  const renderGoogle = createGoogleButtonRenderer(missingConfig);
  await assert.rejects(
    renderGoogle(createGoogleContainer() as never, {
      onCredential: () => undefined,
      onError: () => undefined,
    }),
    /web client ID is not configured/,
  );
  const acquire = createProviderTokenAcquirer(missingConfig);
  await assert.rejects(
    acquire('apple'),
    /web client ID and redirect URL are not configured/,
  );
});

function createAppleHarness(returnedState: (expected: string) => string) {
  let randomFill = 1;
  let initialized:
    | {
      clientId: string;
      scope: string;
      redirectURI: string;
      state: string;
      nonce: string;
      usePopup: true;
    }
    | undefined;

  const appleIdentity = {
    auth: {
      init(config: NonNullable<typeof initialized>) {
        initialized = config;
      },
      async signIn() {
        assert.ok(initialized, 'Apple SDK was initialized');
        return {
          authorization: {
            code: 'single-use-apple-code',
            id_token: 'apple-id-token',
            state: returnedState(initialized.state),
          },
        };
      },
    },
  };

  const runtime = {
    window: { AppleID: appleIdentity },
    document: {},
    crypto: {
      getRandomValues<T extends ArrayBufferView | null>(values: T): T {
        assert.ok(values instanceof Uint8Array);
        values.fill(randomFill);
        randomFill += 1;
        return values as T;
      },
    },
  };
  const loadSdk = async (
    _source: string,
    _runtime: unknown,
    isReady: () => boolean,
  ) => {
    assert.equal(isReady(), true);
  };

  return {
    runtime,
    loadSdk,
    get initialized() {
      return initialized;
    },
  };
}

test('Apple rejects a response whose state does not match the attempt', async () => {
  const harness = createAppleHarness(() => 'attacker-state');
  const acquire = createProviderTokenAcquirer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });

  await assert.rejects(
    acquire('apple'),
    /could not verify the security state/,
  );
});

test('Apple returns the complete code-exchange payload bound to its nonce', async () => {
  const harness = createAppleHarness((expectedState) => expectedState);
  const acquire = createProviderTokenAcquirer(configuredProviders, {
    runtime: harness.runtime as never,
    loadSdk: harness.loadSdk,
  });

  const credential = await acquire('apple');
  const initialized = harness.initialized;
  assert.ok(initialized);
  assert.equal(initialized.clientId, configuredProviders.appleClientId);
  assert.equal(
    initialized.redirectURI,
    configuredProviders.appleRedirectUri,
  );
  assert.equal(initialized.scope, 'name email');
  assert.equal(initialized.usePopup, true);
  assert.equal(initialized.state, '01'.repeat(32));
  assert.equal(initialized.nonce, '02'.repeat(32));
  assert.notEqual(initialized.state, initialized.nonce);
  assert.deepEqual(credential, {
    provider: 'apple',
    id_token: 'apple-id-token',
    code: 'single-use-apple-code',
    nonce: initialized.nonce,
  });
});
