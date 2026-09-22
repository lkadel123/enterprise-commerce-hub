import { Schema, model, type HydratedDocument } from "mongoose";

/**
 * Lightweight, race-free sequence counter used to generate unique, monotonic
 * order numbers. Each counter is a single document keyed by a logical name;
 * incrementing is one atomic findAndModify so concurrent order creation can
 * never emit the same number.
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, min: 0, default: 0 },
});

export type CounterDoc = HydratedDocument<ICounter>;

export const CounterModel = model<ICounter>("Counter", counterSchema);
