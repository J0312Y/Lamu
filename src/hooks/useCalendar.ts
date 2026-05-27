import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string; // ISO8601
  end: string;
  location?: string;
  attendees: string[];
  meet_link?: string;
}

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null); // null = unknown
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CalendarEvent[]>("kb_calendar_upcoming", { maxResults: 8 });
      setEvents(data);
      setConnected(true);
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("not connected")) {
        setConnected(false);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke("kb_connect_calendar", { clientId: null, clientSecret: null });
      setConnected(true);
      await fetchEvents();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchEvents]);

  // Poll for upcoming events every 5 minutes if connected
  useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  /** ISO8601 → human label */
  const formatEventTime = (start: string, end: string): string => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const now = new Date();
      const today = now.toDateString() === s.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = tomorrow.toDateString() === s.toDateString();

      const timeStr = s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const endStr = e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const prefix = today ? "Today" : isTomorrow ? "Tomorrow" : s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      return `${prefix} ${timeStr} – ${endStr}`;
    } catch { return start; }
  };

  /** Returns minutes until event starts (negative if past) */
  const minutesUntil = (start: string): number => {
    try {
      return Math.round((new Date(start).getTime() - Date.now()) / 60000);
    } catch { return Infinity; }
  };

  return { events, connected, loading, error, connect, fetchEvents, formatEventTime, minutesUntil };
}
