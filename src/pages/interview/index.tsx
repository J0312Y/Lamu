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
    { id: "b1", text: "Parlez-moi d'une situation où vous avez dû gérer un coéquipier difficile. Comment avez-vous géré cela ?", type: "behavioral", hint: "Utilisez la méthode STAR" },
    { id: "b2", text: "Décrivez une situation où vous avez dû respecter un délai très serré. Qu'avez-vous fait ?", type: "behavioral", hint: "Concentrez-vous sur vos actions" },
    { id: "b3", text: "Donnez-moi un exemple d'une fois où vous avez échoué. Qu'en avez-vous appris ?", type: "behavioral", hint: "Soyez honnête, montrez votre progression" },
    { id: "b4", text: "Parlez-moi d'une fois où vous avez dû vous adapter rapidement à un changement majeur au travail.", type: "behavioral" },
    { id: "b5", text: "Décrivez le projet dont vous êtes le plus fier et votre contribution spécifique.", type: "behavioral" },
    { id: "b6", text: "Parlez-moi d'une fois où vous avez dû influencer quelqu'un sans autorité directe.", type: "behavioral" },
  ],
  technical: [
    { id: "t1", text: "Expliquez la différence entre une pile et une file d'attente. Dans quel cas utiliseriez-vous chacune ?", type: "technical" },
    { id: "t2", text: "Quelle est la différence entre les bases de données SQL et NoSQL ? Dans quel cas choisiriez-vous l'une plutôt que l'autre ?", type: "technical" },
    { id: "t3", text: "Expliquez REST vs GraphQL. Quels sont les compromis ?", type: "technical" },
    { id: "t4", text: "Qu'est-ce qu'une condition de course ? Comment la prévenir ?", type: "technical" },
    { id: "t5", text: "Expliquez le théorème CAP dans les systèmes distribués.", type: "technical" },
    { id: "t6", text: "Qu'est-ce que la mémoïsation et quand doit-on l'utiliser ?", type: "technical" },
  ],
  "system-design": [
    { id: "sd1", text: "Concevez un raccourcisseur d'URL comme bit.ly. Expliquez-moi votre architecture.", type: "system-design", hint: "Couvrir : API, stockage, mise à l'échelle, cache" },
    { id: "sd2", text: "Comment concevriez-vous un système de messagerie en temps réel comme WhatsApp ?", type: "system-design" },
    { id: "sd3", text: "Concevez un limiteur de débit pour une API. Quels algorithmes envisageriez-vous ?", type: "system-design" },
    { id: "sd4", text: "Comment concevriez-vous un système de notifications gérant des millions d'utilisateurs ?", type: "system-design" },
    { id: "sd5", text: "Concevez un système d'autocomplétion pour la recherche.", type: "system-design" },
  ],
  coding: [
    { id: "c1", text: "Étant donné un tableau d'entiers, trouvez les deux nombres dont la somme est égale à une cible donnée. Retournez leurs indices.", type: "coding", hint: "Réfléchissez au compromis temps/espace" },
    { id: "c2", text: "Inversez une liste chaînée en place. Quelle est la complexité temporelle et spatiale ?", type: "coding" },
    { id: "c3", text: "Écrivez une fonction pour vérifier si une chaîne est un palindrome valide, en ignorant les caractères non alphanumériques.", type: "coding" },
    { id: "c4", text: "Trouvez la somme maximale d'un sous-tableau (algorithme de Kadane).", type: "coding" },
    { id: "c5", text: "Implémentez une fonction pour vérifier si deux chaînes sont des anagrammes l'une de l'autre.", type: "coding" },
  ],
};

const TYPE_LABELS: Record<InterviewType, string> = {
  behavioral: "Comportemental",
  technical: "Technique",
  "system-design": "Conception système",
  coding: "Programmation",
};

const ROLE_LABELS: Record<InterviewRole, string> = {
  "software-engineer": "Ingénieur logiciel",
  "product-manager": "Chef de produit",
  "data-scientist": "Scientifique des données",
  designer: "Designer",
  other: "Autre",
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
      return { questionId: question.id, score: 0, clarity: 0, relevance: 0, structure: 0, feedback: "Évaluation échouée.", strengths: [], improvements: [] };
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
          <h1 className="text-xl font-semibold">Préparation à l'entretien</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entraînez-vous avec des questions générées par l'IA et obtenez un retour instantané sur vos réponses.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type d'entretien</label>
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
            <label className="text-sm font-medium">Poste visé</label>
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
            <label className="text-sm font-medium">Nombre de questions</label>
            <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} question{n > 1 ? "s" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={startSession} className="w-full gap-2">
          <PlayIcon className="w-4 h-4" />
          Démarrer la session
        </Button>

        {/* Past sessions */}
        {pastSessions.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ChevronRightIcon className={cn("w-4 h-4 transition-transform", showHistory && "rotate-90")} />
              Sessions passées ({pastSessions.length})
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
            <span className="text-xs text-muted-foreground">Question {currentIdx + 1} sur {questions.length}</span>
            <Badge variant="outline" className="ml-2 text-xs">{TYPE_LABELS[interviewType]}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPhase("setup")}>
            <RotateCcwIcon className="w-3 h-3 mr-1" /> Recommencer
          </Button>
        </div>

        <Progress value={progress} className="h-1.5" />

        {/* Question card */}
        <div className="p-5 rounded-xl border bg-card space-y-3">
          <p className="text-base font-medium leading-relaxed">{q.text}</p>
          {q.hint && (
            <p className="text-xs text-muted-foreground italic">💡 Conseil : {q.hint}</p>
          )}
        </div>

        {/* Answer area */}
        <div className="space-y-3">
          <textarea
            className="w-full min-h-32 p-3 rounded-lg border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Tapez votre réponse ici, ou utilisez le bouton micro ci-dessous pour parler..."
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
              {isRecording ? "Arrêter l'enregistrement" : "Enregistrer la réponse"}
            </Button>

            <Button
              onClick={submitAnswer}
              disabled={(!currentAnswer.trim() && !isRecording) || isScoring}
              className="gap-2 ml-auto"
            >
              {isScoring ? (
                <>
                  <ClockIcon className="w-4 h-4 animate-spin" /> Évaluation...
                </>
              ) : currentIdx + 1 >= questions.length ? (
                <>
                  <CheckCircleIcon className="w-4 h-4" /> Terminer
                </>
              ) : (
                <>
                  Suivant <ChevronRightIcon className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Previous scores (folded) */}
        {scores.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Réponses précédentes</p>
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
    <PremiumGate featureName="Préparation à l'entretien">
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Score header */}
      <div className={cn("p-6 rounded-xl border text-center space-y-2", scoreBg(overallScore))}>
        <TrophyIcon className={cn("w-10 h-10 mx-auto", scoreColor(overallScore))} />
        <h2 className="text-2xl font-bold">
          <span className={scoreColor(overallScore)}>{overallScore}</span>
          <span className="text-muted-foreground text-lg">/10</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {overallScore >= 8 ? "Excellente performance ! 🎉" : overallScore >= 6 ? "Bon travail, continuez à vous entraîner !" : "Continuez à vous entraîner — vous y arriverez !"}
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <span>{questions.length} question{questions.length > 1 ? "s" : ""}</span>
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
                  { label: "Clarté", val: s.clarity },
                  { label: "Pertinence", val: s.relevance },
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
                  <p className="text-xs font-medium text-green-700">✓ Points forts</p>
                  {s.strengths.map((st, j) => (
                    <p key={j} className="text-xs text-muted-foreground ml-3">• {st}</p>
                  ))}
                </div>
              )}
              {s.improvements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700">↑ À améliorer</p>
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
          <RotateCcwIcon className="w-4 h-4" /> Nouvelle session
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
          <StarIcon className="w-4 h-4" /> Recommencer les mêmes questions
        </Button>
      </div>
    </div>
    </PremiumGate>
  );
}
