import { Schema, model, type HydratedDocument, type Types } from "mongoose";

/**
 * Conversation status lifecycle:
 * open → in_progress → resolved → closed
 * Any status may transition back to "open" if the customer reopens.
 */
export const CONVERSATION_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Priority levels for customer support conversations. */
export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export interface ISupportConversation {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  subject: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  category: string | null;
  relatedOrderId: Types.ObjectId | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const supportConversationSchema = new Schema<ISupportConversation>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: [...CONVERSATION_STATUSES],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: [...CONVERSATION_PRIORITIES],
      default: "normal",
    },
    category: { type: String, trim: true, maxlength: 50, default: null },
    relatedOrderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, versionKey: false },
);

supportConversationSchema.index({ customerId: 1, status: 1 });
supportConversationSchema.index({ lastMessageAt: -1 });
supportConversationSchema.index({ createdAt: -1 });

export type SupportConversationDoc = HydratedDocument<ISupportConversation>;

export const SupportConversationModel = model<ISupportConversation>(
  "SupportConversation",
  supportConversationSchema,
);
