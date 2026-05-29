import { useState, useCallback } from "react";
import { PageLayout } from "@/layouts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  UserIcon,
  PhoneIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  WrenchIcon,
  StarIcon,
} from "lucide-react";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { useApp } from "@/contexts";
import { PremiumGate } from "@/components";
import { exportAsMarkdown } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";

interface CvOutput {
  fullName: string;
  title: string;
  contact: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  languages?: string;
  certifications?: string;
}

type Output = { cv: CvOutput; coverLetter: string } | null;

const CvGenerator = () => {
  const { selectedAIProvider, allAiProviders, lamuApiEnabled } = useApp();
  const [jobDescription, setJobDescription] = useState("");
  const [background, setBackground] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<Output>(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<"cv" | "letter" | null>(null);

  const buildCvMarkdown = (cv: CvOutput) => {
    let md = `# ${cv.fullName}\n`;
    if (cv.title) md += `**${cv.title}**\n\n`;
    if (cv.contact) md += `${cv.contact}\n\n`;
    md += `---\n\n`;
    if (cv.summary) md += `## Profil\n${cv.summary}\n\n`;
    if (cv.experience) md += `## Expérience professionnelle\n${cv.experience}\n\n`;
    if (cv.education) md += `## Formation\n${cv.education}\n\n`;
    if (cv.skills) md += `## Compétences\n${cv.skills}\n\n`;
    if (cv.languages) md += `## Langues\n${cv.languages}\n\n`;
    if (cv.certifications) md += `## Certifications\n${cv.certifications}\n\n`;
    return md.trim();
  };

  const handleGenerate = useCallback(async () => {
    if (!jobDescription.trim() || !background.trim()) return;
    setGenerating(true);
    setError("");
    setOutput(null);

    const langInstruction = language === "fr"
      ? "Réponds entièrement en français."
      : "Reply entirely in English.";

    const contactInfo = [fullName, email, phone].filter(Boolean).join(" | ");

    const prompt = `${langInstruction}

Tu es un expert en rédaction de CV professionnels et lettres de motivation. À partir des informations ci-dessous, génère un CV COMPLET et structuré + une lettre de motivation.

Le CV doit contenir :
- fullName : nom complet du candidat${fullName ? ` (utilise "${fullName}")` : ""}
- title : titre professionnel adapté à l'offre (ex: "Développeur Full-Stack Senior", "Chef de Projet Digital")
- contact : coordonnées${contactInfo ? ` (utilise "${contactInfo}")` : " (laisse vide si non fourni)"}
- summary : profil professionnel percutant de 4-6 lignes, adapté à l'offre
- experience : expériences professionnelles détaillées, avec pour chaque poste : titre, entreprise, dates, et 3-5 réalisations concrètes avec des résultats chiffrés quand possible. Utilise des tirets (-) pour les bullet points.
- education : formations et diplômes avec établissement et dates
- skills : compétences techniques et soft skills organisées par catégorie, séparées par des virgules
- languages : langues parlées avec niveau (optionnel, si mentionné dans le background)
- certifications : certifications obtenues (optionnel, si mentionné dans le background)

La lettre de motivation doit :
- Être complète (4-5 paragraphes)
- Personnalisée pour l'offre
- Mentionner des réalisations concrètes du candidat
- Montrer la motivation et l'adéquation avec le poste

IMPORTANT : Invente des détails réalistes si le candidat ne donne que des informations partielles. Enrichis les expériences avec des métriques et réalisations concrètes.

Retourne UNIQUEMENT un objet JSON valide (sans texte autour, sans markdown) :
{"cv":{"fullName":"...","title":"...","contact":"...","summary":"...","experience":"...","education":"...","skills":"...","languages":"...","certifications":"..."},"coverLetter":"..."}

Utilise \\n pour les sauts de ligne dans chaque champ.

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
        systemPrompt: "Tu es un expert en rédaction de CV professionnels complets et lettres de motivation. Tu produis des CV détaillés et structurés, pas juste des résumés.",
        history: [],
        userMessage: prompt,
        imagesBase64: [],
      })) {
        raw += chunk;
      }

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
      if (!parsed.cv || !parsed.coverLetter) throw new Error("Contenu manquant dans la réponse JSON");

      const cleanField = (v: string) => (v || "").replace(/\\n/g, "\n");

      setOutput({
        cv: {
          fullName: cleanField(parsed.cv.fullName),
          title: cleanField(parsed.cv.title),
          contact: cleanField(parsed.cv.contact),
          summary: cleanField(parsed.cv.summary),
          experience: cleanField(parsed.cv.experience),
          education: cleanField(parsed.cv.education),
          skills: cleanField(parsed.cv.skills),
          languages: cleanField(parsed.cv.languages || ""),
          certifications: cleanField(parsed.cv.certifications || ""),
        },
        coverLetter: cleanField(parsed.coverLetter),
      });
    } catch (e: any) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [jobDescription, background, fullName, email, phone, language, selectedAIProvider, allAiProviders, lamuApiEnabled]);

  const handleCopy = async (key: "cv" | "letter") => {
    if (!output) return;
    const text = key === "cv" ? buildCvMarkdown(output.cv) : output.coverLetter;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const SectionBlock = ({ icon: Icon, title, content }: { icon: any; title: string; content: string }) => {
    if (!content) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed pl-5">
          {content}
        </div>
      </div>
    );
  };

  return (
    <PageLayout
      title="CV & Lettre de motivation"
      description="Générez un CV professionnel complet et une lettre de motivation personnalisés pour une offre d'emploi."
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

        {/* Personal info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <UserIcon className="w-3 h-3 text-muted-foreground" />
              Nom complet
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jean Dupont"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <MailIcon className="w-3 h-3 text-muted-foreground" />
              Email
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean@email.com"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <PhoneIcon className="w-3 h-3 text-muted-foreground" />
              Téléphone
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="h-8 text-xs"
            />
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
              <BriefcaseIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Votre profil / expériences
            </Label>
            <Textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder={`Décrivez vos expériences, compétences, formation...\nExemple:\n- 5 ans développeur React/TypeScript chez ABC Corp\n- Lead technique chez Startup XYZ (2022-2024)\n- Master Informatique, Université de Paris\n- Certifié AWS Solutions Architect\n- Français natif, Anglais courant`}
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
          {generating ? "Génération en cours..." : "Générer le CV & la Lettre"}
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
                CV complet
              </TabsTrigger>
              <TabsTrigger value="letter" className="text-xs gap-1.5">
                <MailIcon className="w-3 h-3" />
                Lettre de motivation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cv" className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">CV professionnel généré par IA</span>
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
                    onClick={() => exportAsMarkdown(`CV_${output.cv.fullName.replace(/\s+/g, "_")}`, buildCvMarkdown(output.cv))}
                  >
                    <DownloadIcon className="w-3 h-3" />
                    .md
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-4">
                {/* Header */}
                <div className="text-center border-b border-border pb-3 space-y-1">
                  <h2 className="text-lg font-bold">{output.cv.fullName}</h2>
                  {output.cv.title && <p className="text-sm text-primary font-medium">{output.cv.title}</p>}
                  {output.cv.contact && <p className="text-xs text-muted-foreground">{output.cv.contact}</p>}
                </div>

                {/* Sections */}
                <SectionBlock icon={UserIcon} title="Profil" content={output.cv.summary} />
                <SectionBlock icon={BriefcaseIcon} title="Expérience professionnelle" content={output.cv.experience} />
                <SectionBlock icon={GraduationCapIcon} title="Formation" content={output.cv.education} />
                <SectionBlock icon={WrenchIcon} title="Compétences" content={output.cv.skills} />
                {output.cv.languages && (
                  <SectionBlock icon={StarIcon} title="Langues" content={output.cv.languages} />
                )}
                {output.cv.certifications && (
                  <SectionBlock icon={CheckCircleIcon} title="Certifications" content={output.cv.certifications} />
                )}
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
                    onClick={() => exportAsMarkdown("Lettre_de_motivation", output.coverLetter)}
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
