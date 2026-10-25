// Typed API Client for EventForge / EventHub

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'organizer' | 'attendee';
  tenant_id: string | null;
  phone?: string;
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
}

export interface EventItem {
  id: string;
  tenant_id: string;
  organizer_id: string;
  organizer_name?: string;
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
  min_price_cents?: number;
  total_available_tickets?: number;
  tiers?: TicketTier[];
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

export interface OrderItem {
  id: string;
  tenant_id: string;
  reservation_id: string;
  attendee_id: string;
  total_cents: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  idempotency_key: string;
  created_at: string;
  event?: EventItem;
  tier_summary?: string;
  expires_at?: string;
  reservation_status?: string;
}

export interface SystemLog {
  id: string;
  tenant_id: string | null;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: any;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  status: 'active' | 'suspended' | 'inactive';
  events_count?: number;
  created_at: string;
}

class ApiClient {
  private token: string | null = null;
  private currentUser: UserProfile | null = null;

  constructor() {
    this.token = localStorage.getItem('ef_token');
    const userJson = localStorage.getItem('ef_user');
    if (userJson) {
      try {
        this.currentUser = JSON.parse(userJson);
      } catch (e) {
        // ignore
      }
    }
  }

  setSession(user: UserProfile, token: string) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('ef_token', token);
    localStorage.setItem('ef_user', JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('ef_token');
    localStorage.removeItem('ef_user');
  }

  getToken() {
    return this.token;
  }

  getUser() {
    return this.currentUser;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const cleanBase = (API_BASE || '').trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = endpoint.startsWith('http') ? endpoint : `${cleanBase}${cleanEndpoint}`;
    const response = await fetch(url, { ...options, headers });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.message || `Request failed with status ${response.status}`;
      throw { status: response.status, code: data.error || 'API_ERROR', message: errorMsg };
    }

    return data as T;
  }

  // Auth
  async login(email: string, password: string = 'password123') {
    const res = await this.request<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  async register(data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    role?: 'attendee' | 'organizer';
    tenant_slug?: string;
    tenant_name?: string;
  }) {
    const res = await this.request<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  async getMe() {
    return this.request<UserProfile>('/api/auth/me');
  }

  async updateProfile(data: { full_name?: string; phone?: string }) {
    const res = await this.request<UserProfile>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (this.currentUser) {
      this.currentUser = { ...this.currentUser, ...res };
      localStorage.setItem('ef_user', JSON.stringify(this.currentUser));
    }
    return res;
  }

  // Events
  async getEvents(params?: { category?: string; city?: string; query?: string }) {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.city) qs.set('city', params.city);
    if (params?.query) qs.set('query', params.query);
    return this.request<EventItem[]>(`/api/events?${qs.toString()}`);
  }

  async getEventById(id: string) {
    return this.request<EventItem & { tiers: TicketTier[] }>(`/api/events/${id}`);
  }

  // Reservations
  async createReservation(tenantId: string, items: { ticket_tier_id: string; quantity: number }[]) {
    return this.request<{ reservation: Reservation; items: ReservationItem[] }>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, items }),
    });
  }

  async getReservation(id: string) {
    return this.request<{ reservation: Reservation; items: ReservationItem[] }>(`/api/reservations/${id}`);
  }

  async cancelReservation(id: string) {
    return this.request<Reservation>(`/api/reservations/${id}/cancel`, {
      method: 'POST',
    });
  }

  // Orders
  async createOrder(reservationId: string, idempotencyKey: string) {
    return this.request<OrderItem>('/api/orders', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ reservation_id: reservationId, idempotency_key: idempotencyKey }),
    });
  }

  async getMyOrders() {
    return this.request<OrderItem[]>('/api/orders/my');
  }

  async getOrderById(id: string) {
    return this.request<{
      order: OrderItem;
      event: EventItem;
      reservation: Reservation;
      tier_name: string;
      items: ReservationItem[];
      attendee: { name: string; email: string };
    }>(`/api/orders/${id}`);
  }

  async cancelOrder(orderId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
    });
  }

  async getOrganizerOrders() {
    return this.request<any[]>('/api/organizer/orders');
  }

  // Payments
  async processMockPayment(orderId: string, outcome: 'approve' | 'reject' = 'approve', paymentMethod: string = 'credit_card') {
    return this.request<{ order: OrderItem; transaction: any }>('/api/payments/mock', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, outcome, payment_method: paymentMethod }),
    });
  }

  // Organizer
  async getOrganizerEvents() {
    return this.request<EventItem[]>('/api/organizer/events');
  }

  async createOrganizerEvent(eventData: any) {
    return this.request<EventItem>('/api/organizer/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async createTicketTier(eventId: string, tierData: any) {
    return this.request<TicketTier>(`/api/organizer/events/${eventId}/tiers`, {
      method: 'POST',
      body: JSON.stringify(tierData),
    });
  }

  async updateTicketTier(eventId: string, tierId: string, tierData: any) {
    return this.request<TicketTier>(`/api/organizer/events/${eventId}/tiers/${tierId}`, {
      method: 'PUT',
      body: JSON.stringify(tierData),
    });
  }

  async deleteTicketTier(eventId: string, tierId: string) {
    return this.request<{ success: boolean }>(`/api/organizer/events/${eventId}/tiers/${tierId}`, {
      method: 'DELETE',
    });
  }

  async getOrganizerAnalytics() {
    return this.request<any>('/api/organizer/analytics');
  }

  // Admin
  async getAdminTenants() {
    return this.request<Tenant[]>('/api/admin/tenants');
  }

  async createAdminTenant(tenantData: { name: string; slug: string; contact_email: string }) {
    return this.request<Tenant>('/api/admin/tenants', {
      method: 'POST',
      body: JSON.stringify(tenantData),
    });
  }

  async getAdminUsers() {
    return this.request<any[]>('/api/admin/users');
  }

  async getAdminLogs() {
    return this.request<SystemLog[]>('/api/admin/logs');
  }

  async getAdminAnalytics() {
    return this.request<any>('/api/admin/analytics');
  }
}

export const api = new ApiClient();
