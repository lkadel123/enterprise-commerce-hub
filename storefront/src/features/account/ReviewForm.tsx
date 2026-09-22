import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/client";
import { useSubmitReviewMutation } from "@/features/account/account-hooks";


const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Select a rating (1–5).").max(5),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, "Please write a short review.").max(2000, "Maximum 2000 characters."),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewFormProps {
  orderId: string;
  productId: string;
  productName: string;
  /** Called after a successful submit so the parent can hide the form. */
  onSubmitted?: () => void;
}

export function ReviewForm({ orderId, productId, productName, onSubmitted }: ReviewFormProps) {
  const mutation = useSubmitReviewMutation();
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { title: "", body: "" },
  });

  async function onSubmit(values: ReviewFormValues) {
    setServerMessage(null);
    mutation.mutate(
      {
        orderId,
        productId,
        rating: values.rating,
        body: values.body,
        ...(values.title ? { title: values.title } : {}),
      },
      {
        onSuccess: () => {
          form.reset({ title: "", body: "" });
          setServerMessage("Review submitted for moderation.");
          onSubmitted?.();
        },
        onError: (error) => {
          setServerMessage(apiErrorMessage(error));
        },
      },
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your rating</FormLabel>
              <FormControl>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const selected = field.value === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`${value} star${value === 1 ? "" : "s"}`}
                        onClick={() => field.onChange(value)}
                        className="min-h-[44px] min-w-[44px] rounded-sm"
                      >
                        <Star
                          className={`h-6 w-6 ${selected ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Title (optional)</FormLabel>
              <FormControl>
                <input
                  {...field}
                  placeholder="Title (optional)"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  maxLength={200}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your review of {productName}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={4} placeholder="What did you think of this product?" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverMessage ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-medium text-muted-foreground"
          >
            {serverMessage}
          </p>
        ) : null}

        <Button
          type="submit"
          className="min-h-[44px]"
          disabled={mutation.isPending}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending ? "Submitting…" : "Submit review"}
        </Button>
      </form>
    </Form>
  );
}
