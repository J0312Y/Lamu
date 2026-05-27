import { CalendarIcon, VideoIcon, Loader2Icon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarEvent } from "@/hooks/useCalendar";

interface CalendarWidgetProps {
  onLoadAsContext?: (event: CalendarEvent) => void;
}

export const CalendarWidget = ({ onLoadAsContext }: CalendarWidgetProps) => {
  const { events, connected, loading, error, connect, formatEventTime, minutesUntil } = useCalendar();

  if (connected === false) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Google Calendar</span>
        </div>
        <p className="text-[10px] text-muted-foreground">Connect to see upcoming meetings and auto-load context.</p>
        <Button size="sm" variant="outline" onClick={connect} disabled={loading} className="h-7 text-xs w-full gap-1.5">
          {loading ? <Loader2Icon className="w-3 h-3 animate-spin" /> : <CalendarIcon className="w-3 h-3" />}
          Connect Google Calendar
        </Button>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    );
  }

  if (loading && events.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 flex items-center gap-2">
        <Loader2Icon className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading calendar…</span>
      </div>
    );
  }

  if (events.length === 0) return null;

  // Show only the next 3 upcoming events
  const upcoming = events.filter((e) => minutesUntil(e.start) > -30).slice(0, 3);
  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <CalendarIcon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium">Upcoming</span>
      </div>
      <div className="divide-y divide-border/30">
        {upcoming.map((event) => {
          const mins = minutesUntil(event.start);
          const isNow = mins <= 0 && mins > -60;
          const isSoon = mins > 0 && mins <= 15;

          return (
            <div key={event.id} className="px-3 py-2 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {isNow && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                  )}
                  <p className="text-xs font-medium truncate">{event.summary}</p>
                  {event.meet_link && (
                    <VideoIcon className="w-3 h-3 text-blue-500 shrink-0" />
                  )}
                </div>
                <p className={cn("text-[10px] mt-0.5", isSoon ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                  {isNow ? "Now" : isSoon ? `In ${mins}m` : formatEventTime(event.start, event.end)}
                </p>
                {event.attendees.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {event.attendees.slice(0, 3).join(", ")}
                    {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                  </p>
                )}
              </div>
              {onLoadAsContext && (
                <button
                  onClick={() => onLoadAsContext(event)}
                  title="Load as playbook context"
                  className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                >
                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
