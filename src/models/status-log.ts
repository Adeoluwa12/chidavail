import mongoose, { Schema, type Document } from "mongoose"

export interface IStatusLog extends Document {
  type: string // "morning", "afternoon", "evening", "midnight"
  sentAt: Date
  date: string // YYYY-MM-DD format for easy querying
}

const StatusLogSchema: Schema = new Schema({
  type: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  date: { type: String, required: true },
})

// Create a compound index to ensure we only have one status per type per day
StatusLogSchema.index({ type: 1, date: 1 }, { unique: true })

export const StatusLog = mongoose.model<IStatusLog>("StatusLog", StatusLogSchema)
