import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { DateLabel } from "@/components/common/DateLabel";
import { apiErrorMessage } from "@/lib/api/client";
import { ordersApi } from "@/lib/api/orders";
import { useCustomerAuthReady } from "@/lib/auth/CustomerAuthContext";
import {
  useConversationsQuery,
  useCreateConversationMutation,
} from "@/features/account/account-hooks";

/**
 * `/account/support` — support conversation list + new-conversation dialog.
 *
 * The "related order" picker lists ONLY the customer's own recent orders;
 * ownership is re-validated server-side. `customerId` and `senderType` are
 * never sent — both are server-controlled.
 *
 * Optional `?relatedOrderId=` search pre-selects the related order (e.g. when
 * arriving from the order detail "Help with this order" action) so a support
 * request is associated with the correct order without emailing any identity.
 */
export const Route = createFileRoute("/account/support/")({
  validateSearch: (search: Record<string, unknown>) => ({
    relatedOrderId:
      typeof search.relatedOrderId === "string" && search.relatedOrderId.length > 0
        ? search.relatedOrderId
        : undefined,
  }),
  component: SupportPage,
});

function SupportPage() {
  const authReady = useCustomerAuthReady();
  const conversations = useConversationsQuery();
  const createConversation = useCreateConversationMutation();
  const search = Route.useSearch();

  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  // Pre-select an order passed via ?relatedOrderId= (e.g. from order detail).
  const [relatedOrderId, setRelatedOrderId] = useState(search.relatedOrderId ?? "");
  const [message, setMessage] = useState("");

  const myOrders = useQuery({
    queryKey: ["orders", "for-support"],
    queryFn: async () => (await ordersApi.list({ page: 1, pageSize: 20 })).data,
    enabled: authReady && open,
  });

  const submit = () => {
    if (
      subject.trim().length === 0 ||
      message.trim().length === 0 ||
      createConversation.isPending
    ) {
      return;
    }
    createConversation.mutate(
      {
        subject: subject.trim(),
        priority,
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(relatedOrderId ? { relatedOrderId } : {}),
        initialMessage: message.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Support request submitted.");
          setOpen(false);
          setSubject("");
          setCategory("");
          setPriority("normal");
          setRelatedOrderId("");
          setMessage("");
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  };

  const items = conversations.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Support</h2>
        <Button className="min-h-[44px]" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New request
        </Button>
      </div>

      {conversations.isPending ? (
        <div role="status">
          <LoadingSkeleton count={2} />
        </div>
      ) : conversations.isError ? (
        <ErrorState
          error={conversations.error}
          title="Unable to load your support requests"
          onRetry={() => void conversations.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="h-10 w-10" />}
          title="No support requests"
          description="Need help with an order or product? Open a conversation with our team."
          action={
            <Button onClick={() => setOpen(true)} className="min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" /> Start a conversation
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/account/support/$conversationId"
                params={{ conversationId: conversation.id }}
                className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 p-4 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block break-words font-medium">{conversation.subject}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Updated <DateLabel date={conversation.lastMessageAt} />
                    {conversation.category ? ` · ${conversation.category}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant="outline">{conversation.priority}</Badge>
                  <Badge variant="secondary">{conversation.status}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* New conversation dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
            <DialogDescription>
              Our team typically replies within one business day.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            noValidate
            aria-busy={createConversation.isPending}
          >
            <div>
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                className="mt-1"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="support-category">Category (optional)</Label>
                <Input
                  id="support-category"
                  className="mt-1"
                  value={category}
                  maxLength={50}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="support-priority">Priority</Label>
                <select
                  id="support-priority"
                  className="mt-1 h-11 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as "low" | "normal" | "high" | "urgent")
                  }
                >
                  {(["low", "normal", "high", "urgent"] as const).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="support-order">Related order (optional)</Label>
              <select
                id="support-order"
                className="mt-1 h-11 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={relatedOrderId}
                onChange={(e) => setRelatedOrderId(e.target.value)}
              >
                <option value="">None</option>
                {(myOrders.data ?? []).map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="support-message">Message</Label>
              <textarea
                id="support-message"
                className="mt-1 min-h-[120px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={message}
                maxLength={5000}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby="support-message-count"
              />
              <p id="support-message-count" className="mt-1 text-xs text-muted-foreground">
                {message.length}/5000 characters
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-[44px]"
                disabled={
                  createConversation.isPending ||
                  subject.trim().length === 0 ||
                  message.trim().length === 0
                }
                aria-busy={createConversation.isPending}
              >
                {createConversation.isPending ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
