export function formatRaceTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.--';
  const totalMs = Math.max(0, Math.round(seconds * 100));
  const cs = totalMs % 100;
  const totalSec = Math.floor(totalMs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
