import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import {
  Dashboard,
  App,
  SystemPrompts,
  ViewChat,
  Settings,
  DevSpace,
  Shortcuts,
  Audio,
  Screenshot,
  Chats,
  Responses,
  KnowledgeBase,
  Activity,
  Email,
  InterviewPrep,
  Sessions,
  CvGenerator,
} from "@/pages";
import { DashboardLayout } from "@/layouts";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/system-prompts" element={<SystemPrompts />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/screenshot" element={<Screenshot />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/responses" element={<Responses />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/dev-space" element={<DevSpace />} />
          <Route path="/email" element={<Email />} />
          <Route path="/interview-prep" element={<InterviewPrep />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/cv-generator" element={<CvGenerator />} />
        </Route>
      </Routes>
    </Router>
  );
}
