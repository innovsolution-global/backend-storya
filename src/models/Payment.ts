import type { payments } from '../db/schema';

export type IPayment = typeof payments.$inferSelect;
