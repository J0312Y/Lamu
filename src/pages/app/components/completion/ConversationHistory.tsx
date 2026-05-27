import { useState } from "react";
import { ClockIcon, Search, MessageSquare, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Input,
} from "@/components";
import { useHistory } from "@/hooks";
import { ChatConversation } from "@/types/completion";
import moment from "moment";

interface ConversationHistoryProps {
  loadConversation: (conversation: ChatConversation) => void;
  startNewConversation: () => void;
  currentConversationId: string | null;
  onOpenChange?: (open: boolean) => void;
}

export const ConversationHistory = ({
  loadConversation,
  startNewConversation,
  currentConversationId,
  onOpenChange,
}: ConversationHistoryProps) => {
  const [open, setOpen] = useState(false);
  const {
    conversations,
    search,
    setSearch,
    refreshConversations,
    isLoading,
  } = useHistory();

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) refreshConversations();
    setOpen(isOpen);
    onOpenChange?.(isOpen);
  };

  const handleSelect = (conversation: ChatConversation) => {
    loadConversation(conversation);
    setOpen(false);
    onOpenChange?.(false);
  };

  const handleNewChat = () => {
    startNewConversation();
    setOpen(false);
    onOpenChange?.(false);
  };

  const filtered = conversations
    .filter(
      (c) =>
        search.trim() === "" ||
        c.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label="Browse conversation history"
          title="Conversation history"
          className="cursor-pointer w-7 h-7 flex-shrink-0"
        >
          <ClockIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        className="w-screen p-0 mt-3 border overflow-hidden border-input/50"
      >
        {/* Header */}
        <div className="border-b border-input/50 px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Conversation History</h2>
            <p className="text-[10px] text-muted-foreground">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleNewChat} className="text-xs h-7">
            <Plus className="h-3 w-3" />
            New Chat
          </Button>
        </div>

        {/* Search */}
        <div className="px-2 py-2 border-b border-input/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* List */}
        <ScrollArea className="h-64">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {search
                ? "No conversations match your search."
                : "No conversations yet. Start chatting!"}
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((convo) => {
                const isActive = convo.id === currentConversationId;
                return (
                  <button
                    key={convo.id}
                    onClick={() => handleSelect(convo)}
                    className={`w-full text-left rounded-lg px-3 py-2 flex items-start gap-2.5 transition-colors hover:bg-accent ${
                      isActive ? "bg-primary/10" : ""
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-snug">
                        {convo.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {moment(convo.updatedAt).fromNow()} ·{" "}
                        {convo.messages.length} message
                        {convo.messages.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {isActive && (
                      <span className="text-[10px] text-primary font-medium flex-shrink-0 mt-0.5">
                        active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
