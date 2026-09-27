import { useState, useEffect, useMemo } from 'react';

export interface EscalationTimerState {
  isActive: boolean;
  intervalSeconds: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  remainingSeconds: number;
  formattedCountdown: string;
  formattedNextRunTime: string;
  progressPct: number;
  isDue: boolean;
}

/**
 * Custom React hook for live countdown and next run calculation for autonomous escalations.
 * Tracks time precisely, ticking every 500ms and calculating exact cycle intervals.
 */
export function useEscalationCountdown(
  status: 'ACTIVE' | 'INACTIVE' | string | undefined,
  lastRunAtStr: string | null | undefined,
  intervalSeconds: number = 5,
  onCycleComplete?: () => void
): EscalationTimerState {
  const [now, setNow] = useState<number>(() => Date.now());

  const isActive = status === 'ACTIVE';

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [isActive]);

  const state = useMemo(() => {
    if (!isActive) {
      return {
        isActive: false,
        intervalSeconds,
        lastRunAt: lastRunAtStr ? new Date(lastRunAtStr) : null,
        nextRunAt: null,
        remainingSeconds: 0,
        formattedCountdown: '—',
        formattedNextRunTime: 'Paused (Inactive)',
        progressPct: 0,
        isDue: false,
      };
    }

    const intervalMs = Math.max(1000, (intervalSeconds || 5) * 1000);
    const lastRunMs = lastRunAtStr ? new Date(lastRunAtStr).getTime() : now;

    let targetNextMs: number;
    if (lastRunMs + intervalMs > now) {
      targetNextMs = lastRunMs + intervalMs;
    } else {
      // Calculate current repeating cycle target
      const elapsedSinceLast = now - lastRunMs;
      const cycles = Math.floor(elapsedSinceLast / intervalMs);
      targetNextMs = lastRunMs + (cycles + 1) * intervalMs;
    }

    const diffMs = Math.max(0, targetNextMs - now);
    const remainingSeconds = Math.ceil(diffMs / 1000);
    const elapsedInCycle = intervalMs - diffMs;
    const progressPct = Math.min(100, Math.max(0, (elapsedInCycle / intervalMs) * 100));

    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    let formattedCountdown: string;
    if (hours > 0) {
      formattedCountdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      formattedCountdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    const nextRunDate = new Date(targetNextMs);
    const formattedNextRunTime = nextRunDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return {
      isActive: true,
      intervalSeconds,
      lastRunAt: lastRunAtStr ? new Date(lastRunAtStr) : null,
      nextRunAt: nextRunDate,
      remainingSeconds,
      formattedCountdown,
      formattedNextRunTime,
      progressPct,
      isDue: remainingSeconds === 0,
    };
  }, [isActive, lastRunAtStr, intervalSeconds, now]);

  // Trigger cycle completion callback when timer hits 0
  useEffect(() => {
    if (state.isDue && onCycleComplete) {
      onCycleComplete();
    }
  }, [state.isDue, onCycleComplete]);

  return state;
}
