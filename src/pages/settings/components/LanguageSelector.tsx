import { useTranslation } from "react-i18next";
import { safeLocalStorage } from "@/lib";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

export const LanguageSelector = () => {
  const { i18n, t } = useTranslation();

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    safeLocalStorage.setItem("lamu_language", code);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{t("settings.language")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
      </div>
      <div className="flex gap-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => handleChange(lang.code)}
            className={`px-4 py-2 rounded-md text-sm border transition-all ${
              i18n.language === lang.code
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent"
            }`}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </div>
  );
};
