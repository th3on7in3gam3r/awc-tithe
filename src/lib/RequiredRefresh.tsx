import { useEffect, useRef, useState } from 'react';
import { buildRefreshUrl, fetchBuildUpdate } from './buildUpdate';
import './requiredRefresh.css';

declare const __AWC_BUILD_VERSION__: string;

const CHECK_INTERVAL_MS = 60_000;

export function RequiredRefresh({ appName }: { appName: string }) {
  const [update, setUpdate] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    let pending: AbortController | null = null;

    async function check() {
      if (pending || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const latest = await fetchBuildUpdate(__AWC_BUILD_VERSION__, baseUrl, controller.signal);
        if (latest && !controller.signal.aborted) setUpdate(latest);
      } catch {
        // A network error never triggers an update.
      } finally {
        window.clearTimeout(timeout);
        pending = null;
      }
    }

    const onReturn = () => void check();
    const interval = window.setInterval(onReturn, CHECK_INTERVAL_MS);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('vite:preloadError', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    void check();

    return () => {
      pending?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('vite:preloadError', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);

  const updateRequired = Boolean(update);
  useEffect(() => {
    const element = dialog.current;
    if (updateRequired && element && !element.open) element.showModal();
    return () => element?.close();
  }, [updateRequired]);

  if (!update) return null;

  function refresh(version: string) {
    const target = buildRefreshUrl(window.location.href, version);
    if (target === window.location.href) window.location.reload();
    else window.location.replace(target);
  }

  return (
    <dialog
      ref={dialog}
      className="awc-required-refresh"
      aria-labelledby="awc-required-refresh-title"
      aria-describedby="awc-required-refresh-message"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="awc-required-refresh-title">An update for {appName} is ready</h2>
      <p id="awc-required-refresh-message">
        Tap Refresh now to load the latest fixes and features. Unsaved changes may be lost.
      </p>
      <button type="button" autoFocus onClick={() => refresh(update)}>Refresh now</button>
    </dialog>
  );
}
