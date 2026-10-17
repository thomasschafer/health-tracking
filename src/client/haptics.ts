/** Vibrates where supported. iOS Safari has no vibration API, so this is a no-op there. */
export function vibrate(pattern: number | number[]): void {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}
