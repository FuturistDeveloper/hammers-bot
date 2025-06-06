import mongoose, { Document, Schema } from 'mongoose';

export interface ITender extends Document {}

const TenderSchema = new Schema<ITender>(
  {},
  {
    timestamps: true,
  },
);

export const Tender = mongoose.model<ITender>('Tender', TenderSchema);
