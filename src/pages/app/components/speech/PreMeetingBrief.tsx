import { useState, useCallback } from "react";
import {
  BriefcaseIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  UsersIcon,
  FileTextIcon,
  CalendarIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { fetchAIResponse } from "@/lib/functions";
import { shouldUseLamuAPI } from "@/lib";
import type { CalendarEvent } from "@/hooks/useCalendar";

interface PreMeetingBriefProps {
  event: CalendarEvent;
  allAiProviders: any[];
  selectedAIProvider: any;
}

interface BriefData {
  attendeeSummary: string;
  pastMeetings: string[];
  relevantDocs: string[];
  suggestedAgenda: string;
  context: string;
}

export const PreMeetingBrief = ({ event, allAiProviders, selectedAIProvider }: PreMeetingBriefProps) => {
  const [expanded, setExpanded] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateBrief = useCallback(async () => {
    if (generated) { setExpanded(true); return; }
    setLoading(true);
    setExpanded(true);

    try {
      // 1. Search KB for past meetings with these attendees
      const pastMeetings: string[] = [];
      const relevantDocs: string[] = [];

      for (const attendee of event.attendees.slice(0, 5)) {
        try {
          const results = await invoke<Array<{ document_name: string; content: string; similarity: number }>>(
            "kb_search", { query: `meeting ${attendee}`, topK: 3 }
          );
          for (const r of results) {
            if (r.similarity > 0.3 && r.document_name.startsWith("Meeting_")) {
              if (!pastMeetings.includes(r.document_name)) pastMeetings.push(r.document_name);
            } else if (r.similarity > 0.3) {
              if (!relevantDocs.includes(r.document_name)) relevantDocs.push(r.document_name);
            }
          }
        } catch { /* KB search best-effort */ }
      }

      // 2. Search for topic-related docs
      if (event.summary) {
        try {
          const topicResults = await invoke<Array<{ document_name: string; similarity: number }>>(
            "kb_search", { query: event.summary, topK: 5 }
          );
          for (const r of topicResults) {
            if (r.similarity > 0.3 && !relevantDocs.includes(r.document_name) && !pastMeetings.includes(r.document_name)) {
              relevantDocs.push(r.document_name);
            }
          }
        } catch { /* best-effort */ }
      }

      // 3. Generate AI brief
      const prompt = `Génère un brief pré-réunion concis en français pour cette réunion :

Titre : ${event.summary}
Date : ${new Date(event.start).toLocaleString("fr-FR")}
Participants : ${event.attendees.join(", ") || "Non spécifiés"}
Description : ${event.description || "Aucune"}
Lieu : ${event.location || "Non spécifié"}
${pastMeetings.length > 0 ? `\nRéunions passées avec ces participants : ${pastMeetings.join(", ")}` : ""}
${relevantDocs.length > 0 ? `\nDocuments pertinents dans la KB : ${relevantDocs.join(", ")}` : ""}

Génère :
1. Un résumé du contexte (qui sont les participants, historique si disponible)
2. Un agenda suggéré (3-5 points)
3. Des points clés à préparer

Sois concis et actionnable.`;

      let result = "";
      const useLamuAPI = await shouldUseLamuAPI();
      const provider = allAiProviders.find((p: any) => p.id === selectedAIProvider.provider);
      for await (const chunk of fetchAIResponse({
        provider: useLamuAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "Tu es un assistant de préparation de réunions. Sois concis et actionnable.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
        useCase: "chat",
      })) {
        result += chunk;
      }

      setBrief({
        attendeeSummary: event.attendees.join(", "),
        pastMeetings,
        relevantDocs,
        suggestedAgenda: result,
        context: result,
      });
      setGenerated(true);
    } catch (e) {
      setBrief({
        attendeeSummary: event.attendees.join(", "),
        pastMeetings: [],
        relevantDocs: [],
        suggestedAgenda: "Erreur lors de la génération du brief.",
        context: "",
      });
    } finally {
      setLoading(false);
    }
  }, [event, allAiProviders, selectedAIProvider, generated]);

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={generateBrief}
      >
        <BriefcaseIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
            Brief pré-réunion
          </span>
          <p className="text-[10px] text-muted-foreground truncate">{event.summary}</p>
        </div>
        {loading ? (
          <Loader2Icon className="w-3 h-3 animate-spin text-blue-400" />
        ) : expanded ? (
          <ChevronUpIcon className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {loading && !brief ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2Icon className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Analyse des participants et de la KB...</span>
            </div>
          ) : brief ? (
            <>
              {/* Metadata badges */}
              <div className="flex flex-wrap gap-1.5">
                {event.attendees.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                    <UsersIcon className="w-2.5 h-2.5" />{event.attendees.length} participants
                  </span>
                )}
                {brief.pastMeetings.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                    <CalendarIcon className="w-2.5 h-2.5" />{brief.pastMeetings.length} réunion(s) passée(s)
                  </span>
                )}
                {brief.relevantDocs.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                    <FileTextIcon className="w-2.5 h-2.5" />{brief.relevantDocs.length} doc(s) pertinent(s)
                  </span>
                )}
              </div>

              {/* AI brief content */}
              <div className="text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                {brief.suggestedAgenda}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
