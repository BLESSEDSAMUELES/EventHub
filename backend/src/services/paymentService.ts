import { db, Order, PaymentTransaction } from '../db';
import { logger } from '../lib/logger';
import { config } from '../config';

export interface MockPaymentInput {
  order_id: string;
  attendee_id: string;
  outcome?: 'approve' | 'reject';
  payment_method?: string;
}

export class PaymentService {
  async processMockPayment(input: MockPaymentInput): Promise<{ order: Order; transaction: PaymentTransaction }> {
    const outcome = input.outcome || 'approve';
    const paymentMethod = input.payment_method || 'credit_card';

    return db.withLock(async () => {
      const order = await db.getOrderById(input.order_id);
      if (!order) {
        throw { status: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
      }

      if (order.attendee_id !== input.attendee_id) {
        throw { status: 403, code: 'FORBIDDEN', message: 'You do not own this order' };
      }

      // If already paid, return without duplicating charge or stock change
      if (order.status === 'PAID') {
        const txns = await db.getPaymentTransactionsByOrder(order.id);
        return { order, transaction: txns[0] };
      }

      const resData = await db.getReservationById(order.reservation_id);
      if (!resData) {
        throw { status: 404, code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' };
      }

      const { reservation, items } = resData;

      // Check if hold has expired
      const now = new Date().toISOString();
      if (reservation.expires_at <= now || reservation.status === 'EXPIRED') {
        order.status = 'EXPIRED';
        throw {
          status: 409,
          code: 'RESERVATION_EXPIRED',
          message: 'Reservation has expired. Payment cannot be completed.',
        };
      }

      const providerRef = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (outcome === 'approve') {
        // 1. Success path (TC-07)
        await db.updateOrderStatus(order.id, 'PAID');
        await db.updateReservationStatus(reservation.id, 'CONFIRMED');
        order.status = 'PAID';
        reservation.status = 'CONFIRMED';
        reservation.updated_at = now;

        const txn = await db.insertPaymentTransaction({
          order_id: order.id,
          provider_reference: providerRef,
          amount_cents: order.total_cents,
          payment_method: paymentMethod,
          status: 'SUCCESS',
          raw_result: { outcome: 'APPROVED', simulated: true, timestamp: now },
        });

        logger.info(`Payment approved for order ${order.id}. Reservation CONFIRMED.`, {
          order_id: order.id,
          provider_reference: providerRef,
          amount_cents: order.total_cents,
        }, order.tenant_id);

        return { order, transaction: txn };
      } else {
        // 2. Rejection path (TC-08)
        await db.updateOrderStatus(order.id, 'FAILED');
        await db.updateReservationStatus(reservation.id, 'CANCELLED');
        order.status = 'FAILED';
        reservation.status = 'CANCELLED';
        reservation.updated_at = now;

        // Restore inventory exactly once
        for (const item of items) {
          const tier = await db.getTicketTierById(item.ticket_tier_id);
          if (tier) {
            tier.available_quantity = Math.min(tier.total_quantity, tier.available_quantity + item.quantity);
            await db.updateTicketTier(tier.id, { available_quantity: tier.available_quantity });
          }
        }

        const txn = await db.insertPaymentTransaction({
          order_id: order.id,
          provider_reference: providerRef,
          amount_cents: order.total_cents,
          payment_method: paymentMethod,
          status: 'FAILED',
          raw_result: { outcome: 'DECLINED', reason: 'Simulated payment decline', simulated: true, timestamp: now },
        });

        logger.warn(`Payment rejected for order ${order.id}. Reservation CANCELLED, inventory restored.`, {
          order_id: order.id,
          provider_reference: providerRef,
        }, order.tenant_id);

        return { order, transaction: txn };
      }
    });
  }

  async processWebhook(payload: any, secretHeader?: string): Promise<{ success: boolean; message: string }> {
    // Secret authentication check (TC-11)
    if (!secretHeader || secretHeader !== config.mockWebhookSecret) {
      throw { status: 401, code: 'UNAUTHORIZED_WEBHOOK', message: 'Invalid webhook signature or secret' };
    }

    const { order_id, outcome, provider_reference } = payload;
    if (!order_id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Missing order_id in webhook payload' };
    }

    const order = await db.getOrderById(order_id);
    if (!order) {
      throw { status: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
    }

    // Idempotency: if already paid, do nothing
    if (order.status === 'PAID') {
      return { success: true, message: 'Order already confirmed' };
    }

    if (outcome === 'approved') {
      order.status = 'PAID';
      await db.updateReservationStatus(order.reservation_id, 'CONFIRMED');
      await db.insertPaymentTransaction({
        order_id: order.id,
        provider_reference: provider_reference || `wh_${Date.now()}`,
        amount_cents: order.total_cents,
        payment_method: 'webhook_simulated',
        status: 'SUCCESS',
        raw_result: payload,
      });
      return { success: true, message: 'Order paid successfully via webhook' };
    } else {
      order.status = 'FAILED';
      const resData = await db.getReservationById(order.reservation_id);
      if (resData && resData.reservation.status !== 'CANCELLED') {
        await db.updateReservationStatus(order.reservation_id, 'CANCELLED');
        for (const item of resData.items) {
          const tier = await db.getTicketTierById(item.ticket_tier_id);
          if (tier) {
            tier.available_quantity = Math.min(tier.total_quantity, tier.available_quantity + item.quantity);
          }
        }
      }
      return { success: true, message: 'Order marked failed via webhook' };
    }
  }
}

export const paymentService = new PaymentService();
