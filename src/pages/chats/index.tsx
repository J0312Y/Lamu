import { Badge, Input, Card, Empty, Button } from "@/components";
import { useHistory } from "@/hooks";
import { PageLayout } from "@/layouts";
import { MessageCircleIcon, Search, PlusIcon } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const conversations = useHistory();
  const navigate = useNavigate();
  // Group conversations by date
  const groupedConversations = conversations.conversations.reduce(
    (acc, doc) => {
      const dateKey = moment(doc.updatedAt).format("YYYY-MM-DD");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(doc);
      return acc;
    },
    {} as Record<string, typeof conversations.conversations>
  );

  // Sort dates in descending order (most recent first)
  const sortedDates = Object.keys(groupedConversations).sort((a, b) =>
    moment(b).diff(moment(a))
  );

  const handleNewConversation = () => {
    const id = crypto.randomUUID();
    navigate(`/chats/view/${id}`);
  };

  return (
    <PageLayout
      title="Toutes les conversations"
      description="Consultez toutes vos conversations"
      rightSlot={
        <Button onClick={handleNewConversation} className="h-8 text-sm gap-1.5">
          <PlusIcon className="size-4" />
          Nouvelle conversation
        </Button>
      }
    >
      <>
        {conversations.conversations.length === 0 ? (
          <Empty
            isLoading={conversations.isLoading}
            icon={MessageCircleIcon}
            title="Aucune conversation trouvée"
            description="Commencez une nouvelle conversation pour démarrer"
            action={
              <Button onClick={handleNewConversation} className="mt-3 gap-1.5">
                <PlusIcon className="size-4" />
                Démarrer une conversation
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <div className="relative mb-4 w-1/3">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher des conversations…"
                className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={conversations.search}
                onChange={(e) => conversations.setSearch(e.target.value)}
              />
            </div>
            {sortedDates
              .filter((dateKey) =>
                conversations?.search?.length === 0
                  ? true
                  : groupedConversations?.[dateKey]?.some((doc) =>
                      doc?.title
                        .toLowerCase()
                        .includes(conversations?.search?.toLowerCase() || "")
                    )
              )
              .map((dateKey) => (
                <div key={dateKey} className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground select-none font-medium">
                    {moment(dateKey).format("ddd, MMM D")}
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((doc) => (
                      <Card
                        key={doc.id}
                        className="shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer"
                        onClick={() => navigate(`/chats/view/${doc.id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="line-clamp-1 text-sm mr-8">
                            {doc.title}
                          </p>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.messages.length} message{doc.messages.length !== 1 ? "s" : ""}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {moment(doc.updatedAt).format("hh:mm A")}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </>
    </PageLayout>
  );
};

export default Dashboard;
