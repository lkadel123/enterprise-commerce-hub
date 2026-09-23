import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { DateLabel } from "@/components/common/DateLabel";
import { apiErrorMessage } from "@/lib/api/client";
import { supportApi } from "@/lib/api/support";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import {
  useConversationMessagesQuery,
  useConversationQuery,
  useDeleteConversationMutation,
  useSendMessageMutation,
  useUpdateConversationStatusMutation,
} from "@/features/account/account-hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

/**
 * `/account/support/$conversationId` — conversation thread.
 *
 * Message thread with sender distinction (customer vs agent/system),
 * accessible composer (≤5000 chars with live count), permitted customer
 * status transitions, mark-read on open, and delete-with-confirmation.
 * Ownership is enforced server-side; another customer's id → 404.
 */
export const Route = createFileRoute("/account/support/$conversationId")({
  component: SupportThreadPage,
});

function SupportThreadPage() {
  const { conversationId } = Route.useParams();
  const authReady = useCustomerAuthReady();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const conversation = useConversationQuery(conversationId);
  const messages = useConversationMessagesQuery(conversationId);
  const sendMessage = useSendMessageMutation();
  const updateStatus = useUpdateConversationStatusMutation();
  const deleteConversation = useDeleteConversationMutation();

  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const markedReadRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Mark the thread read once after it loads (idempotent guard).
  useEffect(() => {
    if (!authReady || !conversation.isSuccess || markedReadRef.current) return;
    markedReadRef.current = true;
    void supportApi.markConversationRead(conversationId).catch(() => {
      /* best-effort */
    });
  }, [authReady, conversation.isSuccess, conversationId]);

  // Keep the newest message in view when the thread updates.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.data?.length]);

  if (conversation.isPending) {
    return (
      <div role="status" aria-busy="true">
        <LoadingSkeleton count={2} />
      </div>
    );
  }

  if (conversation.isError || !conversation.data) {
    return (
      <ErrorState
        error={conversation.error}
        title="Unable to load this conversation"
        description="The conversation may not exist, or it may belong to another account."
        onRetry={() => void conversation.refetch()}
      />
    );
  }

  const thread = conversation.data;

  const send = () => {
    const text = draft.trim();
    if (text.length === 0 || sendMessage.isPending) return;
    sendMessage.mutate(
      { conversationId, message: text },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  const canChangeStatus =
    thread.status === "open" || thread.status === "in_progress" || thread.status === "resolved";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold">{thread.subject}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{thread.status}</Badge>
            <Badge variant="outline">{thread.priority}</Badge>
            {thread.category ? <Badge variant="outline">{thread.category}</Badge> : null}
            {thread.relatedOrderId ? (
              <Link
                to="/account/orders/$orderId"
                params={{ orderId: thread.relatedOrderId }}
                className="text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Related order
              </Link>
            ) : null}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          aria-label="Delete conversation"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Button asChild variant="outline" size="sm" className="min-h-[44px]">
        <Link to="/account/support" search={{ relatedOrderId: undefined }}>
          Back to support
        </Link>
      </Button>

      {/* Message thread */}
      <div aria-live="polite" aria-busy={messages.isPending}>
        {messages.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading messages…
          </p>
        ) : messages.isError ? (
          <ErrorState
            error={messages.error}
            title="Unable to load messages"
            onRetry={() => void messages.refetch()}
          />
        ) : messages.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="space-y-3 rounded-md border p-4">
            {messages.data.map((msg) => (
              <li
                key={msg.id}
                className={
                  "max-w-[85%] rounded-md border p-3 text-sm " +
                  (msg.senderType === "customer" ? "ml-auto bg-accent/40" : "bg-card")
                }
              >
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {msg.senderType === "customer"
                      ? "You"
                      : msg.senderType === "agent"
                        ? "Support team"
                        : "System"}
                  </span>
                  <DateLabel date={msg.createdAt} />
                </p>
                <p className="mt-1 break-words whitespace-pre-wrap">{msg.message}</p>
              </li>
            ))}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      {/* Composer */}
      {thread.status !== "closed" ? (
        <form
          className="rounded-md border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          noValidate
          aria-busy={sendMessage.isPending}
        >
          <Label htmlFor="reply-message">Reply</Label>
          <textarea
            id="reply-message"
            className="mt-1 min-h-[100px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft}
            maxLength={5000}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby="reply-message-count"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p id="reply-message-count" className="text-xs text-muted-foreground">
              {draft.length}/5000 characters
            </p>
            <Button
              type="submit"
              className="min-h-[44px]"
              disabled={sendMessage.isPending || draft.trim().length === 0}
              aria-busy={sendMessage.isPending}
            >
              {sendMessage.isPending ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          This conversation is closed. Open a new support request if you still need help.
        </p>
      )}

      {/* Customer-permitted status transitions */}
      {canChangeStatus ? (
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-medium">Conversation status</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["open", "in_progress", "resolved"] as const).map((status) => (
              <Button
                key={status}
                variant={thread.status === status ? "default" : "outline"}
                size="sm"
                className="min-h-[44px]"
                disabled={thread.status === status || updateStatus.isPending}
                aria-busy={updateStatus.isPending}
                onClick={() =>
                  updateStatus.mutate(
                    { conversationId, status },
                    {
                      onSuccess: () => toast.success(`Status set to ${status}.`),
                      onError: (err) => toast.error(apiErrorMessage(err)),
                    },
                  )
                }
              >
                {status === "in_progress"
                  ? "In progress"
                  : status === "resolved"
                    ? "Resolved"
                    : "Reopen"}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>Delete “{thread.subject}”? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="min-h-[44px]"
              disabled={deleteConversation.isPending}
              aria-busy={deleteConversation.isPending}
              onClick={() =>
                deleteConversation.mutate(conversationId, {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({ queryKey: ["support"] });
                    toast.success("Conversation deleted.");
                    void navigate({
                      to: "/account/support",
                      search: { relatedOrderId: undefined },
                    });
                  },
                  onError: (err) => toast.error(apiErrorMessage(err)),
                })
              }
            >
              {deleteConversation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
