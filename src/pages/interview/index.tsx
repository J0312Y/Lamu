import { useState, useCallback, useRef } from "react";
import { PremiumGate } from "@/components";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlayIcon,
  MicIcon,
  MicOffIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  TrophyIcon,
  ClockIcon,
  StarIcon,
} from "lucide-react";
import { useApp } from "@/contexts";
import { fetchSTT, fetchAIResponse } from "@/lib/functions";
import { shouldUseLamuAPI } from "@/lib/functions/pluely.api";
import { cn } from "@/lib/utils";
import { safeLocalStorage } from "@/lib";

// ── Types ──────────────────────────────────────────────────────────────────────

type InterviewType = "behavioral" | "technical" | "system-design" | "coding";
type InterviewRole = "software-engineer" | "product-manager" | "data-scientist" | "designer" | "other";

interface Question {
  id: string;
  text: string;
  type: InterviewType;
  hint?: string;
}

interface Answer {
  questionId: string;
  text: string;
  durationSec: number;
}

interface QuestionScore {
  questionId: string;
  score: number; // 0-10
  clarity: number;
  relevance: number;
  structure: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

interface SessionResult {
  id: string;
  date: string;
  type: InterviewType;
  role: InterviewRole;
  overallScore: number;
  questionScores: QuestionScore[];
  totalDuration: number;
}

// ── Question banks ─────────────────────────────────────────────────────────────

const QUESTION_BANKS: Record<InterviewType, Question[]> = {
  behavioral: [
    { id: "b1", text: "Tell me about a time you had to deal with a difficult team member. How did you handle it?", type: "behavioral", hint: "Use STAR method" },
    { id: "b2", text: "Describe a situation where you had to meet a tight deadline. What did you do?", type: "behavioral", hint: "Focus on your actions" },
    { id: "b3", text: "Give me an example of a time you failed. What did you learn from it?", type: "behavioral", hint: "Be honest, show growth" },
    { id: "b4", text: "Tell me about a time you had to adapt quickly to a major change at work.", type: "behavioral" },
    { id: "b5", text: "Describe a project you're most proud of and your specific contribution.", type: "behavioral" },
    { id: "b6", text: "Tell me about a time you had to influence someone without direct authority.", type: "behavioral" },
  ],
  technical: [
    { id: "t1", text: "Explain the difference between a stack and a queue. When would you use each?", type: "technical" },
    { id: "t2", text: "What is the difference between SQL and NoSQL databases? When would you choose one over the other?", type: "technical" },
    { id: "t3", text: "Explain REST vs GraphQL. What are the trade-offs?", type: "technical" },
    { id: "t4", text: "What is a race condition? How do you prevent it?", type: "technical" },
    { id: "t5", text: "Explain the CAP theorem in distributed systems.", type: "technical" },
    { id: "t6", text: "What is memoization and when should you use it?", type: "technical" },
  ],
  "system-design": [
    { id: "sd1", text: "Design a URL shortener like bit.ly. Walk me through your architecture.", type: "system-design", hint: "Cover: API, storage, scaling, cache" },
    { id: "sd2", text: "How would you design a real-time chat system like WhatsApp?", type: "system-design" },
    { id: "sd3", text: "Design a rate limiter for an API. What algorithms would you consider?", type: "system-design" },
    { id: "sd4", text: "How would you design a notification system that handles millions of users?", type: "system-design" },
    { id: "sd5", text: "Design a search autocomplete system.", type: "system-design" },
  ],
  coding: [
    { id: "c1", text: "Given an array of integers, find the two numbers that add up to a target sum. Return their indices.", type: "coding", hint: "Think about time/space trade-off" },
    { id: "c2", text: "Reverse a linked list in-place. What is the time and space complexity?", type: "coding" },
    { id: "c3", text: "Write a function to check if a string is a valid palindrome, ignoring non-alphanumeric characters.", type: "coding" },
    { id: "c4", text: "Find the maximum subarray sum (Kadane's algorithm).", type: "coding" },
    { id: "c5", text: "Implement a function to check if two strings are anagrams of each other.", type: "coding" },
  ],
};

const TYPE_LABELS: Record<InterviewType, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  "system-design": "System Design",
  coding: "Coding",
};

const ROLE_LABELS: Record<InterviewRole, string> = {
  "software-engineer": "Software Engineer",
  "product-manager": "Product Manager",
  "data-scientist": "Data Scientist",
  designer: "Designer",
  other: "Other",
};

const SCORING_PROMPT = (role: string, type: string, question: string, answer: string) => `
You are an expert technical interviewer evaluating a candidate's answer.

Role: ${role}
Interview type: ${type}
Question: ${question}
Candidate answer: ${answer}

Evaluate this answer on a scale of 0-10 for:
- clarity (how clearly and concisely they communicated)
- relevance (how well the answer addressed the question)
- structure (logical organization, e.g. STAR for behavioral, complexity analysis for coding)

Respond ONLY with this exact JSON format (no markdown, no other text):
{"score":7,"clarity":8,"relevance":7,"structure":6,"feedback":"Overall assessment in 1-2 sentences.","strengths":["strength 1","strength 2"],"improvements":["improvement 1","improvement 2"]}
`.trim();

// ── Component ──────────────────────────────────────────────────────────────────

type Phase = "setup" | "session" | "results";

export default function InterviewPrepPage() {
  const { selectedSttProvider, allSttProviders, selectedAIProvider, allAiProviders } = useApp();

  const [phase, setPhase] = useState<Phase>("setup");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");
  const [interviewRole, setInterviewRole] = useState<InterviewRole>("software-engineer");
  const [questionCount, setQuestionCount] = useState(5);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scores, setScores] = useState<QuestionScore[]>([]);
  const [answerStartTime, setAnswerStartTime] = useState<number>(0);
  const [sessionStart, setSessionStart] = useState<number>(0);
  const [pastSessions, setPastSessions] = useState<SessionResult[]>(() => {
    try { return JSON.parse(safeLocalStorage.getItem("interview_sessions") ?? "[]"); }
    catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const pickQuestions = useCallback((type: InterviewType, count: number): Question[] => {
    const bank = [...QUESTION_BANKS[type]];
    // Shuffle
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    return bank.slice(0, Math.min(count, bank.length));
  }, []);

  const startSession = useCallback(() => {
    const qs = pickQuestions(interviewType, questionCount);
    setQuestions(qs);
    setCurrentIdx(0);
    setAnswers([]);
    setScores([]);
    setCurrentAnswer("");
    setPhase("session");
    setSessionStart(Date.now());
    setAnswerStartTime(Date.now());
  }, [interviewType, questionCount, pickQuestions]);

  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setAnswerStartTime(Date.now());
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, []);

  const stopVoiceRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) { resolve(); return; }
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);

        // Transcribe
        try {
          const useLamuAPI = await shouldUseLamuAPI();
          const providerConfig = allSttProviders.find((p) => p.id === selectedSttProvider.provider);
          if (providerConfig || useLamuAPI) {
            const text = await fetchSTT({ provider: providerConfig, selectedProvider: selectedSttProvider, audio: audioBlob });
            if (text.trim()) setCurrentAnswer(text.trim());
          }
        } catch (e) {
          console.error("STT error:", e);
        }
        resolve();
      };
      recorder.stop();
    });
  }, [allSttProviders, selectedSttProvider]);

  const scoreAnswer = useCallback(async (question: Question, answerText: string): Promise<QuestionScore> => {
    const prompt = SCORING_PROMPT(ROLE_LABELS[interviewRole], TYPE_LABELS[interviewType], question.text, answerText);
    let raw = "";
    try {
      const useLamuAPI = await shouldUseLamuAPI();
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      for await (const chunk of fetchAIResponse({
        provider: useLamuAPI ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "You are a precise interview evaluator. Reply ONLY with valid JSON.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) { raw += chunk; }

      const json = JSON.parse(raw.trim());
      return {
        questionId: question.id,
        score: Number(json.score) || 0,
        clarity: Number(json.clarity) || 0,
        relevance: Number(json.relevance) || 0,
        structure: Number(json.structure) || 0,
        feedback: json.feedback || "",
        strengths: Array.isArray(json.strengths) ? json.strengths : [],
        improvements: Array.isArray(json.improvements) ? json.improvements : [],
      };
    } catch {
      return { questionId: question.id, score: 0, clarity: 0, relevance: 0, structure: 0, feedback: "Scoring failed.", strengths: [], improvements: [] };
    }
  }, [interviewRole, interviewType, allAiProviders, selectedAIProvider]);

  const submitAnswer = useCallback(async () => {
    if (!currentAnswer.trim() && !isRecording) return;
    if (isRecording) await stopVoiceRecording();

    const durationSec = Math.round((Date.now() - answerStartTime) / 1000);
    const answer: Answer = { questionId: questions[currentIdx].id, text: currentAnswer, durationSec };
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setCurrentAnswer("");

    setIsScoring(true);
    const score = await scoreAnswer(questions[currentIdx], currentAnswer);
    const newScores = [...scores, score];
    setScores(newScores);
    setIsScoring(false);

    if (currentIdx + 1 >= questions.length) {
      // Session complete
      const overall = Math.round(newScores.reduce((sum, s) => sum + s.score, 0) / newScores.length * 10) / 10;
      const session: SessionResult = {
        id: `session_${Date.now()}`,
        date: new Date().toISOString(),
        type: interviewType,
        role: interviewRole,
        overallScore: overall,
        questionScores: newScores,
        totalDuration: Math.round((Date.now() - sessionStart) / 1000),
      };
      const updated = [session, ...pastSessions].slice(0, 20);
      setPastSessions(updated);
      safeLocalStorage.setItem("interview_sessions", JSON.stringify(updated));
      setPhase("results");
    } else {
      setCurrentIdx((i) => i + 1);
      setAnswerStartTime(Date.now());
    }
  }, [currentAnswer, isRecording, answerStartTime, questions, currentIdx, answers, scores, scoreAnswer, stopVoiceRecording, interviewType, interviewRole, sessionStart, pastSessions]);

  const scoreColor = (s: number) =>
    s >= 8 ? "text-green-600" : s >= 6 ? "text-yellow-600" : "text-red-500";

  const scoreBg = (s: number) =>
    s >= 8 ? "bg-green-50 border-green-200" : s >= 6 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";

  // ── Render: Setup ──────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Interview Prep</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practice with AI-generated questions and get instant feedback on your answers.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Interview Type</label>
            <Select value={interviewType} onValueChange={(v) => setInterviewType(v as InterviewType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as InterviewType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Role</label>
            <Select value={interviewRole} onValueChange={(v) => setInterviewRole(v as InterviewRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as InterviewRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Number of questions</label>
            <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={startSession} className="w-full gap-2">
          <PlayIcon className="w-4 h-4" />
          Start Session
        </Button>

        {/* Past sessions */}
        {pastSessions.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ChevronRightIcon className={cn("w-4 h-4 transition-transform", showHistory && "rotate-90")} />
              Past sessions ({pastSessions.length})
            </button>
            {showHistory && (
              <div className="space-y-2">
                {pastSessions.slice(0, 5).map((s) => (
                  <div key={s.id} className={cn("p-3 rounded-lg border text-sm flex items-center justify-between", scoreBg(s.overallScore))}>
                    <div>
                      <span className="font-medium">{TYPE_LABELS[s.type]}</span>
                      <span className="text-muted-foreground ml-2">{ROLE_LABELS[s.role]}</span>
                      <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString()}</p>
                    </div>
                    <div className={cn("text-lg font-bold", scoreColor(s.overallScore))}>
                      {s.overallScore}/10
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Session ────────────────────────────────────────────────────────

  if (phase === "session") {
    const q = questions[currentIdx];
    const progress = (currentIdx / questions.length) * 100;

    return (
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">Question {currentIdx + 1} of {questions.length}</span>
            <Badge variant="outline" className="ml-2 text-xs">{TYPE_LABELS[interviewType]}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPhase("setup")}>
            <RotateCcwIcon className="w-3 h-3 mr-1" /> Restart
          </Button>
        </div>

        <Progress value={progress} className="h-1.5" />

        {/* Question card */}
        <div className="p-5 rounded-xl border bg-card space-y-3">
          <p className="text-base font-medium leading-relaxed">{q.text}</p>
          {q.hint && (
            <p className="text-xs text-muted-foreground italic">💡 Hint: {q.hint}</p>
          )}
        </div>

        {/* Answer area */}
        <div className="space-y-3">
          <textarea
            className="w-full min-h-32 p-3 rounded-lg border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Type your answer here, or use the mic button below to speak..."
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            disabled={isRecording || isScoring}
          />

          <div className="flex items-center gap-2">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={isScoring}
              className="gap-2"
            >
              {isRecording ? <MicOffIcon className="w-4 h-4 animate-pulse" /> : <MicIcon className="w-4 h-4" />}
              {isRecording ? "Stop recording" : "Record answer"}
            </Button>

            <Button
              onClick={submitAnswer}
              disabled={(!currentAnswer.trim() && !isRecording) || isScoring}
              className="gap-2 ml-auto"
            >
              {isScoring ? (
                <>
                  <ClockIcon className="w-4 h-4 animate-spin" /> Scoring...
                </>
              ) : currentIdx + 1 >= questions.length ? (
                <>
                  <CheckCircleIcon className="w-4 h-4" /> Finish
                </>
              ) : (
                <>
                  Next <ChevronRightIcon className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Previous scores (folded) */}
        {scores.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Previous answers</p>
            {scores.map((s, i) => (
              <div key={s.questionId} className={cn("p-3 rounded-lg border text-xs flex items-start gap-3", scoreBg(s.score))}>
                <span className={cn("font-bold text-sm shrink-0", scoreColor(s.score))}>{s.score}/10</span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{questions[i].text.slice(0, 60)}…</p>
                  <p className="text-muted-foreground mt-0.5">{s.feedback}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Results ────────────────────────────────────────────────────────

  const overallScore = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length * 10) / 10
    : 0;

  return (
    <PremiumGate featureName="Interview Prep">
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Score header */}
      <div className={cn("p-6 rounded-xl border text-center space-y-2", scoreBg(overallScore))}>
        <TrophyIcon className={cn("w-10 h-10 mx-auto", scoreColor(overallScore))} />
        <h2 className="text-2xl font-bold">
          <span className={scoreColor(overallScore)}>{overallScore}</span>
          <span className="text-muted-foreground text-lg">/10</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {overallScore >= 8 ? "Excellent performance! 🎉" : overallScore >= 6 ? "Good job, keep practicing!" : "Keep practicing — you've got this!"}
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span>{questions.length} questions</span>
          <span>{TYPE_LABELS[interviewType]}</span>
          <span>{ROLE_LABELS[interviewRole]}</span>
        </div>
      </div>

      {/* Per-question breakdown */}
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-4 pr-2">
          {scores.map((s, i) => (
            <div key={s.questionId} className="p-4 rounded-xl border space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug">{questions[i].text}</p>
                <span className={cn("text-lg font-bold shrink-0", scoreColor(s.score))}>{s.score}/10</span>
              </div>

              {/* Sub-scores */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Clarity", val: s.clarity },
                  { label: "Relevance", val: s.relevance },
                  { label: "Structure", val: s.structure },
                ].map(({ label, val }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("font-medium", scoreColor(val))}>{val}/10</span>
                    </div>
                    <Progress value={val * 10} className="h-1" />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">{s.feedback}</p>

              {s.strengths.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-green-700">✓ Strengths</p>
                  {s.strengths.map((st, j) => (
                    <p key={j} className="text-xs text-muted-foreground ml-3">• {st}</p>
                  ))}
                </div>
              )}
              {s.improvements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700">↑ Improve</p>
                  {s.improvements.map((im, j) => (
                    <p key={j} className="text-xs text-muted-foreground ml-3">• {im}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setPhase("setup")} className="flex-1 gap-2">
          <RotateCcwIcon className="w-4 h-4" /> New Session
        </Button>
        <Button
          onClick={() => {
            setPhase("session");
            setCurrentIdx(0);
            setAnswers([]);
            setScores([]);
            setCurrentAnswer("");
            setSessionStart(Date.now());
            setAnswerStartTime(Date.now());
          }}
          className="flex-1 gap-2"
        >
          <StarIcon className="w-4 h-4" /> Retry Same Questions
        </Button>
      </div>
    </div>
    </PremiumGate>
  );
}
