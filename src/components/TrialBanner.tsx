import { useApp } from "@/contexts";
import { GetLicense } from "@/components";

export const TrialBanner = () => {
  const { trialExpired, trialDaysLeft, hasActiveLicense } = useApp();

  if (hasActiveLicense || trialExpired) return null;

  const timeLabel =
    trialDaysLeft <= 1 ? "less than 1 day" : `${trialDaysLeft} days`;

  return (
    <div className="mx-1 mb-2 flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
      <p className="text-xs text-foreground">
        <span className="font-semibold">Free trial — </span>
        {timeLabel} remaining. Get a license to keep full access.
      </p>
      <GetLicense buttonText="Get License" buttonClassName="h-6 text-[10px] lg:text-xs shrink-0" />
    </div>
  );
};
