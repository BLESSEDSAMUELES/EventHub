import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { cache } from './lib/cache';
import { logger } from './lib/logger';
import { authenticateToken, requireRole, requireTenantScope, generateToken } from './middleware/auth';
import { reservationService } from './services/reservationService';
import { orderService } from './services/orderService';
import { paymentService } from './services/paymentService';
import { analyticsService } from './services/analyticsService';

const router = Router();

// ==========================================
// 1. Authentication Routes (Section 8.1, 12)
// ==========================================

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone, role, tenant_slug, tenant_name } = req.body;
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email, password, and full name are required' });
      return;
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: 'DUPLICATE_RESOURCE', message: 'Email already registered' });
      return;
    }

    const userRole = role === 'organizer' ? 'organizer' : 'attendee';
    let tenantId = null;

    if (tenant_slug) {
      const tenant = await db.getTenantBySlug(tenant_slug);
      if (tenant) {
        tenantId = tenant.id;
      } else if (userRole === 'organizer') {
        const createdTenant = await db.insertTenant({
          name: tenant_name || `${full_name} Organization`,
          slug: tenant_slug,
          contact_email: email,
          status: 'active',
        });
        tenantId = createdTenant.id;
      }
    } else if (userRole === 'organizer') {
      const defaultSlug = `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-events`;
      let existing = await db.getTenantBySlug(defaultSlug);
      if (!existing) {
        const createdTenant = await db.insertTenant({
          name: tenant_name || `${full_name} Events`,
          slug: defaultSlug,
          contact_email: email,
          status: 'active',
        });
        tenantId = createdTenant.id;
      } else {
        tenantId = existing.id;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await db.insertUser({
      tenant_id: tenantId,
      email,
      full_name,
      phone: phone || '',
      password_hash: passwordHash,
      role: userRole,
      status: 'active',
    });

    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      tenant_id: newUser.tenant_id,
      full_name: newUser.full_name,
    });

    logger.info(`User registered: ${newUser.email} (${newUser.id})`, undefined, newUser.tenant_id);

    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        tenant_id: newUser.tenant_id,
        phone: newUser.phone,
      },
      token,
    });
  } catch (err: any) {
    logger.error('Registration failed', err);
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email and password are required' });
      return;
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      full_name: user.full_name,
    });

    logger.info(`User logged in: ${user.full_name} (${user.email})`, { role: user.role }, user.tenant_id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tenant_id: user.tenant_id,
        phone: user.phone,
      },
      token,
    });
  } catch (err: any) {
    logger.error('Login failed', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/auth/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await db.getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User profile not found' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      tenant_id: user.tenant_id,
      phone: user.phone,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.put('/auth/profile', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { full_name, phone } = req.body;
    const updated = await db.updateUser(req.user!.id, {
      full_name: full_name || undefined,
      phone: phone !== undefined ? phone : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      return;
    }
    logger.info(`User profile updated: ${updated.full_name} (${updated.id})`, undefined, updated.tenant_id);
    res.json({
      id: updated.id,
      email: updated.email,
      full_name: updated.full_name,
      role: updated.role,
      tenant_id: updated.tenant_id,
      phone: updated.phone,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 2. Public Events Discovery (FR-06, Section 12)
// ==========================================

router.get('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, city, query, status } = req.query;
    const cacheKey = `events:list:${category || 'all'}:${city || 'all'}:${query || ''}:${status || 'published'}`;

    // Try Redis/Cache read (FR-13, Section 15.2)
    const cachedEvents = await cache.get<any[]>(cacheKey);
    if (cachedEvents) {
      res.json(cachedEvents);
      return;
    }

    const events = await db.getEvents({
      category: category as string,
      city: city as string,
      query: query as string,
      status: (status as string) || 'published',
    });

    // Populate ticket tier summary for each event
    const eventsWithDetails = await Promise.all(
      events.map(async (e) => {
        const tiers = await db.getTicketTiersByEventId(e.id);
        const minPriceCents = tiers.length > 0 ? Math.min(...tiers.map((t) => t.price_cents)) : 0;
        const totalRemaining = tiers.reduce((sum, t) => sum + t.available_quantity, 0);
        return {
          ...e,
          min_price_cents: minPriceCents,
          total_available_tickets: totalRemaining,
          tiers_count: tiers.length,
        };
      })
    );

    await cache.set(cacheKey, eventsWithDetails, 30); // 30s TTL
    res.json(eventsWithDetails);
  } catch (err: any) {
    logger.error('Failed to get events', err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/events/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const cacheKey = `event:detail:${id}`;

    const cachedEvent = await cache.get<any>(cacheKey);
    if (cachedEvent) {
      res.json(cachedEvent);
      return;
    }

    const event = await db.getEventById(id);
    if (!event) {
      res.status(404).json({ error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    const tiers = await db.getTicketTiersByEventId(event.id);
    const tenant = await db.getTenantById(event.tenant_id);

    const payload = {
      ...event,
      organizer_name: tenant ? tenant.name : 'Verified Organizer',
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price_cents: t.price_cents,
        currency: t.currency,
        total_quantity: t.total_quantity,
        available_quantity: t.available_quantity,
      })),
    };

    await cache.set(cacheKey, payload, 15);
    res.json(payload);
  } catch (err: any) {
    logger.error(`Failed to get event ${req.params.id}`, err);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 3. Organizer Event & Tier Management
// ==========================================

router.get('/organizer/events', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.role === 'admin' ? undefined : req.user!.tenant_id || undefined;
    const events = await db.getEvents({ tenant_id: tenantId });
    const eventsWithTiers = await Promise.all(
      events.map(async (e) => {
        const tiers = await db.getTicketTiersByEventId(e.id);
        return { ...e, tiers };
      })
    );
    res.json(eventsWithTiers);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/organizer/events', authenticateToken, requireRole('organizer', 'admin'), requireTenantScope, async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, category, description, venue, city, starts_at, ends_at, sales_cutoff, image_url, status } = req.body;

    if (!title || !venue || !starts_at || !ends_at || !sales_cutoff) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Title, venue, starts_at, ends_at, and sales_cutoff are required' });
      return;
    }

    // Business validation (FR-04, FR-14)
    const startDate = new Date(starts_at);
    const endDate = new Date(ends_at);
    const cutoffDate = new Date(sales_cutoff);

    if (endDate < startDate) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'End time cannot be earlier than start time' });
      return;
    }

    if (cutoffDate > startDate) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Sales cut-off date cannot be later than start time' });
      return;
    }

    const tenantId = req.user!.tenant_id!;
    const newEvent = await db.insertEvent({
      tenant_id: tenantId,
      organizer_id: req.user!.id,
      title,
      category: category || 'Tech',
      description: description || '',
      venue,
      city: city || 'Chennai',
      starts_at,
      ends_at,
      sales_cutoff,
      status: status || 'published',
      image_url: image_url || '/images/tech_summit.jpg',
    });

    // Invalidate event cache
    await cache.del('events:list:*');
    logger.info(`Event created: ${newEvent.title} (${newEvent.id})`, undefined, tenantId);

    res.status(201).json(newEvent);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/organizer/events/:eventId/tiers', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const { name, description, price_cents, total_quantity, currency } = req.body;

    const event = await db.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'EVENT_NOT_FOUND', message: 'Event not found' });
      return;
    }

    // Tenant check (FR-03, Section 13.2)
    if (req.user!.role !== 'admin' && event.tenant_id !== req.user!.tenant_id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot manage tiers for another tenant event' });
      return;
    }

    if (!name || price_cents === undefined || !total_quantity) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name, price_cents, and total_quantity are required' });
      return;
    }

    if (price_cents < 0 || total_quantity < 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Price and quantity must be non-negative' });
      return;
    }

    const newTier = await db.insertTicketTier({
      tenant_id: event.tenant_id,
      event_id: event.id,
      name,
      description: description || '',
      price_cents: parseInt(price_cents, 10),
      currency: currency || 'INR',
      total_quantity: parseInt(total_quantity, 10),
      available_quantity: parseInt(total_quantity, 10),
    });

    await cache.del(`event:detail:${eventId}`);
    await cache.del('events:list:*');
    logger.info(`Ticket tier created: ${newTier.name} for event ${eventId}`, undefined, event.tenant_id);

    res.status(201).json(newTier);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.put('/organizer/events/:eventId/tiers/:tierId', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId, tierId } = req.params;
    const { name, description, price_cents, total_quantity } = req.body;

    const tier = await db.getTicketTierById(tierId);
    if (!tier || tier.event_id !== eventId) {
      res.status(404).json({ error: 'TIER_NOT_FOUND', message: 'Ticket tier not found' });
      return;
    }

    if (req.user!.role !== 'admin' && tier.tenant_id !== req.user!.tenant_id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
      return;
    }

    const sold = tier.total_quantity - tier.available_quantity;
    const newTotal = total_quantity !== undefined ? parseInt(total_quantity, 10) : tier.total_quantity;

    if (newTotal < sold) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: `Total quantity cannot be lower than sold tickets (${sold})` });
      return;
    }

    const newAvailable = newTotal - sold;
    const updatedTier = await db.updateTicketTier(tierId, {
      name: name || tier.name,
      description: description !== undefined ? description : tier.description,
      price_cents: price_cents !== undefined ? parseInt(price_cents, 10) : tier.price_cents,
      total_quantity: newTotal,
      available_quantity: newAvailable,
    });

    await cache.del(`event:detail:${eventId}`);
    res.json(updatedTier);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.delete('/organizer/events/:eventId/tiers/:tierId', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId, tierId } = req.params;
    const tier = await db.getTicketTierById(tierId);
    if (!tier || tier.event_id !== eventId) {
      res.status(404).json({ error: 'TIER_NOT_FOUND', message: 'Ticket tier not found' });
      return;
    }

    if (req.user!.role !== 'admin' && tier.tenant_id !== req.user!.tenant_id) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied' });
      return;
    }

    const sold = tier.total_quantity - tier.available_quantity;
    if (sold > 0) {
      res.status(409).json({ error: 'TIER_HAS_BOOKINGS', message: 'Cannot delete a ticket tier that has sold tickets' });
      return;
    }

    await db.deleteTicketTier(tierId);
    await cache.del(`event:detail:${eventId}`);
    res.json({ success: true, message: 'Tier deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 4. Reservation Engine (FR-07, Section 10)
// ==========================================

router.post('/reservations', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenant_id, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Items array is required' });
      return;
    }

    const tenantId = tenant_id || req.user!.tenant_id || (await db.getTicketTierById(items[0].ticket_tier_id))?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unable to determine event tenant' });
      return;
    }

    const result = await reservationService.createReservation({
      tenant_id: tenantId,
      attendee_id: req.user!.id,
      items,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/reservations/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const resData = await reservationService.getReservation(id, req.user!.id, req.user!.role === 'admin');
    if (!resData) {
      res.status(404).json({ error: 'RESERVATION_NOT_FOUND', message: 'Reservation not found' });
      return;
    }
    res.json(resData);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/reservations/:id/cancel', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await reservationService.cancelReservation(id, req.user!.id);
    res.json(updated);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 5. Checkout & Orders (FR-08, Section 8.6)
// ==========================================

router.post('/orders', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reservation_id, idempotency_key } = req.body;
    const idempotencyKey = idempotency_key || (req.headers['idempotency-key'] as string);

    if (!reservation_id || !idempotencyKey) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reservation_id and idempotency_key are required' });
      return;
    }

    const order = await orderService.createOrder({
      reservation_id,
      attendee_id: req.user!.id,
      idempotency_key: idempotencyKey,
    });

    res.status(201).json(order);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/orders/my', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const orders = await orderService.getOrdersForAttendee(req.user!.id);
    const enrichedOrders = await Promise.all(
      orders.map(async (o) => {
        const resData = await db.getReservationById(o.reservation_id);
        let event = null;
        let tierSummary = '';
        if (resData && resData.items.length > 0) {
          const tier = await db.getTicketTierById(resData.items[0].ticket_tier_id);
          if (tier) {
            event = await db.getEventById(tier.event_id);
            tierSummary = `${resData.items.reduce((s, i) => s + i.quantity, 0)} x ${tier.name}`;
          }
        }
        return {
          ...o,
          event,
          tier_summary: tierSummary,
          expires_at: resData?.reservation.expires_at,
          reservation_status: resData?.reservation.status,
        };
      })
    );
    res.json(enrichedOrders);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/orders/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id, req.user!.id, req.user!.role === 'admin');
    if (!order) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
      return;
    }

    const resData = await db.getReservationById(order.reservation_id);
    let event = null;
    let tierName = 'General';
    let attendee = await db.getUserById(order.attendee_id);
    if (resData && resData.items.length > 0) {
      const tier = await db.getTicketTierById(resData.items[0].ticket_tier_id);
      if (tier) {
        tierName = tier.name;
        event = await db.getEventById(tier.event_id);
      }
    }

    res.json({
      order,
      event,
      reservation: resData?.reservation,
      tier_name: tierName,
      items: resData?.items || [],
      attendee: {
        name: attendee?.full_name || 'Attendee',
        email: attendee?.email || '',
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/orders/:id/cancel', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id, req.user!.id, req.user!.role === 'admin');
    if (!order) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
      return;
    }
    if (order.status === 'PAID') {
      res.status(400).json({ error: 'ALREADY_PAID', message: 'Cannot cancel a paid booking directly' });
      return;
    }

    await db.updateOrderStatus(order.id, 'FAILED');
    await reservationService.cancelReservation(order.reservation_id, req.user!.id);
    res.json({ success: true, message: 'Order and reservation cancelled, inventory restored' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/organizer/orders', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.role === 'admin' ? undefined : req.user!.tenant_id;
    const allOrders = tenantId ? await db.getOrdersByTenant(tenantId) : await db.getAllOrders();

    const enriched = await Promise.all(
      allOrders.map(async (o) => {
        const attendee = await db.getUserById(o.attendee_id);
        const resData = await db.getReservationById(o.reservation_id);
        let event = null;
        let ticketsCount = 1;
        if (resData && resData.items.length > 0) {
          const tier = await db.getTicketTierById(resData.items[0].ticket_tier_id);
          if (tier) event = await db.getEventById(tier.event_id);
          ticketsCount = resData.items.reduce((s, it) => s + it.quantity, 0);
        }
        return {
          id: o.id,
          attendee_name: attendee?.full_name || 'Guest User',
          attendee_email: attendee?.email || '',
          event_title: event?.title || 'General Event',
          tickets_count: ticketsCount,
          total_cents: o.total_cents,
          status: o.status,
          created_at: o.created_at,
        };
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 6. Payment Gateway Simulation (Section 11)
// ==========================================

router.post('/payments/mock', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { order_id, outcome, payment_method, mode } = req.body;
    if (!order_id) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id is required' });
      return;
    }

    if (mode === 'async') {
      const asyncResult = await paymentService.initiateAsyncMockPayment({
        order_id,
        attendee_id: req.user!.id,
        outcome: outcome || 'approve',
        payment_method: payment_method || 'credit_card',
      });
      res.status(202).json(asyncResult);
      return;
    }

    const result = await paymentService.processMockPayment({
      order_id,
      attendee_id: req.user!.id,
      outcome: outcome || 'approve',
      payment_method: payment_method || 'credit_card',
    });

    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/payments/webhook/mock', async (req: Request, res: Response): Promise<void> => {
  try {
    const secretHeader = req.headers['x-mock-webhook-secret'] as string;
    const result = await paymentService.processWebhook(req.body, secretHeader);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 7. Organizer & Admin Analytics (FR-11, 12)
// ==========================================

router.get('/organizer/analytics', authenticateToken, requireRole('organizer', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.role === 'admin' ? undefined : req.user!.tenant_id;
    const data = await analyticsService.getOrganizerAnalytics(tenantId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

// ==========================================
// 8. Admin Oversight & Management (FR-12)
// ==========================================

router.get('/admin/tenants', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await db.getTenants();
    const tenantsWithCounts = await Promise.all(
      tenants.map(async (t) => {
        const events = await db.getEvents({ tenant_id: t.id });
        return {
          ...t,
          events_count: events.length,
        };
      })
    );
    res.json(tenantsWithCounts);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/admin/analytics', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await analyticsService.getPlatformAdminMetrics();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.post('/admin/tenants', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, contact_email } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name and slug are required' });
      return;
    }

    const existing = await db.getTenantBySlug(slug);
    if (existing) {
      res.status(409).json({ error: 'DUPLICATE_RESOURCE', message: 'Tenant slug already exists' });
      return;
    }

    const newTenant = await db.insertTenant({
      name,
      slug,
      contact_email: contact_email || '',
      status: 'active',
    });

    logger.info(`Admin created new tenant: ${newTenant.name} (${newTenant.slug})`);
    res.status(201).json(newTenant);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/admin/users', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await db.getUsers();
    const tenants = await db.getTenants();
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      phone: u.phone,
      role: u.role,
      tenant_name: u.tenant_id ? tenantMap.get(u.tenant_id) || 'Unknown Tenant' : 'Platform Global',
      status: u.status,
      created_at: u.created_at,
    }));

    res.json(sanitizedUsers);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/admin/logs', authenticateToken, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await db.getSystemLogs(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

router.get('/health', async (req: Request, res: Response): Promise<void> => {
  res.json({
    status: 'ok',
    service: 'EventForge Multi-Tenant Ticketing API',
    time: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;
