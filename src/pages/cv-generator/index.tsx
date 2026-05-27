import { useState, useCallback } from "react";
import { PageLayout } from "@/layouts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileTextIcon,
  MailIcon,
  Loader2Icon,
  CopyIcon,
  CheckCircleIcon,
  DownloadIcon,
  SparklesIcon,
} from "lucide-react";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { useApp } from "@/contexts";
import { PremiumGate } from "@/components";
import { exportAsMarkdown } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";

type Output = { cvSummary: string; coverLetter: string } | null;

const CvGenerator = () => {
  const { selectedAIProvider, allAiProviders, lamuApiEnabled } = useApp();
  const [jobDescription, setJobDescription] = useState("");
  const [background, setBackground] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<Output>(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<"cv" | "letter" | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!jobDescription.trim() || !background.trim()) return;
    setGenerating(true);
    setError("");
    setOutput(null);

    const langInstruction = language === "fr"
      ? "Réponds entièrement en français."
      : "Reply entirely in English.";

    const prompt = `${langInstruction}

Tu es un expert en rédaction de CV et lettres de motivation. À partir des informations ci-dessous, génère :
1. Un résumé professionnel percutant pour le CV (4-6 lignes, adapté à l'offre)
2. Une lettre de motivation complète et personnalisée (3-4 paragraphes)

Retourne UNIQUEMENT un objet JSON valide (sans texte autour) :
{"cvSummary":"<résumé CV>","coverLetter":"<lettre de motivation complète>"}

Utilise \\n pour les sauts de ligne.

--- Offre d'emploi ---
${jobDescription}

--- Background du candidat ---
${background}`;

    try {
      const provider = allAiProviders.find((p: any) => p.id === selectedAIProvider.provider);

      let raw = "";
      for await (const chunk of fetchAIResponse({
        provider: lamuApiEnabled ? undefined : provider,
        selectedProvider: selectedAIProvider,
        systemPrompt: "Tu es un expert en rédaction de CV et lettres de motivation professionnelles.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) {
        raw += chunk;
      }

      // Strip markdown code fences if present
      const stripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Réponse invalide de l'IA. Réponse reçue :\n${raw.slice(0, 300)}`);
      }
      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error(`JSON invalide dans la réponse :\n${jsonMatch[0].slice(0, 300)}`);
      }
      if (!parsed.cvSummary || !parsed.coverLetter) throw new Error("Contenu manquant dans la réponse JSON");

      setOutput({
        cvSummary: parsed.cvSummary.replace(/\\n/g, "\n"),
        coverLetter: parsed.coverLetter.replace(/\\n/g, "\n"),
      });
    } catch (e: any) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [jobDescription, background, language, selectedAIProvider, allAiProviders]);

  const handleCopy = async (key: "cv" | "letter") => {
    const text = key === "cv" ? output?.cvSummary : output?.coverLetter;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <PageLayout
      title="CV & Lettre de motivation"
      description="Générez un résumé de CV et une lettre de motivation personnalisés pour une offre d'emploi."
    >
      <PremiumGate featureName="CV & Cover Letter Generator">
      <div className="space-y-6 max-w-3xl">
        {/* Language toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Langue :</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["fr", "en"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  language === lang
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {lang === "fr" ? "Français" : "English"}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <FileTextIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Description du poste
            </Label>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Collez l'offre d'emploi ici..."
              className="min-h-[180px] text-xs resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <MailIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Votre profil / background
            </Label>
            <Textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder={`Expériences, compétences, formation, projets...\nExemple:\n- 5 ans développeur React/TypeScript\n- Lead technique chez Startup XYZ\n- Passionné par l'IA et les outils DevOps`}
              className="min-h-[180px] text-xs resize-none"
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !jobDescription.trim() || !background.trim()}
          className="gap-2"
        >
          {generating ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SparklesIcon className="w-4 h-4" />
          )}
          {generating ? "Génération en cours..." : "Générer"}
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Output */}
        {output && (
          <Tabs defaultValue="cv" className="space-y-3">
            <TabsList className="h-8">
              <TabsTrigger value="cv" className="text-xs gap-1.5">
                <FileTextIcon className="w-3 h-3" />
                Résumé CV
              </TabsTrigger>
              <TabsTrigger value="letter" className="text-xs gap-1.5">
                <MailIcon className="w-3 h-3" />
                Lettre de motivation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cv" className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Résumé professionnel pour votre CV</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCopy("cv")}
                  >
                    {copiedKey === "cv"
                      ? <CheckCircleIcon className="w-3 h-3 text-green-500" />
                      : <CopyIcon className="w-3 h-3" />}
                    {copiedKey === "cv" ? "Copié" : "Copier"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => exportAsMarkdown("Resume_Summary", output.cvSummary)}
                  >
                    <DownloadIcon className="w-3 h-3" />
                    .md
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {output.cvSummary}
              </div>
            </TabsContent>

            <TabsContent value="letter" className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Lettre de motivation complète</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCopy("letter")}
                  >
                    {copiedKey === "letter"
                      ? <CheckCircleIcon className="w-3 h-3 text-green-500" />
                      : <CopyIcon className="w-3 h-3" />}
                    {copiedKey === "letter" ? "Copié" : "Copier"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => exportAsMarkdown("Cover_Letter", output.coverLetter)}
                  >
                    <DownloadIcon className="w-3 h-3" />
                    .md
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {output.coverLetter}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
      </PremiumGate>
    </PageLayout>
  );
};

export default CvGenerator;
