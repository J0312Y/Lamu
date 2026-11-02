import {
  Settings,
  Code,
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  SquareSlashIcon,
  MonitorIcon,
  HomeIcon,
  PowerIcon,
  MailIcon,
  GlobeIcon,
  BugIcon,
  MessageSquareTextIcon,
  BookOpenIcon,
  ActivityIcon,
  BriefcaseIcon,
  HistoryIcon,
  FileTextIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";

export const useMenuItems = () => {
  const { hasPlanFeature } = useApp();

  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
  }[] = [
    {
      icon: HomeIcon,
      label: "Tableau de bord",
      href: "/dashboard",
    },
    {
      icon: MessagesSquare,
      label: "Conversations",
      href: "/chats",
    },
    {
      icon: WandSparkles,
      label: "Prompts système",
      href: "/system-prompts",
    },
    {
      icon: Settings,
      label: "Paramètres",
      href: "/settings",
    },
    {
      icon: MessageSquareTextIcon,
      label: "Réponses",
      href: "/responses",
    },
    {
      icon: MonitorIcon,
      label: "Capture d'écran",
      href: "/screenshot",
    },
    {
      icon: AudioLinesIcon,
      label: "Audio",
      href: "/audio",
    },
    {
      icon: SquareSlashIcon,
      label: "Curseur & Raccourcis",
      href: "/shortcuts",
    },

    {
      icon: BookOpenIcon,
      label: "Base de connaissances",
      href: "/knowledge",
    },
    {
      icon: ActivityIcon,
      label: "Activité KB",
      href: "/activity",
    },
    {
      icon: MailIcon,
      label: "Email",
      href: "/email",
    },
    {
      icon: BriefcaseIcon,
      label: "Prépa entretien",
      href: "/interview-prep",
    },
    {
      icon: HistoryIcon,
      label: "Sessions",
      href: "/sessions",
    },
    {
      icon: FileTextIcon,
      label: "CV & Lettre de motivation",
      href: "/cv-generator",
    },
    {
      icon: Code,
      label: "Espace dev",
      href: "/dev-space",
    },
  ];

  const footerItems = [
    ...(hasPlanFeature("contact_support")
      ? [
          {
            icon: MailIcon,
            label: "Contacter le support",
            href: "mailto:support@lamuka-tech.com",
          },
        ]
      : []),
    {
      icon: BugIcon,
      label: "Signaler un bug",
      href: "mailto:support@lamuka-tech.com",
    },
    {
      icon: PowerIcon,
      label: "Quitter Lamu",
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  const footerLinks: {
    title: string;
    icon: React.ElementType;
    link: string;
  }[] = [
    {
      title: "Site web",
      icon: GlobeIcon,
      link: "https://lamu.lamuka-tech.com",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
