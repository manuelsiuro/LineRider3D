/**
 * Installed app (production builds only): registers the offline service
 * worker. A new version downloads in the background and takes over on the
 * next launch, never in the middle of a ride.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) return;
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      // An update found last time is waiting: switch to it now, before anything starts.
      if (reg.waiting && navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        reg.waiting.postMessage('skipWaiting');
      }
    } catch {
      // No offline mode (private window, blocked storage): the game still runs online.
    }
  });
}
