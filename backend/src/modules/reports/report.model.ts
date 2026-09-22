import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const REPORT_TYPES = ["sales", "products", "customers", "inventory", "tax"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface IReportRecord {
  _id: Types.ObjectId;
  type: ReportType;
  params: Record<string, unknown>;
  requestedBy: Types.ObjectId;
  format?: ReportFormat;
  status: "queued" | "ready" | "failed";
  downloadUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportRecordSchema = new Schema<IReportRecord>(
  {
    type: { type: String, enum: [...REPORT_TYPES], required: true, index: true },
    params: { type: Schema.Types.Mixed, default: {} },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    format: { type: String, enum: [...REPORT_FORMATS], default: "csv" },
    status: { type: String, enum: ["queued", "ready", "failed"], default: "queued" },
    downloadUrl: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export type ReportRecordDoc = HydratedDocument<IReportRecord>;

export const ReportRecordModel = model<IReportRecord>("ReportRecord", reportRecordSchema);
