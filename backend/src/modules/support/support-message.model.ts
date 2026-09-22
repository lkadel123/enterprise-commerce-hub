import { Schema, model, type HydratedDocument, type Types } from "mongoose";

/**
 * Identifies who sent a support message.
 * - "customer": a message from the conversation owner.
 * - "agent": a reply from a support agent / admin.
 * - "system": an automated/system-generated message.
 */
export const SENDER_TYPES = ["customer", "agent", "system"] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export interface ISupportMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderType: SenderType;
  senderId: Types.ObjectId | null;
  message: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "SupportConversation",
      required: true,
      index: true,
    },
    senderType: {
      type: String,
      enum: [...SENDER_TYPES],
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      refPath: "senderType",
      default: null,
      index: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

supportMessageSchema.index({ conversationId: 1, createdAt: 1 });
supportMessageSchema.index({ conversationId: 1, read: 1 });

export type SupportMessageDoc = HydratedDocument<ISupportMessage>;

export const SupportMessageModel = model<ISupportMessage>("SupportMessage", supportMessageSchema);
