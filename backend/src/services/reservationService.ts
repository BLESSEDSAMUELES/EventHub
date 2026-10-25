import { db, TicketTier, Reservation, ReservationItem } from '../db';
import { logger } from '../lib/logger';
import { config } from '../config';

export interface CreateReservationItemInput {
  ticket_tier_id: string;
  quantity: number;
}

export interface CreateReservationInput {
  tenant_id: string;
  attendee_id: string;
  items: CreateReservationItemInput[];
}

export class ReservationService {
  /**
   * Concurrency-safe ticket reservation algorithm (Section 10.2, 10.3)
   * 1. Mutex locks the tier inventory.
   * 2. Checks event publication status and sales cut-off.
   * 3. Checks available_quantity >= requested quantity.
   * 4. Decrements available_quantity atomically.
   * 5. Creates reservation with 10-minute expiry (expires_at = NOW() + HOLD_MINUTES).
   * 6. Records unit price snapshot for each item.
   */
  async createReservation(input: CreateReservationInput): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    if (!input.items || input.items.length === 0) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'At least one ticket tier must be selected' };
    }

    for (const reqItem of input.items) {
      if (!reqItem.quantity || reqItem.quantity <= 0) {
        throw { status: 400, code: 'VALIDATION_ERROR', message: 'Quantity must be greater than zero' };
      }
    }

    // Execute atomic reservation transaction with row-level locking (PostgreSQL SELECT FOR UPDATE or in-memory lock)
    const result = await db.executeReservationTransaction(
      input.tenant_id,
      input.attendee_id,
      input.items,
      config.holdMinutes
    );

    logger.info(`Reservation hold created: ${result.reservation.id} for attendee ${input.attendee_id}`, {
      reservation_id: result.reservation.id,
      expires_at: result.reservation.expires_at,
      item_count: result.items.length,
    }, input.tenant_id);

    return result;
  }

  async getReservation(id: string, attendeeId?: string, isAdmin: boolean = false): Promise<{ reservation: Reservation; items: ReservationItem[] } | null> {
    const res = await db.getReservationById(id);
    if (!res) return null;

    if (!isAdmin && attendeeId && res.reservation.attendee_id !== attendeeId) {
      throw { status: 403, code: 'FORBIDDEN', message: 'Access to this reservation is denied' };
    }

    return res;
  }

  async cancelReservation(id: string, attendeeId: string): Promise<Reservation> {
    return db.withLock(async () => {
      const res = await db.getReservationById(id);
      if (!res) {
        throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' };
      }

      if (res.reservation.attendee_id !== attendeeId) {
        throw { status: 403, code: 'FORBIDDEN', message: 'You can only cancel your own reservations' };
      }

      if (res.reservation.status === 'CONFIRMED') {
        throw { status: 409, code: 'ALREADY_CONFIRMED', message: 'Cannot cancel a confirmed booking' };
      }

      if (res.reservation.status === 'CANCELLED' || res.reservation.status === 'EXPIRED') {
        return res.reservation;
      }

      // Restore inventory
      for (const item of res.items) {
        const tier = await db.getTicketTierById(item.ticket_tier_id);
        if (tier) {
          tier.available_quantity = Math.min(tier.total_quantity, tier.available_quantity + item.quantity);
          await db.updateTicketTier(tier.id, { available_quantity: tier.available_quantity });
        }
      }

      await db.updateReservationStatus(id, 'CANCELLED');
      res.reservation.status = 'CANCELLED';
      res.reservation.updated_at = new Date().toISOString();

      logger.info(`Reservation cancelled: ${id}. Restored inventory.`, { reservation_id: id }, res.reservation.tenant_id);
      return res.reservation;
    });
  }

  /**
   * Release expired reservation idempotently (TC-06)
   */
  async releaseExpiredReservation(id: string): Promise<boolean> {
    return db.withLock(async () => {
      const res = await db.getReservationById(id);
      if (!res) return false;

      // Only release if in ACTIVE or CHECKOUT state
      if (res.reservation.status !== 'ACTIVE' && res.reservation.status !== 'CHECKOUT') {
        return false;
      }

      const now = new Date().toISOString();
      if (res.reservation.expires_at > now) {
        // Not yet expired
        return false;
      }

      // Transition to EXPIRED and restore inventory once
      await db.updateReservationStatus(id, 'EXPIRED');
      res.reservation.status = 'EXPIRED';
      res.reservation.updated_at = now;

      for (const item of res.items) {
        const tier = await db.getTicketTierById(item.ticket_tier_id);
        if (tier) {
          tier.available_quantity = Math.min(tier.total_quantity, tier.available_quantity + item.quantity);
          await db.updateTicketTier(tier.id, { available_quantity: tier.available_quantity });
        }
      }

      logger.info(`Reservation expired and released: ${id}. Restored ticket inventory.`, {
        reservation_id: id,
      }, res.reservation.tenant_id);

      return true;
    });
  }
}

export const reservationService = new ReservationService();
