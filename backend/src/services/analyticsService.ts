import { db } from '../db';

export class AnalyticsService {
  async getOrganizerAnalytics(tenantId?: string | null) {
    const allOrders = tenantId ? await db.getOrdersByTenant(tenantId) : await db.getAllOrders();
    const paidOrders = allOrders.filter((o) => o.status === 'PAID');

    // Revenue in cents and rupees
    const grossRevenueCents = paidOrders.reduce((sum, o) => sum + o.total_cents, 0);
    const totalRevenue = Math.round(grossRevenueCents / 100);

    // Conversion rate (PAID orders / total orders held/placed)
    const conversionRate = allOrders.length > 0
      ? parseFloat(((paidOrders.length / allOrders.length) * 100).toFixed(1))
      : 0;

    // Monthly revenue trend (Past 5 calendar months dynamically calculated from actual order timestamps)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const past5Months: { month: string; revenue: number; bookings: number; heightPercent: number }[] = [];

    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      const year = d.getFullYear();
      const monthIdx = d.getMonth();

      const matchingOrders = paidOrders.filter((o) => {
        const orderDate = new Date(o.created_at);
        return orderDate.getFullYear() === year && orderDate.getMonth() === monthIdx;
      });

      const rev = matchingOrders.reduce((sum, o) => sum + Math.round(o.total_cents / 100), 0);
      past5Months.push({
        month: mName,
        revenue: rev,
        bookings: matchingOrders.length,
        heightPercent: 0, // calculated below
      });
    }

    const maxMonthlyRev = Math.max(1, ...past5Months.map((p) => p.revenue));
    past5Months.forEach((p) => {
      p.heightPercent = Math.max(15, Math.round((p.revenue / maxMonthlyRev) * 100));
    });

    // Dynamic Tier breakdown based on actual ticket tiers and reservation items
    const events = tenantId ? await db.getEvents({ tenant_id: tenantId }) : await db.getEvents();
    
    // Calculate total sold quantity per tier
    const tierDistributionMap: { [name: string]: { count: number; revenue: number } } = {};
    let totalTicketsSold = 0;

    for (const order of paidOrders) {
      const resData = await db.getReservationById(order.reservation_id);
      const items = resData ? resData.items : [];
      for (const it of items) {
        const tier = await db.getTicketTierById(it.ticket_tier_id);
        const tierName = tier ? tier.name : 'Standard Access';
        if (!tierDistributionMap[tierName]) {
          tierDistributionMap[tierName] = { count: 0, revenue: 0 };
        }
        tierDistributionMap[tierName].count += it.quantity;
        tierDistributionMap[tierName].revenue += Math.round((it.quantity * it.unit_price_cents) / 100);
        totalTicketsSold += it.quantity;
      }
    }

    const tierDistribution = Object.entries(tierDistributionMap).map(([name, data]) => ({
      name,
      percentage: totalTicketsSold > 0 ? Math.round((data.count / totalTicketsSold) * 100) : 0,
      revenue: data.revenue,
    }));

    // If no paid orders yet, list active tiers
    if (tierDistribution.length === 0) {
      const allTiers = await Promise.all(events.slice(0, 3).map((e) => db.getTicketTiersByEventId(e.id)));
      const flattened = allTiers.flat();
      flattened.slice(0, 3).forEach((t) => {
        tierDistribution.push({
          name: t.name,
          percentage: 0,
          revenue: 0,
        });
      });
    }

    const totalViews = events.length * 150 + allOrders.length * 20;

    return {
      totalRevenue,
      totalBookings: paidOrders.length,
      totalTicketsSold,
      totalViews,
      conversionRate,
      revenueTrend: past5Months,
      tierDistribution,
    };
  }

  async getPlatformAdminMetrics() {
    const tenants = await db.getTenants();
    const users = await db.getUsers();
    const events = await db.getEvents();
    const allOrders = await db.getAllOrders();
    const paidOrders = allOrders.filter((o) => o.status === 'PAID');
    const grossRevenueCents = paidOrders.reduce((sum, o) => sum + o.total_cents, 0);

    return {
      totalTenants: tenants.length,
      totalUsers: users.length,
      totalEvents: events.length,
      totalRevenue: Math.round(grossRevenueCents / 100),
      totalOrders: allOrders.length,
      paidOrdersCount: paidOrders.length,
    };
  }
}

export const analyticsService = new AnalyticsService();
