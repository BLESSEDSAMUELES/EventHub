import { db, Order } from '../db';
import { logger } from '../lib/logger';

export interface CreateOrderInput {
  reservation_id: string;
  attendee_id: string;
  idempotency_key: string;
}

export class OrderService {
  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (!input.reservation_id || !input.idempotency_key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'reservation_id and idempotency_key are required' };
    }

    // 1. Idempotency Key check (TC-05)
    const existingOrder = await db.getOrderByAttendeeAndIdempotency(input.attendee_id, input.idempotency_key);
    if (existingOrder) {
      logger.info(`Idempotent order retry detected: returning order ${existingOrder.id}`, {
        order_id: existingOrder.id,
        idempotency_key: input.idempotency_key,
      });
      return existingOrder;
    }

    // 2. Load reservation and items
    const resData = await db.getReservationById(input.reservation_id);
    if (!resData) {
      throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' };
    }

    const { reservation, items } = resData;

    if (reservation.attendee_id !== input.attendee_id) {
      throw { status: 403, code: 'FORBIDDEN', message: 'You do not own this reservation' };
    }

    // Check expiry (TC-04)
    const now = new Date().toISOString();
    if (reservation.expires_at <= now || reservation.status === 'EXPIRED') {
      throw {
        status: 409,
        code: 'RESERVATION_EXPIRED',
        message: 'Reservation hold has expired. Please select tickets again.',
      };
    }

    if (reservation.status === 'CANCELLED') {
      throw { status: 409, code: 'RESERVATION_CANCELLED', message: 'Reservation has been cancelled' };
    }

    if (reservation.status === 'CONFIRMED') {
      const existing = await db.getOrderByReservationId(reservation.id);
      if (existing) return existing;
    }

    // 3. Compute total from reservation item snapshot (FR-08)
    const itemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
    const serviceFeeCents = 5000; // Flat service fee ₹50.00
    const totalCents = itemsTotal + serviceFeeCents;

    // Transition reservation state to CHECKOUT
    await db.updateReservationStatus(reservation.id, 'CHECKOUT');

    // 4. Create and persist Order
    const newOrder = await db.insertOrder({
      tenant_id: reservation.tenant_id,
      reservation_id: reservation.id,
      attendee_id: input.attendee_id,
      total_cents: totalCents,
      status: 'PENDING',
      idempotency_key: input.idempotency_key,
    });

    logger.info(`Order created: ${newOrder.id} for reservation ${reservation.id}, total: ₹${(totalCents / 100).toFixed(2)}`, {
      order_id: newOrder.id,
      total_cents: totalCents,
    }, reservation.tenant_id);

    return newOrder;
  }

  async getOrderById(id: string, attendeeId?: string, isAdmin: boolean = false): Promise<Order | null> {
    const order = await db.getOrderById(id);
    if (!order) return null;

    if (!isAdmin && attendeeId && order.attendee_id !== attendeeId) {
      throw { status: 403, code: 'FORBIDDEN', message: 'Access denied' };
    }

    return order;
  }

  async getOrdersForAttendee(attendeeId: string): Promise<Order[]> {
    return db.getOrdersByAttendee(attendeeId);
  }
}

export const orderService = new OrderService();
