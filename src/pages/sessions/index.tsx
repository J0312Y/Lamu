import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PageLayout } from "@/layouts";
import { PremiumGate } from "@/components";
import {
  CalendarIcon,
  ClockIcon,
  BookOpenIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MicIcon,
  BriefcaseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { safeLocalStorage } from "@/lib";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MeetingSummaryEntry {
  id: string;
  name: string;
  created_at?: number;
  content?: string;
}

interface InterviewSession {
  id: string;
  date: string;
  type: string;
  role: string;
  overallScore: number;
  totalDuration: number;
  questionScores: Array<{ score: number; feedback: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function relativeDate(iso: string): string {
  const ms = new Date(iso).getTime();
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const scoreColor = (s: number) =>
  s >= 8 ? "text-green-600" : s >= 6 ? "text-yellow-600" : "text-red-500";

const scoreBg = (s: number) =>
  s >= 8 ? "bg-green-50 border-green-200" : s >= 6 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";

// ── Component ──────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [meetings, setMeetings] = useState<MeetingSummaryEntry[]>([]);
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [expandedInterview, setExpandedInterview] = useState<string | null>(null);
  const [tab, setTab] = useState<"meetings" | "interviews">("meetings");

  const loadMeetings = async () => {
    setLoadingMeetings(true);
    try {
      const docs = await invoke<Array<{ id: string; name: string; created_at?: number }>>("kb_list_documents");
      const summaries = docs.filter((d) => d.name.startsWith("Meeting_") && d.name.endsWith(".md"));
      setMeetings(summaries);
    } catch (e) {
      console.error("Failed to load meeting summaries:", e);
    } finally {
      setLoadingMeetings(false);
    }
  };

  const loadMeetingContent = async (id: string) => {
    if (expandedMeeting === id) { setExpandedMeeting(null); return; }
    setExpandedMeeting(id);
    const entry = meetings.find((m) => m.id === id);
    if (entry && !entry.content) {
      try {
        const chunks = await invoke<string[]>("kb_get_document_chunks", { documentId: id });
        const content = chunks.join("\n\n");
        setMeetings((prev) => prev.map((m) => m.id === id ? { ...m, content } : m));
      } catch { /* best-effort */ }
    }
  };

  useEffect(() => {
    loadMeetings();
    try {
      const raw = safeLocalStorage.getItem("interview_sessions");
      if (raw) setInterviews(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  return (
    <PageLayout title="Sessions History" description="Your recorded sessions and meetings">
      <PremiumGate featureName="Sessions History">
      <div className="flex flex-col gap-4">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setTab("meetings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "meetings" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MicIcon className="w-3.5 h-3.5" />
            Meetings ({meetings.length})
          </button>
          <button
            onClick={() => setTab("interviews")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "interviews" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BriefcaseIcon className="w-3.5 h-3.5" />
            Interviews ({interviews.length})
          </button>
        </div>

        {/* Meetings tab */}
        {tab === "meetings" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Meeting summaries auto-saved to Knowledge Base</p>
              <Button size="sm" variant="outline" onClick={loadMeetings} disabled={loadingMeetings} className="gap-1.5">
                <RefreshCwIcon className={cn("w-3.5 h-3.5", loadingMeetings && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {meetings.length === 0 && !loadingMeetings && (
              <div className="text-center py-12 text-muted-foreground">
                <MicIcon className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No meeting summaries yet.</p>
                <p className="text-xs mt-1">Start a meeting session and stop it — a summary will appear here.</p>
              </div>
            )}

            <div className="space-y-2">
              {meetings.map((m) => {
                const dateStr = m.name.replace("Meeting_", "").replace(".md", "").replace("T", " ").replace(/-/g, (_, i) => i > 10 ? ":" : "-");
                return (
                  <div key={m.id} className="rounded-lg border bg-card overflow-hidden">
                    <button
                      onClick={() => loadMeetingContent(m.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <BookOpenIcon className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Meeting Summary</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {dateStr}
                          </p>
                        </div>
                      </div>
                      {expandedMeeting === m.id
                        ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {expandedMeeting === m.id && (
                      <div className="px-4 pb-4 border-t border-border/50">
                        {m.content ? (
                          <pre className="text-xs leading-relaxed whitespace-pre-wrap text-foreground font-sans mt-3">
                            {m.content}
                          </pre>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-3">Loading…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Interviews tab */}
        {tab === "interviews" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Interview prep sessions with AI feedback</p>

            {interviews.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <BriefcaseIcon className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No interview sessions yet.</p>
                <p className="text-xs mt-1">Go to Interview Prep to start practicing.</p>
              </div>
            )}

            <div className="space-y-3">
              {interviews.map((s) => (
                <div key={s.id} className="rounded-lg border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedInterview(expandedInterview === s.id ? null : s.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", scoreBg(s.overallScore))}>
                        <span className={cn("text-sm font-bold", scoreColor(s.overallScore))}>{s.overallScore}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{s.type.replace("-", " ")} — {s.role.replace("-", " ")}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" /> {relativeDate(s.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" /> {formatDuration(s.totalDuration)}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {s.questionScores.length} questions
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {expandedInterview === s.id
                      ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                      : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedInterview === s.id && (
                    <div className="px-4 pb-4 border-t border-border/50 space-y-2 mt-2">
                      {s.questionScores.map((qs, i) => (
                        <div key={i} className={cn("p-2.5 rounded-lg border flex items-start gap-2.5 text-xs", scoreBg(qs.score))}>
                          <span className={cn("font-bold shrink-0", scoreColor(qs.score))}>{qs.score}/10</span>
                          <p className="text-muted-foreground">{qs.feedback}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </PremiumGate>
    </PageLayout>
  );
}
