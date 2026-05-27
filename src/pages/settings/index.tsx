import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  ConversationSync,
  UserProfile,
} from "./components";
import { LanguageSelector } from "./components/LanguageSelector";
import { PageLayout } from "@/layouts";

const Settings = () => {
  return (
    <PageLayout title="Settings" description="Manage your settings">
      {/* User Profile */}
      <UserProfile />

      {/* Theme */}
      <Theme />

      {/* Language */}
      <LanguageSelector />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />

      {/* Conversation Sync */}
      <ConversationSync />
    </PageLayout>
  );
};

export default Settings;
