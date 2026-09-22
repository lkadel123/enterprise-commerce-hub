import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import {
  MESSAGE_PRIORITIES,
  MESSAGE_TYPES,
  type MessagePriority,
  type MessageType,
} from "./message.types.js";

export interface IMessage {
  _id: Types.ObjectId;
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  subject: string;
  body: string;
  type: MessageType;
  priority: MessagePriority;
  isRead: boolean;
  readAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
const messageSchema = new Schema<IMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: [...MESSAGE_TYPES], default: "general", index: true },
    priority: { type: String, enum: [...MESSAGE_PRIORITIES], default: "normal", index: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    entityType: { type: String, trim: true, maxlength: 50, default: null },
    entityId: { type: String, trim: true, maxlength: 50, default: null },
    actionUrl: { type: String, trim: true, maxlength: 500, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false },
);
messageSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
export type MessageDoc = HydratedDocument<IMessage>;
export const MessageModel = model<IMessage>("Message", messageSchema);
