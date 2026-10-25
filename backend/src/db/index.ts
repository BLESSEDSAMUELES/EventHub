import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  status: 'active' | 'suspended' | 'inactive';
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string | null;
  email: string;
  full_name: string;
  phone?: string;
  password_hash: string;
  role: 'admin' | 'organizer' | 'attendee';
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
}

export interface Event {
  id: string;
  tenant_id: string;
  organizer_id: string;
  title: string;
  category: string;
  description: string;
  venue: string;
  city: string;
  starts_at: string;
  ends_at: string;
  sales_cutoff: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  image_url: string;
  created_at: string;
}

export interface TicketTier {
  id: string;
  tenant_id: string;
  event_id: string;
  name: string;
  description?: string;
  price_cents: number;
  currency: string;
  total_quantity: number;
  available_quantity: number;
  created_at: string;
}

export interface Reservation {
  id: string;
  tenant_id: string;
  attendee_id: string;
  status: 'ACTIVE' | 'CHECKOUT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ReservationItem {
  id: string;
  reservation_id: string;
  ticket_tier_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: string;
  tenant_id: string;
  reservation_id: string;
  attendee_id: string;
  total_cents: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  idempotency_key: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  provider_reference: string;
  amount_cents: number;
  payment_method: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  raw_result?: any;
  created_at: string;
}

export interface SystemLog {
  id: string;
  tenant_id: string | null;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: any;
  created_at: string;
}

interface DatabaseState {
  tenants: Tenant[];
  users: User[];
  events: Event[];
  ticket_tiers: TicketTier[];
  reservations: Reservation[];
  reservation_items: ReservationItem[];
  orders: Order[];
  payment_transactions: PaymentTransaction[];
  system_logs: SystemLog[];
}

class DatabaseEngine {
  private pool: Pool | null = null;
  private isPgActive: boolean = false;

  private state: DatabaseState = {
    tenants: [],
    users: [],
    events: [],
    ticket_tiers: [],
    reservations: [],
    reservation_items: [],
    orders: [],
    payment_transactions: [],
    system_logs: [],
  };

  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    if (config.databaseUrl) {
      try {
        this.pool = new Pool({
          connectionString: config.databaseUrl,
          ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        this.isPgActive = true;
        logger.info(`PostgreSQL pool initialized for ${config.databaseUrl.replace(/:[^:]*@/, ':****@')}`);
      } catch (err) {
        logger.error('Failed to initialize PostgreSQL pool, falling back to local ACID engine', err);
        this.isPgActive = false;
      }
    }
  }

  isPostgreSql(): boolean {
    return this.isPgActive && this.pool !== null;
  }

  getPool(): Pool | null {
    return this.pool;
  }

  private async acquireLock(): Promise<() => void> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentLock = this.lockPromise;
    this.lockPromise = this.lockPromise.then(() => nextLock);
    await currentLock;
    return release!;
  }

  async withLock<T>(action: () => Promise<T> | T): Promise<T> {
    const release = await this.acquireLock();
    try {
      return await action();
    } finally {
      release();
    }
  }

  // Tenants
  async getTenants(): Promise<Tenant[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return res.rows;
      } catch (e) {
        logger.warn('PG getTenants fallback', e);
      }
    }
    return [...this.state.tenants];
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM tenants WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getTenantById fallback', e);
      }
    }
    return this.state.tenants.find((t) => t.id === id) || null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getTenantBySlug fallback', e);
      }
    }
    return this.state.tenants.find((t) => t.slug === slug) || null;
  }

  async insertTenant(tenant: Omit<Tenant, 'id' | 'created_at'>): Promise<Tenant> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newTenant: Tenant = { ...tenant, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO tenants (id, name, slug, contact_email, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [id, tenant.name, tenant.slug, tenant.contact_email, tenant.status, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertTenant fallback', e);
      }
    }

    this.state.tenants.push(newTenant);
    return newTenant;
  }

  // Users
  async getUsers(): Promise<User[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM users ORDER BY created_at DESC');
        return res.rows;
      } catch (e) {
        logger.warn('PG getUsers fallback', e);
      }
    }
    return [...this.state.users];
  }

  async getUserById(id: string): Promise<User | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getUserById fallback', e);
      }
    }
    return this.state.users.find((u) => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getUserByEmail fallback', e);
      }
    }
    return this.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async insertUser(user: Omit<User, 'id' | 'created_at'>): Promise<User> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newUser: User = { ...user, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO users (id, tenant_id, email, full_name, phone, password_hash, role, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [id, user.tenant_id, user.email, user.full_name, user.phone || '', user.password_hash, user.role, user.status, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertUser fallback', e);
      }
    }

    this.state.users.push(newUser);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    if (this.isPostgreSql()) {
      try {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        if (fields.length === 0) return this.getUserById(id);

        const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        const res = await this.pool!.query(`UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG updateUser fallback', e);
      }
    }

    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.state.users[idx] = { ...this.state.users[idx], ...updates };
    return this.state.users[idx];
  }

  // Events
  async getEvents(filters?: { status?: string; tenant_id?: string; category?: string; city?: string; query?: string }): Promise<Event[]> {
    if (this.isPostgreSql()) {
      try {
        let sql = 'SELECT * FROM events WHERE 1=1';
        const params: any[] = [];
        if (filters?.status) {
          params.push(filters.status);
          sql += ` AND status = $${params.length}`;
        }
        if (filters?.tenant_id) {
          params.push(filters.tenant_id);
          sql += ` AND tenant_id = $${params.length}`;
        }
        if (filters?.category && filters.category !== 'all') {
          params.push(filters.category.toLowerCase());
          sql += ` AND LOWER(category) = $${params.length}`;
        }
        if (filters?.city && filters.city !== 'all') {
          params.push(filters.city.toLowerCase());
          sql += ` AND LOWER(city) = $${params.length}`;
        }
        if (filters?.query) {
          params.push(`%${filters.query.toLowerCase()}%`);
          sql += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(venue) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`;
        }
        sql += ' ORDER BY starts_at ASC';
        const res = await this.pool!.query(sql, params);
        return res.rows;
      } catch (e) {
        logger.warn('PG getEvents fallback', e);
      }
    }

    let list = [...this.state.events];
    if (filters?.status) list = list.filter((e) => e.status === filters.status);
    if (filters?.tenant_id) list = list.filter((e) => e.tenant_id === filters.tenant_id);
    if (filters?.category && filters.category !== 'all') {
      list = list.filter((e) => e.category.toLowerCase() === filters.category!.toLowerCase());
    }
    if (filters?.city && filters.city !== 'all') {
      list = list.filter((e) => e.city.toLowerCase() === filters.city!.toLowerCase());
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }
    return list;
  }

  async getEventById(id: string): Promise<Event | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM events WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getEventById fallback', e);
      }
    }
    return this.state.events.find((e) => e.id === id) || null;
  }

  async insertEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<Event> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newEvent: Event = { ...event, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO events (id, tenant_id, organizer_id, title, category, description, venue, city, starts_at, ends_at, sales_cutoff, status, image_url, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
          [id, event.tenant_id, event.organizer_id, event.title, event.category, event.description, event.venue, event.city, event.starts_at, event.ends_at, event.sales_cutoff, event.status, event.image_url, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertEvent fallback', e);
      }
    }

    this.state.events.push(newEvent);
    return newEvent;
  }

  // Ticket Tiers
  async getTicketTiersByEventId(eventId: string): Promise<TicketTier[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM ticket_tiers WHERE event_id = $1 ORDER BY price_cents DESC', [eventId]);
        return res.rows;
      } catch (e) {
        logger.warn('PG getTicketTiersByEventId fallback', e);
      }
    }
    return this.state.ticket_tiers.filter((t) => t.event_id === eventId);
  }

  async getTicketTierById(id: string): Promise<TicketTier | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM ticket_tiers WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getTicketTierById fallback', e);
      }
    }
    return this.state.ticket_tiers.find((t) => t.id === id) || null;
  }

  async insertTicketTier(tier: Omit<TicketTier, 'id' | 'created_at'>): Promise<TicketTier> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newTier: TicketTier = { ...tier, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO ticket_tiers (id, tenant_id, event_id, name, description, price_cents, currency, total_quantity, available_quantity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [id, tier.tenant_id, tier.event_id, tier.name, tier.description || '', tier.price_cents, tier.currency || 'INR', tier.total_quantity, tier.available_quantity, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertTicketTier fallback', e);
      }
    }

    this.state.ticket_tiers.push(newTier);
    return newTier;
  }

  async updateTicketTier(id: string, updates: Partial<TicketTier>): Promise<TicketTier | null> {
    if (this.isPostgreSql()) {
      try {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        if (fields.length === 0) return this.getTicketTierById(id);

        const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        const res = await this.pool!.query(`UPDATE ticket_tiers SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG updateTicketTier fallback', e);
      }
    }

    const idx = this.state.ticket_tiers.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.state.ticket_tiers[idx] = { ...this.state.ticket_tiers[idx], ...updates };
    return this.state.ticket_tiers[idx];
  }

  async deleteTicketTier(id: string): Promise<boolean> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('DELETE FROM ticket_tiers WHERE id = $1', [id]);
        return (res.rowCount || 0) > 0;
      } catch (e) {
        logger.warn('PG deleteTicketTier fallback', e);
      }
    }

    const init = this.state.ticket_tiers.length;
    this.state.ticket_tiers = this.state.ticket_tiers.filter((t) => t.id !== id);
    return this.state.ticket_tiers.length < init;
  }

  // Concurrency-Safe Atomic Reservation Transaction (PostgreSQL SELECT ... FOR UPDATE + In-Memory Fallback)
  async executeReservationTransaction(
    tenantId: string,
    attendeeId: string,
    items: { ticket_tier_id: string; quantity: number }[],
    holdMinutes: number
  ): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    if (this.isPostgreSql()) {
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');
        const now = new Date();
        const validatedItems: { tier: TicketTier; quantity: number }[] = [];

        for (const reqItem of items) {
          // Explicit PostgreSQL Row-Level Lock (SELECT ... FOR UPDATE)
          const tierRes = await client.query(
            'SELECT * FROM ticket_tiers WHERE id = $1 FOR UPDATE',
            [reqItem.ticket_tier_id]
          );

          if (tierRes.rows.length === 0) {
            throw { status: 404, code: 'TIER_NOT_FOUND', message: `Ticket tier ${reqItem.ticket_tier_id} not found` };
          }
          const tier: TicketTier = tierRes.rows[0];

          const eventRes = await client.query('SELECT * FROM events WHERE id = $1', [tier.event_id]);
          if (eventRes.rows.length === 0) {
            throw { status: 404, code: 'EVENT_NOT_FOUND', message: 'Associated event not found' };
          }
          const event = eventRes.rows[0];

          if (event.status !== 'published') {
            throw { status: 409, code: 'EVENT_NOT_PUBLISHED', message: 'Event is not open for ticket sales' };
          }

          const cutoffDate = new Date(event.sales_cutoff);
          if (now > cutoffDate) {
            throw { status: 409, code: 'SALES_CUTOFF_PASSED', message: 'Sales cut-off date has passed for this event' };
          }

          if (tier.available_quantity < reqItem.quantity) {
            throw {
              status: 409,
              code: 'SOLD_OUT',
              message: `Insufficient inventory for tier "${tier.name}". Available: ${tier.available_quantity}, requested: ${reqItem.quantity}`,
            };
          }

          validatedItems.push({ tier, quantity: reqItem.quantity });
        }

        // Decrement available_quantity atomically inside transaction
        for (const { tier, quantity } of validatedItems) {
          await client.query(
            'UPDATE ticket_tiers SET available_quantity = available_quantity - $1 WHERE id = $2',
            [quantity, tier.id]
          );
        }

        const resId = uuidv4();
        const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000).toISOString();
        const nowIso = now.toISOString();

        await client.query(
          `INSERT INTO reservations (id, tenant_id, attendee_id, status, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [resId, tenantId, attendeeId, 'ACTIVE', expiresAt, nowIso, nowIso]
        );

        const insertedItems: ReservationItem[] = [];
        for (const { tier, quantity } of validatedItems) {
          const itemId = uuidv4();
          await client.query(
            `INSERT INTO reservation_items (id, reservation_id, ticket_tier_id, quantity, unit_price_cents)
             VALUES ($1, $2, $3, $4, $5)`,
            [itemId, resId, tier.id, quantity, tier.price_cents]
          );
          insertedItems.push({
            id: itemId,
            reservation_id: resId,
            ticket_tier_id: tier.id,
            quantity,
            unit_price_cents: tier.price_cents,
          });
        }

        await client.query('COMMIT');

        const newReservation: Reservation = {
          id: resId,
          tenant_id: tenantId,
          attendee_id: attendeeId,
          status: 'ACTIVE',
          expires_at: expiresAt,
          created_at: nowIso,
          updated_at: nowIso,
        };
        return { reservation: newReservation, items: insertedItems };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // In-memory fallback
    return this.withLock(async () => {
      const now = new Date();
      const validatedItems: { tier: TicketTier; quantity: number }[] = [];

      for (const reqItem of items) {
        const tier = this.state.ticket_tiers.find((t) => t.id === reqItem.ticket_tier_id);
        if (!tier) {
          throw { status: 404, code: 'TIER_NOT_FOUND', message: `Ticket tier ${reqItem.ticket_tier_id} not found` };
        }

        const event = this.state.events.find((e) => e.id === tier.event_id);
        if (!event) {
          throw { status: 404, code: 'EVENT_NOT_FOUND', message: 'Associated event not found' };
        }

        if (event.status !== 'published') {
          throw { status: 409, code: 'EVENT_NOT_PUBLISHED', message: 'Event is not open for ticket sales' };
        }

        const cutoffDate = new Date(event.sales_cutoff);
        if (now > cutoffDate) {
          throw { status: 409, code: 'SALES_CUTOFF_PASSED', message: 'Sales cut-off date has passed for this event' };
        }

        if (tier.available_quantity < reqItem.quantity) {
          throw {
            status: 409,
            code: 'SOLD_OUT',
            message: `Insufficient inventory for tier "${tier.name}". Available: ${tier.available_quantity}, requested: ${reqItem.quantity}`,
          };
        }

        validatedItems.push({ tier, quantity: reqItem.quantity });
      }

      for (const { tier, quantity } of validatedItems) {
        tier.available_quantity -= quantity;
      }

      const resId = uuidv4();
      const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000).toISOString();
      const nowIso = now.toISOString();

      const newRes: Reservation = {
        id: resId,
        tenant_id: tenantId,
        attendee_id: attendeeId,
        status: 'ACTIVE',
        expires_at: expiresAt,
        created_at: nowIso,
        updated_at: nowIso,
      };
      this.state.reservations.push(newRes);

      const insertedItems: ReservationItem[] = validatedItems.map(({ tier, quantity }) => {
        const lineItem: ReservationItem = {
          id: uuidv4(),
          reservation_id: resId,
          ticket_tier_id: tier.id,
          quantity,
          unit_price_cents: tier.price_cents,
        };
        this.state.reservation_items.push(lineItem);
        return lineItem;
      });

      return { reservation: newRes, items: insertedItems };
    });
  }

  // Concurrency-safe atomic reservation insertion
  async insertReservation(
    reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>,
    items: Omit<ReservationItem, 'id' | 'reservation_id'>[]
  ): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    const resId = uuidv4();
    const now = new Date().toISOString();
    const newRes: Reservation = { ...reservation, id: resId, created_at: now, updated_at: now };

    if (this.isPostgreSql()) {
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO reservations (id, tenant_id, attendee_id, status, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [resId, reservation.tenant_id, reservation.attendee_id, reservation.status, reservation.expires_at, now, now]
        );

        const insertedItems: ReservationItem[] = [];
        for (const item of items) {
          const itemId = uuidv4();
          await client.query(
            `INSERT INTO reservation_items (id, reservation_id, ticket_tier_id, quantity, unit_price_cents)
             VALUES ($1, $2, $3, $4, $5)`,
            [itemId, resId, item.ticket_tier_id, item.quantity, item.unit_price_cents]
          );
          insertedItems.push({ ...item, id: itemId, reservation_id: resId });
        }

        await client.query('COMMIT');
        return { reservation: newRes, items: insertedItems };
      } catch (e) {
        await client.query('ROLLBACK');
        logger.warn('PG insertReservation failed, falling back', e);
      } finally {
        client.release();
      }
    }

    this.state.reservations.push(newRes);
    const localItems = items.map((item) => {
      const lineItem = { ...item, id: uuidv4(), reservation_id: resId };
      this.state.reservation_items.push(lineItem);
      return lineItem;
    });
    return { reservation: newRes, items: localItems };
  }

  async getReservationById(id: string): Promise<{ reservation: Reservation; items: ReservationItem[] } | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM reservations WHERE id = $1', [id]);
        if (res.rows.length === 0) return null;
        const items = await this.pool!.query('SELECT * FROM reservation_items WHERE reservation_id = $1', [id]);
        return { reservation: res.rows[0], items: items.rows };
      } catch (e) {
        logger.warn('PG getReservationById fallback', e);
      }
    }

    const res = this.state.reservations.find((r) => r.id === id);
    if (!res) return null;
    const items = this.state.reservation_items.filter((item) => item.reservation_id === id);
    return { reservation: { ...res }, items: [...items] };
  }

  async updateReservationStatus(id: string, status: Reservation['status']): Promise<Reservation | null> {
    const now = new Date().toISOString();
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('UPDATE reservations SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *', [status, now, id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG updateReservationStatus fallback', e);
      }
    }

    const res = this.state.reservations.find((r) => r.id === id);
    if (!res) return null;
    res.status = status;
    res.updated_at = now;
    return { ...res };
  }

  async getExpiredActiveReservations(): Promise<Reservation[]> {
    const now = new Date().toISOString();
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `SELECT * FROM reservations WHERE status IN ('ACTIVE', 'CHECKOUT') AND expires_at <= $1`,
          [now]
        );
        return res.rows;
      } catch (e) {
        logger.warn('PG getExpiredActiveReservations fallback', e);
      }
    }

    return this.state.reservations.filter(
      (r) => (r.status === 'ACTIVE' || r.status === 'CHECKOUT') && r.expires_at <= now
    );
  }

  // Orders
  async getOrderById(id: string): Promise<Order | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getOrderById fallback', e);
      }
    }
    return this.state.orders.find((o) => o.id === id) || null;
  }

  async getOrderByReservationId(reservationId: string): Promise<Order | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders WHERE reservation_id = $1', [reservationId]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getOrderByReservationId fallback', e);
      }
    }
    return this.state.orders.find((o) => o.reservation_id === reservationId) || null;
  }

  async getOrderByAttendeeAndIdempotency(attendeeId: string, idempotencyKey: string): Promise<Order | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders WHERE attendee_id = $1 AND idempotency_key = $2', [attendeeId, idempotencyKey]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG getOrderByAttendeeAndIdempotency fallback', e);
      }
    }
    return this.state.orders.find((o) => o.attendee_id === attendeeId && o.idempotency_key === idempotencyKey) || null;
  }

  async getOrdersByAttendee(attendeeId: string): Promise<Order[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders WHERE attendee_id = $1 ORDER BY created_at DESC', [attendeeId]);
        return res.rows;
      } catch (e) {
        logger.warn('PG getOrdersByAttendee fallback', e);
      }
    }
    return this.state.orders.filter((o) => o.attendee_id === attendeeId);
  }

  async getOrdersByTenant(tenantId: string): Promise<Order[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
        return res.rows;
      } catch (e) {
        logger.warn('PG getOrdersByTenant fallback', e);
      }
    }
    return this.state.orders.filter((o) => o.tenant_id === tenantId);
  }

  async getAllOrders(): Promise<Order[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM orders ORDER BY created_at DESC');
        return res.rows;
      } catch (e) {
        logger.warn('PG getAllOrders fallback', e);
      }
    }
    return [...this.state.orders];
  }

  async insertOrder(order: Omit<Order, 'id' | 'created_at'>): Promise<Order> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newOrder: Order = { ...order, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO orders (id, tenant_id, reservation_id, attendee_id, total_cents, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [id, order.tenant_id, order.reservation_id, order.attendee_id, order.total_cents, order.status, order.idempotency_key, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertOrder fallback', e);
      }
    }

    this.state.orders.push(newOrder);
    return newOrder;
  }

  async updateOrderStatus(id: string, status: Order['status']): Promise<Order | null> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        return res.rows[0] || null;
      } catch (e) {
        logger.warn('PG updateOrderStatus fallback', e);
      }
    }

    const order = this.state.orders.find((o) => o.id === id);
    if (!order) return null;
    order.status = status;
    return { ...order };
  }

  // Payment Transactions
  async insertPaymentTransaction(txn: Omit<PaymentTransaction, 'id' | 'created_at'>): Promise<PaymentTransaction> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newTxn: PaymentTransaction = { ...txn, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO payment_transactions (id, order_id, provider_reference, amount_cents, payment_method, status, raw_result, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [id, txn.order_id, txn.provider_reference, txn.amount_cents, txn.payment_method, txn.status, txn.raw_result ? JSON.stringify(txn.raw_result) : null, created_at]
        );
        return res.rows[0];
      } catch (e) {
        logger.warn('PG insertPaymentTransaction fallback', e);
      }
    }

    this.state.payment_transactions.push(newTxn);
    return newTxn;
  }

  async getPaymentTransactionsByOrder(orderId: string): Promise<PaymentTransaction[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM payment_transactions WHERE order_id = $1', [orderId]);
        return res.rows;
      } catch (e) {
        logger.warn('PG getPaymentTransactionsByOrder fallback', e);
      }
    }
    return this.state.payment_transactions.filter((p) => p.order_id === orderId);
  }

  // System Logs
  async getSystemLogs(limit: number = 100): Promise<SystemLog[]> {
    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT $1', [limit]);
        return res.rows;
      } catch (e) {
        logger.warn('PG getSystemLogs fallback', e);
      }
    }
    return [...this.state.system_logs].slice(0, limit);
  }

  async insertSystemLog(log: Omit<SystemLog, 'id' | 'created_at'>): Promise<SystemLog> {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const newLog: SystemLog = { ...log, id, created_at };

    if (this.isPostgreSql()) {
      try {
        const res = await this.pool!.query(
          `INSERT INTO system_logs (id, tenant_id, level, message, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [id, log.tenant_id, log.level, log.message, log.metadata ? JSON.stringify(log.metadata) : null, created_at]
        );
        return res.rows[0];
      } catch (e) {
        // quiet
      }
    }

    this.state.system_logs.unshift(newLog);
    if (this.state.system_logs.length > 500) this.state.system_logs.pop();
    return newLog;
  }

  resetState(): void {
    this.state = {
      tenants: [],
      users: [],
      events: [],
      ticket_tiers: [],
      reservations: [],
      reservation_items: [],
      orders: [],
      payment_transactions: [],
      system_logs: [],
    };
  }

  async resetDatabase(): Promise<void> {
    this.resetState();
    if (this.isPostgreSql()) {
      try {
        await this.pool!.query(`
          TRUNCATE TABLE system_logs, payment_transactions, orders, reservation_items, reservations, ticket_tiers, events, users, tenants CASCADE;
        `);
      } catch (e) {
        logger.warn('PG TRUNCATE error during reset (tables may be empty or unmigrated)', e);
      }
    }
  }
}

export const db = new DatabaseEngine();
