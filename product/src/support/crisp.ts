import {
  fetchCrispIdentityWithin,
  type CrispIdentity,
} from '../api/crispIdentity';

type CrispQueue = {
  push: (command: unknown[]) => unknown;
};

declare global {
  interface Window {
    $crisp?: CrispQueue;
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: {
      locale: string;
    };
  }
}

const CRISP_SCRIPT_ID = 'luma-crisp-loader';
export const DEFAULT_CRISP_WEBSITE_ID =
  '00000000-0000-0000-0000-000000000000';
let activeWebsiteId: string | null = null;
let supportChatOpen = false;
let supportUnread = false;
let supportIdentityLoaded = false;
let supportIdentityInFlight: Promise<void> | null = null;
let supportSessionRevision = 0;
const supportUnreadListeners = new Set<() => void>();

function setSupportUnread(nextValue: boolean): void {
  if (supportUnread === nextValue) return;
  supportUnread = nextValue;
  supportUnreadListeners.forEach((listener) => listener());
}

function handleSupportMessageReceived(): void {
  if (!supportChatOpen) setSupportUnread(true);
}

function handleSupportChatOpened(): void {
  supportChatOpen = true;
  setSupportUnread(false);
}

function handleSupportChatClosed(): void {
  supportChatOpen = false;
  hideSupportChat();
}

export function subscribeSupportUnread(listener: () => void): () => void {
  supportUnreadListeners.add(listener);
  return () => supportUnreadListeners.delete(listener);
}

export function getSupportUnread(): boolean {
  return supportUnread;
}

function queueCrisp(command: unknown[]): void {
  window.$crisp = window.$crisp ?? ([] as unknown as CrispQueue);
  window.$crisp.push(command);
}

function hideSupportChat(): void {
  queueCrisp(['do', 'chat:hide']);
}

function queueSupportIdentity(identity: CrispIdentity): void {
  if (identity.nickname) {
    queueCrisp(['set', 'user:nickname', [identity.nickname]]);
  }
  if (!identity.email) return;

  if (identity.identityVerified && identity.signature) {
    queueCrisp(['set', 'user:email', [identity.email, identity.signature]]);
    return;
  }
  queueCrisp(['set', 'user:email', [identity.email]]);
}

async function hydrateSupportIdentity(): Promise<void> {
  if (supportIdentityLoaded) return;
  if (supportIdentityInFlight) return supportIdentityInFlight;

  const sessionRevision = supportSessionRevision;
  const inFlight = (async () => {
    try {
      const identity = await fetchCrispIdentityWithin();
      if (sessionRevision !== supportSessionRevision) return;
      queueSupportIdentity(identity);
      supportIdentityLoaded = true;
    } catch {
      // Support remains available if the optional identity bridge is offline.
      // Crisp then asks the visitor for contact details in its own interface.
    } finally {
      if (supportIdentityInFlight === inFlight) {
        supportIdentityInFlight = null;
      }
    }
  })();
  supportIdentityInFlight = inFlight;

  return inFlight;
}

function ensureCrispScript(): void {
  if (!activeWebsiteId || document.getElementById(CRISP_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement('script');
  script.id = CRISP_SCRIPT_ID;
  script.src = 'https://client.crisp.chat/l.js';
  script.async = true;
  script.addEventListener(
    'error',
    () => {
      script.remove();
    },
    { once: true },
  );
  document.head.appendChild(script);
}

export function initializeSupportChat(websiteId?: string): () => void {
  const normalizedWebsiteId = (
    websiteId?.trim() || DEFAULT_CRISP_WEBSITE_ID
  );

  activeWebsiteId = normalizedWebsiteId;
  supportSessionRevision += 1;
  supportIdentityLoaded = false;
  window.CRISP_WEBSITE_ID = normalizedWebsiteId;
  window.CRISP_RUNTIME_CONFIG = { locale: 'en' };
  queueCrisp(['config', 'locale', ['en']]);
  queueCrisp(['config', 'color:mode', ['dark']]);
  hideSupportChat();
  queueCrisp(['off', 'chat:closed']);
  queueCrisp(['off', 'chat:opened']);
  queueCrisp(['off', 'message:received']);
  queueCrisp(['on', 'chat:closed', handleSupportChatClosed]);
  queueCrisp(['on', 'chat:opened', handleSupportChatOpened]);
  queueCrisp(['on', 'message:received', handleSupportMessageReceived]);

  return () => {
    activeWebsiteId = null;
    supportSessionRevision += 1;
    supportIdentityLoaded = false;
    supportIdentityInFlight = null;
    supportChatOpen = false;
    setSupportUnread(false);
    queueCrisp(['off', 'chat:closed']);
    queueCrisp(['off', 'chat:opened']);
    queueCrisp(['off', 'message:received']);
    queueCrisp(['do', 'chat:close']);
    queueCrisp(['do', 'session:reset']);
    hideSupportChat();
  };
}

export async function openSupportChat(): Promise<void> {
  const sessionRevision = supportSessionRevision;
  const websiteId = activeWebsiteId;
  if (!websiteId) return;

  supportChatOpen = true;
  setSupportUnread(false);
  await hydrateSupportIdentity();

  // A logout or account switch may occur while the optional identity request
  // is pending. Never reopen the prior visitor's support session afterwards.
  if (
    sessionRevision !== supportSessionRevision ||
    websiteId !== activeWebsiteId
  ) {
    return;
  }

  ensureCrispScript();
  queueCrisp(['do', 'chat:show']);
  queueCrisp(['do', 'chat:open']);
}
