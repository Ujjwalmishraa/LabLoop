import mongoose from "mongoose";
import { Schema, ObjectId, ROLES, STATUSES, hideFields } from "./common.js";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: STATUSES, default: "active" },
    mustChangePassword: { type: Boolean, default: false },
    lab: { type: ObjectId, ref: "Lab" },
    doctor: { type: ObjectId, ref: "Doctor" },
    village: { type: ObjectId, ref: "Village" }, // patient's saved village
    lang: { type: String, enum: ["hi", "en"], default: "hi" }, // app + email language
    langChosen: { type: Boolean, default: false }, // true once the user picked a language themselves
    createdBy: { type: ObjectId, ref: "User" },
    lastLoginAt: Date,
    // Bumped on password change / disable; access tokens carrying an older value are rejected.
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: String,
    resetTokenExpiresAt: Date,
  },
  { timestamps: true, toJSON: hideFields("passwordHash", "tokenVersion", "resetTokenHash", "resetTokenExpiresAt") }
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { role: "patient" } });
userSchema.index({ role: 1, status: 1 });

export const User = mongoose.model("User", userSchema);
