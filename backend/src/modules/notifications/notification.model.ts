import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from "./notification.types.js";

export interface INotification {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  recipientType: "admin" | "customer";
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  message: string | null;
  priority: (typeof NOTIFICATION_PRIORITIES)[number];
  read: boolean;
  readAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["admin", "customer"],
      required: true,
      default: "admin",
      index: true,
    },
    type: {
      type: String,
      enum: [...NOTIFICATION_TYPES],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    priority: {
      type: String,
      enum: [...NOTIFICATION_PRIORITIES],
      default: "normal",
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    entityType: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    entityId: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, read: 1, recipientType: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ recipientType: 1, read: 1, createdAt: -1 });
export type NotificationDoc = HydratedDocument<INotification>;
export const NotificationModel = model<INotification>("Notification", notificationSchema);
