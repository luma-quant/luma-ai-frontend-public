import assert from 'node:assert/strict';
import test from 'node:test';

import apiClient from './apiClient';
import {
  DEFAULT_CRISP_WEBSITE_ID,
  getSupportUnread,
  initializeSupportChat,
  openSupportChat,
  subscribeSupportUnread,
} from '../support/crisp';

test('Crisp loads only after Support is opened, queues the signed identity, and resets on logout', async (context) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const commands: unknown[][] = [];
  const appendedScripts: Array<Record<string, unknown>> = [];
  let scriptPresent = false;
  let errorHandler: (() => void) | undefined;

  const crisp = {
    push(command: unknown[]) {
      commands.push(command);
      return commands.length;
    },
  };
  const originalGet = apiClient.get;
  const documentMock = {
    getElementById() {
      return scriptPresent ? appendedScripts[0] : null;
    },
    createElement() {
      const script: Record<string, unknown> = {
        remove() {
          scriptPresent = false;
        },
        addEventListener(
          event: string,
          handler: () => void,
        ) {
          if (event === 'error') errorHandler = handler;
        },
      };
      return script;
    },
    head: {
      appendChild(script: Record<string, unknown>) {
        scriptPresent = true;
        appendedScripts.push(script);
      },
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { $crisp: crisp },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentMock,
  });
  context.after(() => {
    apiClient.get = originalGet;
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  });

  let identityRequests = 0;
  apiClient.get = (async (url: string) => {
    identityRequests += 1;
    assert.equal(url, '/api/v1/support/crisp-identity');
    return {
      data: {
        email: 'member@example.com',
        nickname: 'LUMA Member',
        signature: 'a'.repeat(64),
        identity_verified: true,
      },
    };
  }) as typeof apiClient.get;

  const cleanup = initializeSupportChat();

  assert.deepEqual(commands.slice(0, 9), [
    ['config', 'locale', ['en']],
    ['config', 'color:mode', ['dark']],
    ['do', 'chat:hide'],
    ['off', 'chat:closed'],
    ['off', 'chat:opened'],
    ['off', 'message:received'],
    ['on', 'chat:closed', commands[6][2]],
    ['on', 'chat:opened', commands[7][2]],
    ['on', 'message:received', commands[8][2]],
  ]);
  assert.equal(
    appendedScripts.length,
    0,
    'initialization must not contact Crisp before explicit user intent',
  );
  assert.equal(identityRequests, 0);
  assert.equal(
    (globalThis.window as unknown as { CRISP_WEBSITE_ID: string })
      .CRISP_WEBSITE_ID,
    DEFAULT_CRISP_WEBSITE_ID,
  );
  assert.deepEqual(
    (globalThis.window as unknown as {
      CRISP_RUNTIME_CONFIG: { locale: string };
    }).CRISP_RUNTIME_CONFIG,
    { locale: 'en' },
  );

  const chatClosed = commands[6][2] as () => void;
  const chatOpened = commands[7][2] as () => void;
  const messageReceived = commands[8][2] as () => void;
  let unreadNotifications = 0;
  const unsubscribe = subscribeSupportUnread(() => {
    unreadNotifications += 1;
  });

  messageReceived();
  assert.equal(getSupportUnread(), true);
  assert.equal(unreadNotifications, 1);

  commands.length = 0;
  await openSupportChat();
  assert.equal(getSupportUnread(), false);
  assert.equal(appendedScripts.length, 1);
  assert.deepEqual(commands, [
    ['set', 'user:nickname', ['LUMA Member']],
    ['set', 'user:email', ['member@example.com', 'a'.repeat(64)]],
    ['do', 'chat:show'],
    ['do', 'chat:open'],
  ]);
  assert.equal(identityRequests, 1);

  chatOpened();
  chatClosed();
  messageReceived();
  assert.equal(getSupportUnread(), true);

  errorHandler?.();
  await openSupportChat();
  assert.equal(appendedScripts.length, 2);

  commands.length = 0;
  cleanup();
  assert.equal(getSupportUnread(), false);
  assert.deepEqual(commands, [
    ['off', 'chat:closed'],
    ['off', 'chat:opened'],
    ['off', 'message:received'],
    ['do', 'chat:close'],
    ['do', 'session:reset'],
    ['do', 'chat:hide'],
  ]);
  unsubscribe();
});

test('Crisp queues the canonical email without a signature and still opens when identity loading fails', async (context) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalGet = apiClient.get;
  const commands: unknown[][] = [];
  const crisp = {
    push(command: unknown[]) {
      commands.push(command);
      return commands.length;
    },
  };
  const documentMock = {
    getElementById() {
      return null;
    },
    createElement() {
      return {
        addEventListener() {},
        remove() {},
      };
    },
    head: {
      appendChild() {},
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { $crisp: crisp },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentMock,
  });
  context.after(() => {
    apiClient.get = originalGet;
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  });

  const cleanup = initializeSupportChat();
  commands.length = 0;
  apiClient.get = (async () => ({
    data: {
      email: 'member@example.com',
      nickname: null,
      signature: null,
      identity_verified: false,
    },
  })) as typeof apiClient.get;

  await openSupportChat();
  assert.deepEqual(commands, [
    ['set', 'user:email', ['member@example.com']],
    ['do', 'chat:show'],
    ['do', 'chat:open'],
  ]);

  cleanup();
  commands.length = 0;
  apiClient.get = (async () => {
    throw new Error('identity bridge unavailable');
  }) as typeof apiClient.get;
  const failureCleanup = initializeSupportChat();
  commands.length = 0;
  await openSupportChat();
  assert.deepEqual(commands, [
    ['do', 'chat:show'],
    ['do', 'chat:open'],
  ]);
  failureCleanup();
});

test('Crisp never reopens after logout while the identity request is pending', async (context) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalGet = apiClient.get;
  const commands: unknown[][] = [];
  let appendedScripts = 0;
  let resolveIdentity: ((value: unknown) => void) | undefined;
  const crisp = {
    push(command: unknown[]) {
      commands.push(command);
      return commands.length;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { $crisp: crisp },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      getElementById() {
        return null;
      },
      createElement() {
        return {
          addEventListener() {},
          remove() {},
        };
      },
      head: {
        appendChild() {
          appendedScripts += 1;
        },
      },
    },
  });
  context.after(() => {
    apiClient.get = originalGet;
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  });

  apiClient.get = (() => new Promise((resolve) => {
    resolveIdentity = resolve;
  })) as typeof apiClient.get;

  const cleanup = initializeSupportChat();
  commands.length = 0;
  const opening = openSupportChat();
  cleanup();
  resolveIdentity?.({
    data: {
      email: 'member@example.com',
      nickname: null,
      signature: null,
      identity_verified: false,
    },
  });
  await opening;

  assert.equal(appendedScripts, 0);
  assert.deepEqual(commands, [
    ['off', 'chat:closed'],
    ['off', 'chat:opened'],
    ['off', 'message:received'],
    ['do', 'chat:close'],
    ['do', 'session:reset'],
    ['do', 'chat:hide'],
  ]);
});
