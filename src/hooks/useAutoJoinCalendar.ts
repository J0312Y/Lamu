import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CalendarEvent } from "./useCalendar";
import { safeLocalStorage } from "@/lib";

const STORAGE_KEY = "lamu_auto_join_calendar";
const POLL_INTERVAL_MS = 30_000; // Check every 30s

export interface AutoJoinConfig {
  enabled: boolean;
  earlyJoinMinutes: number;
  autoLoadPlaybook: boolean;
}

const DEFAULT_CONFIG: AutoJoinConfig = {
  enabled: false,
  earlyJoinMinutes: 1,
  autoLoadPlaybook: true,
};

/**
 * Auto-join calendar meetings by starting meeting mode when an event begins.
 * Polls calendar events and triggers meeting mode + capture when event start time arrives.
 */
export function useAutoJoinCalendar(opts: {
  meetingModeActive: boolean;
  toggleMeetingMode: () => void;
  startCapture: () => void;
  setPlaybookContext: (ctx: string) => void;
  capturing: boolean;
}) {
  const { meetingModeActive, toggleMeetingMode, startCapture, setPlaybookContext, capturing } = opts;

  const configRef = useRef<AutoJoinConfig>(DEFAULT_CONFIG);
  const joinedEventsRef = useRef<Set<string>>(new Set());
  const activeEventRef = useRef<CalendarEvent | null>(null);

  // Load config from localStorage
  useEffect(() => {
    try {
      const saved = safeLocalStorage.getItem(STORAGE_KEY);
      if (saved) {
        configRef.current = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch { /* use defaults */ }
  }, []);

  const setAutoJoinConfig = useCallback((config: Partial<AutoJoinConfig>) => {
    configRef.current = { ...configRef.current, ...config };
    safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(configRef.current));
  }, []);

  // Poll calendar events and auto-join
  useEffect(() => {
    const poll = async () => {
      if (!configRef.current.enabled) return;
      if (meetingModeActive || capturing) return; // Already in a meeting

      try {
        const events = await invoke<CalendarEvent[]>("kb_calendar_upcoming", { maxResults: 5 });
        const now = Date.now();
        const earlyMs = (configRef.current.earlyJoinMinutes || 1) * 60_000;

        for (const event of events) {
          const startMs = new Date(event.start).getTime();
          const endMs = new Date(event.end).getTime();

          // Skip already-joined events
          if (joinedEventsRef.current.has(event.id)) continue;

          // Check if event is starting now (within early join window) and hasn't ended
          if (now >= startMs - earlyMs && now < endMs) {
            // Auto-join this event
            joinedEventsRef.current.add(event.id);
            activeEventRef.current = event;

            // Load event as playbook context if enabled
            if (configRef.current.autoLoadPlaybook) {
              const playbookCtx = [
                `Meeting: ${event.summary}`,
                event.description ? `Description: ${event.description}` : "",
                event.attendees.length > 0 ? `Participants: ${event.attendees.join(", ")}` : "",
                event.location ? `Location: ${event.location}` : "",
              ].filter(Boolean).join("\n");
              setPlaybookContext(playbookCtx);
            }

            // Start meeting mode
            if (!meetingModeActive) {
              toggleMeetingMode();
            }

            // Start audio capture
            const hasAccess = await invoke<boolean>("check_system_audio_access");
            if (hasAccess && !capturing) {
              startCapture();
            }

            break; // Only join one event at a time
          }
        }
      } catch {
        // Calendar not connected or error — silent fail
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [meetingModeActive, capturing, toggleMeetingMode, startCapture, setPlaybookContext]);

  // Clean up joined events set periodically (remove events that ended >1h ago)
  useEffect(() => {
    const cleanup = setInterval(() => {
      // We can't easily clean up without re-fetching events,
      // but the set is bounded by calendar event count, so it's fine
      if (joinedEventsRef.current.size > 50) {
        joinedEventsRef.current.clear();
      }
    }, 3600_000);
    return () => clearInterval(cleanup);
  }, []);

  return {
    autoJoinConfig: configRef.current,
    setAutoJoinConfig,
    activeCalendarEvent: activeEventRef.current,
  };
}
