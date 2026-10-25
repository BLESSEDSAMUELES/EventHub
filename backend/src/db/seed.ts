import bcrypt from 'bcryptjs';
import { db } from './index';
import { logger } from '../lib/logger';

export async function seedDatabase() {
  await db.resetDatabase();
  const passwordHash = await bcrypt.hash('password123', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  // 1. Seed Tenants
  const tenantSairam = await db.insertTenant({
    name: 'SaiRam Tech Club',
    slug: 'sairam',
    contact_email: 'sairam@sairam.edu',
    status: 'active',
  });

  const tenantChennai = await db.insertTenant({
    name: 'Chennai Events',
    slug: 'chennai-events',
    contact_email: 'info@chennaievents.in',
    status: 'active',
  });

  const tenantMusic = await db.insertTenant({
    name: 'Music India',
    slug: 'music-india',
    contact_email: 'hello@musicindia.com',
    status: 'active',
  });

  const tenantCollege = await db.insertTenant({
    name: 'College Fests',
    slug: 'college-fests',
    contact_email: 'fests@tamilnaducolleges.org',
    status: 'active',
  });

  // 2. Seed Users
  const adminUser = await db.insertUser({
    tenant_id: null,
    email: 'admin@example.com',
    full_name: 'Admin User',
    phone: '+91 9000000001',
    password_hash: adminPasswordHash,
    role: 'admin',
    status: 'active',
  });

  const attendeeBlessed = await db.insertUser({
    tenant_id: tenantSairam.id,
    email: 'blessed@example.com',
    full_name: 'Blessed Samuel',
    phone: '+91 9876543210',
    password_hash: passwordHash,
    role: 'attendee',
    status: 'active',
  });

  const organizerPriya = await db.insertUser({
    tenant_id: tenantSairam.id,
    email: 'priya@example.com',
    full_name: 'Priya Sharma',
    phone: '+91 9123456780',
    password_hash: passwordHash,
    role: 'organizer',
    status: 'active',
  });

  const organizerArun = await db.insertUser({
    tenant_id: tenantChennai.id,
    email: 'arun@example.com',
    full_name: 'Arun Kumar',
    phone: '+91 9988776655',
    password_hash: passwordHash,
    role: 'organizer',
    status: 'active',
  });

  const attendeeVijay = await db.insertUser({
    tenant_id: tenantChennai.id,
    email: 'vijay@example.com',
    full_name: 'Vijay Raj',
    phone: '+91 9444455555',
    password_hash: passwordHash,
    role: 'attendee',
    status: 'active',
  });

  // 3. Seed Events
  const eventTech = await db.insertEvent({
    tenant_id: tenantSairam.id,
    organizer_id: organizerPriya.id,
    title: 'Tech Summit 2026',
    category: 'Tech',
    description: 'Join industry leaders and innovators at Tech Summit 2026. Explore the future of AI, Web3, and more with hands-on workshops and networking opportunities.',
    venue: 'Chennai Trade Centre, Chennai',
    city: 'Chennai',
    starts_at: '2026-11-15T10:00:00Z',
    ends_at: '2026-11-15T17:00:00Z',
    sales_cutoff: '2026-11-14T23:59:59Z',
    status: 'published',
    image_url: '/images/tech_summit.jpg',
  });

  const eventMusic = await db.insertEvent({
    tenant_id: tenantChennai.id,
    organizer_id: organizerArun.id,
    title: 'Music Fest',
    category: 'Music',
    description: 'Experience the biggest musical extravaganza of the year featuring top indie artists, vibrant lasers, food courts, and non-stop rhythm.',
    venue: 'JLN Stadium, Chennai',
    city: 'Chennai',
    starts_at: '2026-11-22T17:00:00Z',
    ends_at: '2026-11-22T23:00:00Z',
    sales_cutoff: '2026-11-22T12:00:00Z',
    status: 'published',
    image_url: '/images/music_fest.jpg',
  });

  const eventFood = await db.insertEvent({
    tenant_id: tenantMusic.id,
    organizer_id: organizerPriya.id,
    title: 'Food Carnival',
    category: 'Food',
    description: 'Savor gourmet street delicacies, artisanal bakes, and live barbecue from over 60 premier culinary creators and food trucks.',
    venue: 'Island Grounds, Chennai',
    city: 'Chennai',
    starts_at: '2026-12-05T12:00:00Z',
    ends_at: '2026-12-05T22:00:00Z',
    sales_cutoff: '2026-12-05T10:00:00Z',
    status: 'published',
    image_url: '/images/food_carnival.jpg',
  });

  // 4. Seed Ticket Tiers
  const tierVip = await db.insertTicketTier({
    tenant_id: tenantSairam.id,
    event_id: eventTech.id,
    name: 'VIP',
    description: 'Premium seating, lounge access',
    price_cents: 249900,
    currency: 'INR',
    total_quantity: 200,
    available_quantity: 120, // 80 sold
  });

  const tierGeneral = await db.insertTicketTier({
    tenant_id: tenantSairam.id,
    event_id: eventTech.id,
    name: 'General Admission',
    description: 'Standard entry',
    price_cents: 99900,
    currency: 'INR',
    total_quantity: 500,
    available_quantity: 450, // 50 sold
  });

  const tierStudent = await db.insertTicketTier({
    tenant_id: tenantSairam.id,
    event_id: eventTech.id,
    name: 'Student Pass',
    description: 'Valid student ID required',
    price_cents: 49900,
    currency: 'INR',
    total_quantity: 300,
    available_quantity: 300,
  });

  // Music Fest Tiers
  const tierMusicVip = await db.insertTicketTier({
    tenant_id: tenantChennai.id,
    event_id: eventMusic.id,
    name: 'VIP Pass',
    description: 'Front stage VIP lounge',
    price_cents: 199900,
    currency: 'INR',
    total_quantity: 150,
    available_quantity: 110,
  });

  const tierMusicGeneral = await db.insertTicketTier({
    tenant_id: tenantChennai.id,
    event_id: eventMusic.id,
    name: 'General Admission',
    description: 'Standard stadium entry',
    price_cents: 79900,
    currency: 'INR',
    total_quantity: 800,
    available_quantity: 720,
  });

  // Food Carnival Tiers
  await db.insertTicketTier({
    tenant_id: tenantMusic.id,
    event_id: eventFood.id,
    name: 'Tasting Pass',
    description: 'Entry with 3 food coupons',
    price_cents: 49900,
    currency: 'INR',
    total_quantity: 400,
    available_quantity: 350,
  });

  // 5. Seed Initial Bookings for Blessed Samuel
  // Booking 1: Tech Summit 2026 (Confirmed) - ORD-3a9d5e
  const res1 = await db.insertReservation(
    {
      tenant_id: tenantSairam.id,
      attendee_id: attendeeBlessed.id,
      status: 'CONFIRMED',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    [
      {
        ticket_tier_id: tierVip.id,
        quantity: 1,
        unit_price_cents: 249900,
      },
    ]
  );

  const order1 = await db.insertOrder({
    tenant_id: tenantSairam.id,
    reservation_id: res1.reservation.id,
    attendee_id: attendeeBlessed.id,
    total_cents: 254900,
    status: 'PAID',
    idempotency_key: 'idem-initial-seed-01',
  });

  await db.insertPaymentTransaction({
    order_id: order1.id,
    provider_reference: 'pay_mock_3a9d5e_01',
    amount_cents: 254900,
    payment_method: 'credit_card',
    status: 'SUCCESS',
    raw_result: { mock: true, code: 'AUTHORIZED', auth_id: 'AUTH-99238' },
  });

  // Booking 2: Music Fest (Pending Payment) - ORD-7c1def
  const res2 = await db.insertReservation(
    {
      tenant_id: tenantChennai.id,
      attendee_id: attendeeBlessed.id,
      status: 'CHECKOUT',
      expires_at: new Date(Date.now() + 600000).toISOString(),
    },
    [
      {
        ticket_tier_id: tierMusicGeneral.id,
        quantity: 2,
        unit_price_cents: 79900,
      },
    ]
  );

  const order2 = await db.insertOrder({
    tenant_id: tenantChennai.id,
    reservation_id: res2.reservation.id,
    attendee_id: attendeeBlessed.id,
    total_cents: 159800,
    status: 'PENDING',
    idempotency_key: 'idem-initial-seed-02',
  });

  // 6. Seed System Logs matching Screen 18
  await db.insertSystemLog({
    tenant_id: tenantSairam.id,
    level: 'INFO',
    message: 'User logged in: Blessed Samuel (blessed@example.com)',
    metadata: { role: 'attendee', ip: '127.0.0.1' },
  });
  await db.insertSystemLog({
    tenant_id: tenantSairam.id,
    level: 'INFO',
    message: 'Event created: Tech Summit 2026',
    metadata: { event_id: eventTech.id, organizer: 'Priya Sharma' },
  });
  await db.insertSystemLog({
    tenant_id: tenantChennai.id,
    level: 'WARN',
    message: 'Payment failed (mock): simulated card decline',
    metadata: { order_id: 'ORD-7c1def', reason: 'Insufficient funds' },
  });
  await db.insertSystemLog({
    tenant_id: tenantSairam.id,
    level: 'INFO',
    message: 'Reservation hold confirmed: RES-8f17c2d',
    metadata: { order_id: 'ORD-3a9d5e', amount_cents: 254900 },
  });
  await db.insertSystemLog({
    tenant_id: null,
    level: 'INFO',
    message: 'Ticket inventory updated: VIP tier stock synchronized',
    metadata: { tier_id: tierVip.id, available_quantity: 120 },
  });

  logger.info('Database seeded successfully with default tenants, users, events, and bookings.');
}

if (require.main === module) {
  seedDatabase().then(() => {
    console.log('Seed completed successfully.');
    process.exit(0);
  });
}
