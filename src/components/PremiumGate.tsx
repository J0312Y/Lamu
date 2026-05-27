import { LockIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { GetLicense } from "./GetLicense";
import { ReactNode } from "react";

interface PremiumGateProps {
  children: ReactNode;
  featureName?: string;
}

export const PremiumGate = ({ children, featureName }: PremiumGateProps) => {
  const { isPremiumBlocked } = useApp();

  if (!isPremiumBlocked) return <>{children}</>;

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* Blurred background */}
      <div className="pointer-events-none select-none opacity-20 blur-sm">
        {children}
      </div>

      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-background/95 border border-border rounded-2xl shadow-lg p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-4 text-center">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
            <LockIcon className="size-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              {featureName ? `${featureName} requires a license` : "License required"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Your free trial has ended. Get a license to unlock all premium features.
            </p>
          </div>
          <GetLicense buttonText="Get License" buttonClassName="w-full" />
        </div>
      </div>
    </div>
  );
};
