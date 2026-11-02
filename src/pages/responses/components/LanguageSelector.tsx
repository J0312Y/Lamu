import { Header, Selection } from "@/components";
import { LANGUAGES } from "@/lib";
import { useApp } from "@/contexts";
import { updateLanguage } from "@/lib/storage/response-settings.storage";
import { useState, useEffect, useMemo } from "react";
import { getResponseSettings } from "@/lib";

export const LanguageSelector = () => {
  const { isBlocked } = useApp();
  const locked = isBlocked;
  const [selectedLanguage, setSelectedLanguage] = useState<string>("english");

  useEffect(() => {
    const settings = getResponseSettings();
    setSelectedLanguage(settings.language);
  }, []);

  const handleLanguageChange = (languageId: string) => {
    if (locked) {
      return;
    }
    setSelectedLanguage(languageId);
    updateLanguage(languageId);
  };

  const languageOptions = useMemo(() => {
    return LANGUAGES.map((lang) => ({
      label: `${lang.flag} ${lang.name}`,
      value: lang.id,
    }));
  }, []);

  return (
    <div className="space-y-4">
      <Header
        title="Langue des réponses"
        description="Sélectionnez la langue des réponses IA. Ce paramètre s'applique globalement à tous les fournisseurs et conversations. La prise en charge des langues peut varier selon le fournisseur LLM sélectionné"
        isMainTitle
      />

      <div className="max-w-md">
        <Selection
          selected={selectedLanguage}
          onChange={handleLanguageChange}
          options={languageOptions}
          placeholder="Sélectionner une langue"
          disabled={locked}
        />
      </div>
    </div>
  );
};
