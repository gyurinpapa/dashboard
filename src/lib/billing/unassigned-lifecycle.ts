import { periodEnd } from './catalog';

/** Candidate only: no route imports this module until durable DB transitions are verified. */
export const REGISTRATION_VERSION = 'assignment-start-20261014' as const;
export type Registration = {
  version: typeof REGISTRATION_VERSION;
  orderId: string;
  advertiserId: string;
  buyerId: string;
  companyId: string;
  tenantId: string;
  name: string;
  amount: number;
  payment: 'pending' | 'verified' | 'refund_pending' | 'refunded' | 'review';
  approvedAt: string | null;
  assignment: null | { workspaceId: string; assignedBy: string; startedAt: string; paidUntil: string };
};
/** These rows must be loaded on the server; request bodies/JWT user_metadata are not authority. */
export type AssignmentAuthority = {
  actorId: string;
  actorCompanyId: string;
  destinationCompanyId: string;
  destinationTenantId: string;
  workspaceId: string;
  workspaceRole: string | null;
  tenantOwner: boolean;
};
function fail(code: string): never { throw new Error(code); }
function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail('INVALID_TIME');
  return result;
}
function uuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('INVALID_ID');
  return value;
}
export function registration(input: Omit<Registration, 'version' | 'payment' | 'approvedAt' | 'assignment'>): Registration {
  for (const id of [input.orderId, input.advertiserId, input.buyerId, input.companyId, input.tenantId]) uuid(id);
  const name = input.name.trim();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) fail('INVALID_NAME');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('INVALID_AMOUNT');
  return { ...input, name, version: REGISTRATION_VERSION, payment: 'pending', approvedAt: null, assignment: null };
}
/** Called only with a provider-verified, amount/merchant/order-matched payment. */
export function approve(value: Registration, approvedAt: string): Registration {
  instant(approvedAt);
  if (value.payment === 'verified') {
    if (value.approvedAt !== approvedAt) fail('PAYMENT_CONFLICT');
    return value;
  }
  // Late DONE cannot resurrect a refund or a payment requiring review.
  if (value.payment !== 'pending') return value;
  return { ...value, payment: 'verified', approvedAt };
}
/** Run under a durable row lock; timestamp comes from DB after lock, never the browser. */
export function assign(value: Registration, authority: AssignmentAuthority, databaseNow: string): Registration {
  uuid(authority.actorId); uuid(authority.workspaceId);
  if (authority.actorCompanyId !== value.companyId || authority.destinationCompanyId !== value.companyId ||
      authority.destinationTenantId !== value.tenantId) fail('ASSIGNMENT_SCOPE_DENIED');
  if (!authority.tenantOwner && !['admin', 'director'].includes(authority.workspaceRole || '')) fail('ASSIGNMENT_ROLE_DENIED');
  if (value.payment !== 'verified' || !value.approvedAt) fail('VERIFIED_PAYMENT_REQUIRED');
  if (instant(databaseNow) < instant(value.approvedAt)) fail('INVALID_ASSIGNMENT_TIME');
  if (value.assignment) {
    if (value.assignment.workspaceId !== authority.workspaceId) fail('ALREADY_ASSIGNED');
    return value; // Retry never extends the month or creates another advertiser.
  }
  return { ...value, assignment: { workspaceId: authority.workspaceId, assignedBy: authority.actorId,
    startedAt: databaseNow, paidUntil: periodEnd(databaseNow, 1) } };
}
export function canUse(value: Registration, databaseNow: string): boolean {
  const time = instant(databaseNow);
  return value.payment === 'verified' && !!value.assignment &&
    instant(value.assignment.startedAt) <= time && time < instant(value.assignment.paidUntil);
}
export function reserveRefund(value: Registration): Registration {
  if (value.payment === 'refunded' || value.payment === 'refund_pending') return value;
  if (value.payment !== 'verified') fail('VERIFIED_PAYMENT_REQUIRED');
  return { ...value, payment: 'refund_pending' };
}
export function refundAmount(value: Registration, databaseNow: string): number {
  const time = instant(databaseNow);
  if (!['verified', 'refund_pending'].includes(value.payment) || !value.approvedAt) fail('REFUND_REQUIRES_REVIEW');
  if (time < instant(value.approvedAt)) fail('INVALID_REFUND_TIME');
  // Before assignment, no service was made available: full refund, regardless of wait.
  if (!value.assignment || time <= instant(value.approvedAt) + 168 * 3600000) return value.amount;
  const start = instant(value.assignment.startedAt), end = instant(value.assignment.paidUntil);
  if (time >= end) return 0;
  return Math.min(value.amount, Math.ceil(value.amount * (end - time) / (end - start)));
}
export function confirmRefund(value: Registration): Registration {
  if (value.payment === 'refunded') return value;
  if (value.payment !== 'refund_pending') fail('REFUND_RESERVATION_REQUIRED');
  return { ...value, payment: 'refunded' };
}

