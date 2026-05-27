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
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: MessagesSquare,
      label: "Chats",
      href: "/chats",
    },
    {
      icon: WandSparkles,
      label: "System prompts",
      href: "/system-prompts",
    },
    {
      icon: Settings,
      label: "App Settings",
      href: "/settings",
    },
    {
      icon: MessageSquareTextIcon,
      label: "Responses",
      href: "/responses",
    },
    {
      icon: MonitorIcon,
      label: "Screenshot",
      href: "/screenshot",
    },
    {
      icon: AudioLinesIcon,
      label: "Audio",
      href: "/audio",
    },
    {
      icon: SquareSlashIcon,
      label: "Cursor & Shortcuts",
      href: "/shortcuts",
    },

    {
      icon: BookOpenIcon,
      label: "Knowledge Base",
      href: "/knowledge",
    },
    {
      icon: ActivityIcon,
      label: "KB Activity",
      href: "/activity",
    },
    {
      icon: MailIcon,
      label: "Email",
      href: "/email",
    },
    {
      icon: BriefcaseIcon,
      label: "Interview Prep",
      href: "/interview-prep",
    },
    {
      icon: HistoryIcon,
      label: "Sessions",
      href: "/sessions",
    },
    {
      icon: FileTextIcon,
      label: "CV & Cover Letter",
      href: "/cv-generator",
    },
    {
      icon: Code,
      label: "Dev space",
      href: "/dev-space",
    },
  ];

  const footerItems = [
    ...(hasPlanFeature("contact_support")
      ? [
          {
            icon: MailIcon,
            label: "Contact Support",
            href: "mailto:support@lamuka-tech.com",
          },
        ]
      : []),
    {
      icon: BugIcon,
      label: "Report a bug",
      href: "mailto:support@lamuka-tech.com",
    },
    {
      icon: PowerIcon,
      label: "Quit Lamu",
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
      title: "Website",
      icon: GlobeIcon,
      link: "https://lamuka.com",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
