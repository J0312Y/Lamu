import { cn } from "@/lib/utils";
import {
  SmileIcon,
  MehIcon,
  FrownIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
} from "lucide-react";

export type Sentiment = "positive" | "neutral" | "negative";

export interface SentimentData {
  overall: Sentiment;
  score: number; // -1 to 1
  trend: "improving" | "stable" | "declining";
  keywords: string[];
}

interface SentimentIndicatorProps {
  data: SentimentData | null;
  compact?: boolean;
}

const sentimentConfig = {
  positive: { icon: SmileIcon, color: "text-green-500", bg: "bg-green-500/10", label: "Positif" },
  neutral: { icon: MehIcon, color: "text-amber-500", bg: "bg-amber-500/10", label: "Neutre" },
  negative: { icon: FrownIcon, color: "text-red-500", bg: "bg-red-500/10", label: "Négatif" },
};

const trendConfig = {
  improving: { icon: TrendingUpIcon, color: "text-green-500", label: "En hausse" },
  stable: { icon: MinusIcon, color: "text-muted-foreground", label: "Stable" },
  declining: { icon: TrendingDownIcon, color: "text-red-500", label: "En baisse" },
};

export const SentimentIndicator = ({ data, compact }: SentimentIndicatorProps) => {
  if (!data) return null;

  const s = sentimentConfig[data.overall];
  const t = trendConfig[data.trend];
  const Icon = s.icon;
  const TrendIcon = t.icon;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]", s.bg, s.color)} title={`${s.label} (${(data.score * 100).toFixed(0)}%) — ${t.label}`}>
        <Icon className="w-3 h-3" />
        <TrendIcon className="w-2.5 h-2.5" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border/50 p-2.5 space-y-1.5", s.bg)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", s.color)} />
        <span className={cn("text-xs font-semibold", s.color)}>{s.label}</span>
        <div className="flex items-center gap-1 ml-auto">
          <TrendIcon className={cn("w-3 h-3", t.color)} />
          <span className={cn("text-[10px]", t.color)}>{t.label}</span>
        </div>
      </div>
      {data.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.keywords.slice(0, 5).map((kw) => (
            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 text-muted-foreground">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
