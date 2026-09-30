/**
 * Media Manager Utility — ViralDog
 * Centralizes media playback controls to pause all playing videos/audios
 * across the application when navigating, minimizing, blurring or switching views.
 */

export function pauseAllMedia() {
  try {
    // 1. Dispatch custom event for React components that hold internal playback state
    window.dispatchEvent(new CustomEvent('viraldog:pause-all-media'));

    // 2. Query all native <video> and <audio> elements in the active document and pause them
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach((el) => {
      try {
        if (!el.paused) {
          el.pause();
        }
      } catch (e) {
        // Ignore playback pause errors (e.g. if element is being unmounted)
      }
    });
  } catch (err) {
    console.warn('[mediaManager] Failed to pause all media:', err);
  }
}
