import mongoose from "mongoose";
import { Schema, ObjectId, STATUSES, DAYS, pointSchema, hideFields } from "./common.js";

export { User } from "./User.js";

// ---------- RefreshToken ----------
const refreshTokenSchema = new Schema(
  {
    user: { type: ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true }, // rotation chain; reuse revokes the whole family
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedBy: String,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

// ---------- FamilyMember ----------
const familySchema = new Schema(
  {
    owner: { type: ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, min: 0, max: 120 },
    gender: { type: String, enum: ["male", "female", "other"] },
    relation: { type: String, trim: true },
  },
  { timestamps: true, toJSON: hideFields() }
);
export const FamilyMember = mongoose.model("FamilyMember", familySchema);

// ---------- Village ----------
const villageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    block: { type: String, trim: true },
    district: { type: String, trim: true, default: "Siwan" },
    location: { type: pointSchema, required: true },
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true, toJSON: hideFields() }
);
villageSchema.index({ location: "2dsphere" });
villageSchema.index({ name: 1, block: 1, district: 1 }, { unique: true });
export const Village = mongoose.model("Village", villageSchema);

// ---------- Lab ----------
const labSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: String,
    phone: String,
    block: String,
    location: { type: pointSchema, required: true },
    serviceRadiusKm: { type: Number, default: 5, min: 0.5, max: 50 },
    // Villages the agent tagged: patients of these villages always see this lab, whatever the distance.
    villages: { type: [{ type: ObjectId, ref: "Village" }], default: [], index: true },
    pathologist: { name: String, qualification: String, registrationNo: String },
    licenceNo: String,
    collectionFee: { type: Number, default: 49, min: 0 },
    // Charged instead of collectionFee when the collector picks up at a doctor's clinic (one trip, many samples).
    clinicPickupFee: { type: Number, default: 0, min: 0 },
    freeCollectionAbove: { type: Number, default: 499, min: 0 },
    minOrderValue: { type: Number, default: 199, min: 0 },
    commissionPercent: { type: Number, default: 30, min: 0, max: 90 },
    onboardedBy: { type: ObjectId, ref: "User", index: true },
    status: { type: String, enum: STATUSES, default: "active" },
  },
  { timestamps: true, toJSON: hideFields() }
);
labSchema.index({ location: "2dsphere" });
export const Lab = mongoose.model("Lab", labSchema);

// ---------- LabTest ----------
const labTestSchema = new Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: String,
    sampleType: { type: String, default: "blood" },
    fastingRequired: { type: Boolean, default: false },
    walkInPrice: { type: Number, required: true, min: 0 },
    listingPrice: { type: Number, min: 0 },
    b2bPrice: { type: Number, min: 0 },
    b2bOverridden: { type: Boolean, default: false },
    reportTimeHours: { type: Number, default: 24 },
    isOutsourced: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: hideFields() }
);
labTestSchema.index({ lab: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
export const LabTest = mongoose.model("LabTest", labTestSchema);

// ---------- Doctor ----------
const slotSchema = new Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    start: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    end: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    maxTokens: { type: Number, required: true, min: 1, max: 500 },
  },
  { _id: false }
);
const doctorSchema = new Schema(
  {
    user: { type: ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
    degree: String,
    registrationNo: String,
    specialty: { type: String, index: true },
    specialtyHi: String,
    clinicName: String,
    clinicAddress: String,
    block: String,
    location: { type: pointSchema, required: true },
    fee: { type: Number, min: 0, default: 0 },
    // Villages the agent tagged: patients of these villages always see this doctor, whatever the distance.
    villages: { type: [{ type: ObjectId, ref: "Village" }], default: [], index: true },
    schedule: { type: [slotSchema], default: [] },
    onboardedBy: { type: ObjectId, ref: "User", index: true },
    status: { type: String, enum: STATUSES, default: "active" },
  },
  { timestamps: true, toJSON: hideFields() }
);
doctorSchema.index({ location: "2dsphere" });
export const Doctor = mongoose.model("Doctor", doctorSchema);

// ---------- Booking ----------
export const BOOKING_STATUSES = ["requested", "confirmed", "collected", "report_ready", "cancelled"];
export const COLLECTION_POINTS = ["home", "clinic"];
const bookingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    // A LabLoop account; optional only for a clinic walk-in patient (walkIn.name set instead).
    patient: { type: ObjectId, ref: "User", index: true, required: [function () { return !this.walkIn?.name; }, "patient or walkIn.name is required"] },
    familyMember: { type: ObjectId, ref: "FamilyMember" },
    patientName: String, // snapshot for the lab card
    patientAge: Number,
    // Where the collector picks up the sample: the patient's home, or the referring doctor's clinic.
    collectionPoint: { type: String, enum: COLLECTION_POINTS, default: "home" },
    clinic: {
      doctor: { type: ObjectId, ref: "Doctor", index: true },
      name: String,
      address: String,
      location: { type: pointSchema, default: undefined },
    },
    walkIn: {
      name: { type: String, trim: true },
      age: { type: Number, min: 0, max: 120 },
      gender: { type: String, enum: ["male", "female", "other"] },
      phone: { type: String, trim: true },
    },
    note: { type: String, trim: true, maxlength: 200 }, // doctor's note for the lab
    village: { type: ObjectId, ref: "Village", required: [function () { return this.collectionPoint !== "clinic"; }, "village is required for home collection"] },
    address: String,
    // Exact home pin the patient shared ("Use my current location"); else the village point is used.
    location: { type: pointSchema, default: undefined },
    lab: { type: ObjectId, ref: "Lab", required: true, index: true },
    items: [
      new Schema(
        { test: { type: ObjectId, ref: "LabTest" }, name: String, listingPrice: Number, b2bPrice: Number },
        { _id: false }
      ),
    ],
    testTotal: Number,
    collectionFee: Number,
    total: Number,
    labPayout: Number,
    platformMargin: Number,
    date: { type: String, required: true }, // YYYY-MM-DD (IST)
    slot: String,
    status: { type: String, enum: BOOKING_STATUSES, default: "requested", index: true },
    otpHash: String,
    otpAttempts: { type: Number, default: 0 },
    otpLocked: { type: Boolean, default: false },
    collectionTime: String,
    collectedAt: Date,
    report: { key: String, name: String, mime: String, size: Number, uploadedAt: Date },
    source: { type: String, enum: ["patient", "doctor"], default: "patient" },
    referredBy: { type: ObjectId, ref: "Doctor" },
    appointment: { type: ObjectId, ref: "Appointment" },
    consent: { type: Boolean, default: false },
    payment: {
      mode: { type: String, enum: ["cash", "upi", "online"], default: "cash" },
      status: { type: String, enum: ["pending", "paid", "refunded"], default: "pending" },
    },
    settlement: { type: ObjectId, ref: "Settlement" },
    history: [
      new Schema(
        { status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: "User" }, note: String },
        { _id: false }
      ),
    ],
  },
  { timestamps: true, toJSON: hideFields("otpHash") }
);
bookingSchema.index({ lab: 1, collectedAt: 1 });
bookingSchema.index({ lab: 1, collectionPoint: 1, status: 1 });
export const Booking = mongoose.model("Booking", bookingSchema);

// ---------- Appointment ----------
const appointmentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    patient: { type: ObjectId, ref: "User", required: true, index: true },
    familyMember: { type: ObjectId, ref: "FamilyMember" },
    patientName: String,
    patientAge: Number,
    village: { type: ObjectId, ref: "Village" },
    doctor: { type: ObjectId, ref: "Doctor", required: true },
    date: { type: String, required: true },
    token: { type: Number, required: true },
    status: { type: String, enum: ["booked", "seen", "cancelled", "no_show"], default: "booked" },
    referredBooking: { type: ObjectId, ref: "Booking" },
    // Visit code on the patient's receipt; the doctor enters it to mark the visit "seen".
    // Like the lab OTP it is derived from the code with a server secret; only a hash is stored.
    visitHash: String,
    visitAttempts: { type: Number, default: 0 },
    visitLocked: { type: Boolean, default: false },
    seenAt: Date,
  },
  { timestamps: true, toJSON: hideFields("visitHash") }
);
appointmentSchema.index({ doctor: 1, date: 1, token: 1 }, { unique: true });
appointmentSchema.index({ doctor: 1, date: 1, patient: 1 });
export const Appointment = mongoose.model("Appointment", appointmentSchema);

// ---------- Settlement ----------
const settlementSchema = new Schema(
  {
    lab: { type: ObjectId, ref: "Lab", required: true },
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    bookings: [{ type: ObjectId, ref: "Booking" }],
    gross: Number,
    labPayout: Number,
    cashWithLab: Number,
    netPayable: Number,
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt: Date,
    paidBy: { type: ObjectId, ref: "User" },
    reference: String,
  },
  { timestamps: true, toJSON: hideFields() }
);
settlementSchema.index({ lab: 1, weekStart: 1 }, { unique: true });
export const Settlement = mongoose.model("Settlement", settlementSchema);

// ---------- AuditLog ----------
const auditSchema = new Schema(
  {
    actor: { type: ObjectId, ref: "User" },
    actorRole: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: ObjectId,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, toJSON: hideFields() }
);
auditSchema.index({ entityType: 1, entityId: 1 });
auditSchema.index({ actor: 1, at: -1 });
export const AuditLog = mongoose.model("AuditLog", auditSchema);
