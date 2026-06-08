import { MicIcon, HeadphonesIcon, ClockIcon, BarChart3Icon } from "lucide-react";

export interface TalkTimeEntry {
  speaker: "me" | "them";
  durationMs: number;
  segments: number;
}

export interface TalkTimeData {
  entries: TalkTimeEntry[];
  totalDurationMs: number;
  meetingStartTime: number;
}

interface TalkTimeAnalyticsProps {
  data: TalkTimeData | null;
  compact?: boolean;
}

export const TalkTimeAnalytics = ({ data, compact }: TalkTimeAnalyticsProps) => {
  if (!data || data.totalDurationMs === 0) return null;

  const meEntry = data.entries.find((e) => e.speaker === "me");
  const themEntry = data.entries.find((e) => e.speaker === "them");
  const meMs = meEntry?.durationMs || 0;
  const themMs = themEntry?.durationMs || 0;
  const silenceMs = Math.max(0, data.totalDurationMs - meMs - themMs);

  const mePct = Math.round((meMs / data.totalDurationMs) * 100);
  const themPct = Math.round((themMs / data.totalDurationMs) * 100);
  const silencePct = 100 - mePct - themPct;

  const formatTime = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    if (min === 0) return `${s}s`;
    return `${min}m ${s}s`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <BarChart3Icon className="w-3 h-3 text-muted-foreground" />
        <div className="flex items-center gap-1">
          <span className="text-blue-500 font-medium">{mePct}%</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-green-500 font-medium">{themPct}%</span>
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex">
          <div className="bg-blue-500 h-full" style={{ width: `${mePct}%` }} />
          <div className="bg-green-500 h-full" style={{ width: `${themPct}%` }} />
          <div className="bg-muted-foreground/20 h-full" style={{ width: `${silencePct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <BarChart3Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Talk Time</span>
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <ClockIcon className="w-2.5 h-2.5" />{formatTime(data.totalDurationMs)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
        <div
          className="bg-blue-500 h-full transition-all duration-500"
          style={{ width: `${mePct}%` }}
          title={`Moi: ${mePct}%`}
        />
        <div
          className="bg-green-500 h-full transition-all duration-500"
          style={{ width: `${themPct}%` }}
          title={`Autres: ${themPct}%`}
        />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <MicIcon className="w-2.5 h-2.5 text-blue-500" />
            <span className="text-[10px] text-muted-foreground">Moi</span>
          </div>
          <div className="text-xs font-bold text-blue-500">{mePct}%</div>
          <div className="text-[10px] text-muted-foreground">{formatTime(meMs)}</div>
          <div className="text-[9px] text-muted-foreground">{meEntry?.segments || 0} segments</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <HeadphonesIcon className="w-2.5 h-2.5 text-green-500" />
            <span className="text-[10px] text-muted-foreground">Autres</span>
          </div>
          <div className="text-xs font-bold text-green-500">{themPct}%</div>
          <div className="text-[10px] text-muted-foreground">{formatTime(themMs)}</div>
          <div className="text-[9px] text-muted-foreground">{themEntry?.segments || 0} segments</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 inline-block" />
            <span className="text-[10px] text-muted-foreground">Silence</span>
          </div>
          <div className="text-xs font-bold text-muted-foreground">{silencePct}%</div>
          <div className="text-[10px] text-muted-foreground">{formatTime(silenceMs)}</div>
        </div>
      </div>
    </div>
  );
};
