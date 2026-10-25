import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Share, Smartphone, SquarePlus, X } from 'lucide-react';

const DISMISS_KEY = 'awc.tithe.addToHome';
const SNOOZE_DAYS = 30;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  } catch {
    return false;
  }
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
}

/**
 * "Not now" hides the ask for 30 days; a second "Not now" hides it for good.
 * Adding the app hides it for good. The menu item always stays available.
 */
type DismissState = { count: number; until: number; installed?: boolean };

function readDismiss(): DismissState {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
    return { count: Number(raw.count) || 0, until: Number(raw.until) || 0, installed: raw.installed === true };
  } catch {
    return { count: 0, until: 0 };
  }
}

function readDismissed(): boolean {
  const d = readDismiss();
  return d.installed === true || d.count >= 2 || Date.now() < d.until;
}

function writeDismissed(opts: { installed?: boolean } = {}): void {
  try {
    const d = readDismiss();
    const next: DismissState = opts.installed
      ? { ...d, installed: true }
      : { count: d.count + 1, until: Date.now() + SNOOZE_DAYS * 86_400_000, installed: d.installed };
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

// ---------------------------------------------------------------------------
// One shared install offer for the whole page. The browser fires
// beforeinstallprompt once and its prompt() can be used once, so every
// "Add to Home Screen" button reads from here instead of keeping its own copy.
// ---------------------------------------------------------------------------
type InstallSnapshot = { deferred: BeforeInstallPromptEvent | null; installed: boolean };
let snapshot: InstallSnapshot = { deferred: null, installed: false };
const listeners = new Set<() => void>();
const emit = (next: Partial<InstallSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
};

if (typeof window !== 'undefined') {
  snapshot = { deferred: null, installed: isStandalone() };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    emit({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    writeDismissed({ installed: true });
    emit({ deferred: null, installed: true });
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function useAddToHomeScreen() {
  const { deferred, installed } = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const [ios] = useState(() => (typeof window !== 'undefined' ? isIosDevice() : false));
  const [installing, setInstalling] = useState(false);

  const addToHome = useCallback(async (): Promise<boolean> => {
    const event = snapshot.deferred;
    if (!event) return false;
    setInstalling(true);
    emit({ deferred: null }); // one use only
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        writeDismissed({ installed: true });
        emit({ installed: true });
        return true;
      }
    } catch {
      /* user closed the browser sheet */
    } finally {
      setInstalling(false);
    }
    return false;
  }, []);

  return { installed, ios, canPrompt: Boolean(deferred), installing, addToHome };
}

function HomeScreenSteps({ ios }: { ios: boolean }) {
  if (ios) {
    return (
      <ol className="space-y-2 text-[13px] leading-snug text-awc-on-wine-muted">
        <li className="flex gap-2">
          <span className="font-semibold text-awc-gold">1.</span>
          <span>
            Tap Share
            <Share className="mx-1 inline h-3.5 w-3.5 text-awc-gold" aria-hidden="true" />
            at the bottom of Safari.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-awc-gold">2.</span>
          <span>
            Choose <span className="font-semibold text-awc-on-wine">Add to Home Screen</span>
            <SquarePlus className="mx-1 inline h-3.5 w-3.5 text-awc-gold" aria-hidden="true" />.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-awc-gold">3.</span>
          <span>Tap Add. The AWC Tithe seal will appear on your home screen.</span>
        </li>
      </ol>
    );
  }
  return (
    <p className="text-[13px] leading-snug text-awc-on-wine-muted">
      Open the browser menu and choose{' '}
      <span className="font-semibold text-awc-on-wine">Install app</span> or{' '}
      <span className="font-semibold text-awc-on-wine">Add to Home screen</span>. The AWC Tithe
      seal will be the icon on your phone.
    </p>
  );
}

function PromptCard({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[rgba(233,201,121,0.35)] bg-awc-wine-deep p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <img
          src="/icons/icon-192.png"
          alt="AWC Tithe"
          className="h-12 w-12 shrink-0 rounded-[12px] border border-[rgba(201,154,62,0.55)] object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="font-serif-display text-lg font-semibold text-awc-on-wine">{title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-awc-on-wine-muted">
            Keep giving one tap away, with the church seal as the icon.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-awc-on-wine-muted hover:text-awc-on-wine"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Desktop navbar dropdown: asks members to add Tithe, and shows how. */
export const AddToHomeScreen: React.FC<{ quiet?: boolean }> = ({ quiet = false }) => {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { installed, ios, canPrompt, installing, addToHome } = useAddToHomeScreen();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    if (installed || quiet || readDismissed()) return;
    const t = window.setTimeout(() => setAsk(true), 1200);
    return () => window.clearTimeout(t);
  }, [installed, quiet]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (installed) return null;

  const dismissAsk = () => {
    setAsk(false);
    writeDismissed();
  };

  const onYes = async () => {
    const added = await addToHome();
    if (added) {
      setAsk(false);
      setOpen(false);
      return;
    }
    setShowHow(true);
    setOpen(true);
    setAsk(false);
  };

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setAsk(false);
          setShowHow(true);
        }}
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[rgba(233,201,121,0.35)] px-3 text-[12px] font-semibold tracking-[0.04em] text-awc-on-wine-muted transition-colors hover:text-awc-on-wine"
      >
        <Smartphone className="h-3.5 w-3.5 text-awc-gold" aria-hidden="true" />
        Add to phone
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {(open || ask) && (
        <div id={menuId} className="absolute right-0 top-[calc(100%+0.6rem)] z-50">
          <PromptCard
            title={ask && !showHow ? 'Add Tithe to your home screen?' : 'Add AWC Tithe'}
            onClose={ask ? dismissAsk : () => setOpen(false)}
          >
            {showHow || open ? <HomeScreenSteps ios={ios} /> : null}
            <div className={`flex gap-2 ${showHow || open ? 'mt-3' : ''}`}>
              {canPrompt ? (
                <button
                  type="button"
                  onClick={() => void onYes()}
                  disabled={installing}
                  className="flex-1 rounded-full bg-awc-gold px-3 py-2 text-sm font-semibold text-awc-wine-deep"
                >
                  {installing ? 'Opening…' : 'Add to Home Screen'}
                </button>
              ) : ask && !showHow ? (
                <button
                  type="button"
                  onClick={() => void onYes()}
                  className="flex-1 rounded-full bg-awc-gold px-3 py-2 text-sm font-semibold text-awc-wine-deep"
                >
                  Yes, add it
                </button>
              ) : null}
              {ask && !open ? (
                <button
                  type="button"
                  onClick={dismissAsk}
                  className="flex-1 rounded-full border border-[rgba(233,201,121,0.35)] px-3 py-2 text-sm font-semibold text-awc-on-wine"
                >
                  Not now
                </button>
              ) : null}
            </div>
          </PromptCard>
        </div>
      )}
    </div>
  );
};

interface AddToHomeScreenMobileProps {
  onDone?: () => void;
}

/** Item in the mobile nav menu. */
export const AddToHomeScreenMobile: React.FC<AddToHomeScreenMobileProps> = ({ onDone }) => {
  const { installed, ios, canPrompt, installing, addToHome } = useAddToHomeScreen();
  const [open, setOpen] = useState(false);

  if (installed) return null;

  const onYes = async () => {
    const added = await addToHome();
    if (added) {
      onDone?.();
      return;
    }
    setOpen(true);
  };

  return (
    <div className="mt-3 border-t border-[rgba(233,201,121,0.2)] pt-2">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          void onYes();
        }}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between text-left text-base font-medium text-awc-on-wine-muted"
      >
        <span className="inline-flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-md object-cover" />
          Add to Home Screen
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 pb-2">
          <HomeScreenSteps ios={ios} />
          {canPrompt ? (
            <button
              type="button"
              onClick={() => void onYes()}
              disabled={installing}
              className="w-full rounded-full bg-awc-gold px-4 py-2.5 text-sm font-semibold text-awc-wine-deep"
            >
              {installing ? 'Opening…' : 'Add AWC Tithe'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

/** Dropdown ask that appears under the header on phones. */
export const AddToHomeScreenBanner: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const { installed, ios, canPrompt, installing, addToHome } = useAddToHomeScreen();
  const [visible, setVisible] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    if (installed || hidden || readDismissed()) return;
    const t = window.setTimeout(() => setVisible(true), 900);
    return () => window.clearTimeout(t);
  }, [installed, hidden]);

  if (!visible || installed || hidden) return null;

  const close = () => {
    setVisible(false);
    writeDismissed();
  };

  const onYes = async () => {
    const added = await addToHome();
    if (added) {
      close();
      return;
    }
    setShowHow(true);
  };

  return (
    <div className="no-print overflow-hidden border-t border-[rgba(233,201,121,0.2)] bg-awc-wine-deep px-4 py-3 md:hidden">
      <div className="flex items-start gap-3">
        <img
          src="/icons/icon-192.png"
          alt="AWC Tithe"
          className="h-11 w-11 shrink-0 rounded-[10px] border border-[rgba(201,154,62,0.55)] object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-awc-on-wine">Add Tithe to your home screen?</p>
          <p className="mt-0.5 text-[12px] leading-snug text-awc-on-wine-muted">
            Members can open giving like an app, with the AWC Tithe seal as the icon.
          </p>
          {showHow ? <div className="mt-2"><HomeScreenSteps ios={ios} /></div> : null}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (showHow && !canPrompt) close();
                else void onYes();
              }}
              disabled={installing}
              className="rounded-full bg-awc-gold px-3 py-1.5 text-[12px] font-semibold text-awc-wine-deep"
            >
              {installing ? 'Opening…' : showHow && !canPrompt ? 'Got it' : 'Yes, add it'}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-awc-on-wine-muted"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
