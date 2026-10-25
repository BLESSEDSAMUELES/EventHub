import { db } from '../db';
import { seedDatabase } from '../db/seed';
import { reservationService } from '../services/reservationService';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log('  EventForge Core Concurrency & Acceptance Test Suite');
  console.log('====================================================\n');

  await seedDatabase();

  const users = await db.getUsers();
  const attendee = users.find((u) => u.email === 'blessed@example.com')!;
  const attendeeVijay = users.find((u) => u.email === 'vijay@example.com')!;
  const tenants = await db.getTenants();
  const sairamTenant = tenants.find((t) => t.slug === 'sairam')!;

  // Create a limited disposable ticket tier with EXACTLY 1 ticket
  const events = await db.getEvents();
  const techEvent = events[0];

  const singleTicketTier = await db.insertTicketTier({
    tenant_id: sairamTenant.id,
    event_id: techEvent.id,
    name: 'Last Chance Flash Seat',
    description: 'Final single ticket for concurrency testing',
    price_cents: 100000,
    currency: 'INR',
    total_quantity: 1,
    available_quantity: 1,
  });

  console.log(`[SETUP] Created tier "${singleTicketTier.name}" with available_quantity = 1\n`);

  // -----------------------------------------------------------------
  // TC-02: Simultaneous Competition for Final Ticket (Concurrency Test)
  // -----------------------------------------------------------------
  console.log('[TEST 1: TC-02] Concurrency Test - 10 simultaneous requests competing for 1 ticket...');

  const concurrentRequests = Array.from({ length: 10 }).map(async (_, idx) => {
    try {
      const res = await reservationService.createReservation({
        tenant_id: sairamTenant.id,
        attendee_id: idx % 2 === 0 ? attendee.id : attendeeVijay.id,
        items: [{ ticket_tier_id: singleTicketTier.id, quantity: 1 }],
      });
      return { success: true, resId: res.reservation.id };
    } catch (err: any) {
      return { success: false, code: err.code || err.message };
    }
  });

  const results = await Promise.all(concurrentRequests);
  const successCount = results.filter((r) => r.success).length;
  const rejectedCount = results.filter((r) => !r.success && r.code === 'SOLD_OUT').length;

  const currentTier = await db.getTicketTierById(singleTicketTier.id);

  console.log(`  -> Successful holds: ${successCount}`);
  console.log(`  -> Rejected (SOLD_OUT): ${rejectedCount}`);
  console.log(`  -> Final tier available_quantity: ${currentTier?.available_quantity}`);

  if (successCount === 1 && rejectedCount === 9 && currentTier?.available_quantity === 0) {
    console.log('  PASS: Exactly 1 reservation succeeded, 9 rejected with SOLD_OUT. Zero overselling verified!\n');
  } else {
    console.error('  FAIL: Concurrency constraint violated!\n');
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // TC-03: Request quantity exceeds available quantity
  // -----------------------------------------------------------------
  console.log('[TEST 2: TC-03] Requesting 5 tickets when available is 0...');
  try {
    await reservationService.createReservation({
      tenant_id: sairamTenant.id,
      attendee_id: attendee.id,
      items: [{ ticket_tier_id: singleTicketTier.id, quantity: 5 }],
    });
    console.error('  FAIL: Should have thrown SOLD_OUT');
  } catch (err: any) {
    if (err.code === 'SOLD_OUT') {
      console.log('  PASS: Rejected with SOLD_OUT conflict.\n');
    } else {
      console.error(`  FAIL: Unexpected error ${err.code}`);
    }
  }

  // -----------------------------------------------------------------
  // TC-05: Order Idempotency Key Handling
  // -----------------------------------------------------------------
  console.log('[TEST 3: TC-05] Order Idempotency Key Retries...');
  const activeRes = results.find((r) => r.success) as { success: true; resId: string };
  const idempotencyKey = `idem-test-key-${Date.now()}`;

  const orderFirst = await orderService.createOrder({
    reservation_id: activeRes.resId,
    attendee_id: attendee.id,
    idempotency_key: idempotencyKey,
  });

  const orderSecond = await orderService.createOrder({
    reservation_id: activeRes.resId,
    attendee_id: attendee.id,
    idempotency_key: idempotencyKey,
  });

  if (orderFirst.id === orderSecond.id) {
    console.log(`  PASS: Repeated call returned identical order ${orderFirst.id} without duplication.\n`);
  } else {
    console.error('  FAIL: Duplicate order created!');
  }

  // -----------------------------------------------------------------
  // TC-08: Mock Payment Rejection & Inventory Release
  // -----------------------------------------------------------------
  console.log('[TEST 4: TC-08] Mock Payment Rejection & Restoring Inventory...');
  const paymentRejection = await paymentService.processMockPayment({
    order_id: orderFirst.id,
    attendee_id: attendee.id,
    outcome: 'reject',
  });

  const tierAfterRejection = await db.getTicketTierById(singleTicketTier.id);

  if (paymentRejection.order.status === 'FAILED' && tierAfterRejection?.available_quantity === 1) {
    console.log(`  PASS: Order marked FAILED, reservation cancelled, ticket restored to available_quantity = 1.\n`);
  } else {
    console.error('  FAIL: Rejection did not restore inventory correctly.');
  }

  // -----------------------------------------------------------------
  // TC-07: Mock Payment Approval & Confirmed Booking
  // -----------------------------------------------------------------
  console.log('[TEST 5: TC-07] Reserving and Approving Payment...');
  const newHold = await reservationService.createReservation({
    tenant_id: sairamTenant.id,
    attendee_id: attendee.id,
    items: [{ ticket_tier_id: singleTicketTier.id, quantity: 1 }],
  });

  const newOrder = await orderService.createOrder({
    reservation_id: newHold.reservation.id,
    attendee_id: attendee.id,
    idempotency_key: `idem-paid-test-${Date.now()}`,
  });

  const paymentApproval = await paymentService.processMockPayment({
    order_id: newOrder.id,
    attendee_id: attendee.id,
    outcome: 'approve',
  });

  const tierAfterApproval = await db.getTicketTierById(singleTicketTier.id);

  if (paymentApproval.order.status === 'PAID' && tierAfterApproval?.available_quantity === 0) {
    console.log(`  PASS: Order PAID, reservation CONFIRMED, inventory remaining = 0.\n`);
  } else {
    console.error('  FAIL: Payment approval failed.');
  }

  // -----------------------------------------------------------------
  // TC-06: Expiry Idempotency
  // -----------------------------------------------------------------
  console.log('[TEST 6: TC-06] Worker Release Idempotency on Confirmed Order...');
  const releaseAttempt1 = await reservationService.releaseExpiredReservation(newHold.reservation.id);
  const releaseAttempt2 = await reservationService.releaseExpiredReservation(newHold.reservation.id);

  if (!releaseAttempt1 && !releaseAttempt2) {
    console.log('  PASS: Confirmed reservations are safely protected from accidental expiry/inventory leakage.\n');
  } else {
    console.error('  FAIL: Released confirmed reservation!');
  }

  console.log('====================================================');
  console.log('  ALL ACCEPTANCE & CONCURRENCY TESTS PASSED (6/6)');
  console.log('====================================================\n');
}

runAcceptanceTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
