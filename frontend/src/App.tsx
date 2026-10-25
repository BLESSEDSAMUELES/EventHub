import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  api,
  EventItem,
  TicketTier,
  Reservation,
  ReservationItem,
  OrderItem,
  SystemLog,
  Tenant,
  UserProfile,
} from './api';

import {
  Ticket,
  Check,
  Heart,
  LayoutDashboard,
  Calendar,
  User,
  Bookmark,
  PlusCircle,
  BarChart3,
  BookOpen,
  Settings,
  Building2,
  Users,
  CalendarRange,
  FileText,
  Search,
  ChevronDown,
  RefreshCw,
  Clock,
  MapPin,
  Sparkles,
  LogOut,
} from 'lucide-react';

export default function App() {
  // Screen state (1 to 18)
  const [currentScreen, setCurrentScreen] = useState<number>(1);

  // Authenticated user
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(api.getUser());

  // Dynamic Data States
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [ticketSelections, setTicketSelections] = useState<{ [tierId: string]: number }>({});

  // Active Flow Objects (100% dynamic from API)
  const [activeReservation, setActiveReservation] = useState<{ reservation: Reservation; items: ReservationItem[] } | null>(null);
  const [activeOrder, setActiveOrder] = useState<OrderItem | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(600);

  // Lists from Backend API
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [organizerOrders, setOrganizerOrders] = useState<any[]>([]);
  const [adminTenants, setAdminTenants] = useState<Tenant[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [organizerAnalytics, setOrganizerAnalytics] = useState<any>(null);
  const [adminAnalytics, setAdminAnalytics] = useState<any>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Chennai');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Checkout State
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'wallet'>('card');
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
  const [cardExpiry, setCardExpiry] = useState('11/28');
  const [cardCvv, setCardCvv] = useState('123');
  const [processingStep, setProcessingStep] = useState<number>(1);

  // Tabs
  const [activeDetailsTab, setActiveDetailsTab] = useState<'About' | 'Tickets' | 'Venue' | 'FAQ'>('About');
  const [activeBookingsTab, setActiveBookingsTab] = useState<'Upcoming' | 'Past'>('Upcoming');

  // Modals & Inputs
  const [showAddTierModal, setShowAddTierModal] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('1499');
  const [newTierQty, setNewTierQty] = useState('100');

  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');

  // Event Creation State
  const [newEventTitle, setNewEventTitle] = useState('Tech Workshop 2026');
  const [newEventDesc, setNewEventDesc] = useState('Hands-on workshop on modern web technologies and high concurrency architecture.');
  const [newEventVenue, setNewEventVenue] = useState('SaiRam Engineering College, Chennai');
  const [newEventCity, setNewEventCity] = useState('Chennai');
  const [newEventStarts, setNewEventStarts] = useState('2026-12-10T10:00');
  const [newEventEnds, setNewEventEnds] = useState('2026-12-10T17:00');
  const [newEventCutoff, setNewEventCutoff] = useState('2026-12-09T23:59');

  // Profile Edit State
  const [profileName, setProfileName] = useState(currentUser?.full_name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');

  // Auth Modal & User Session State
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('blessed@example.com');
  const [authPassword, setAuthPassword] = useState<string>('password123');
  const [authFullName, setAuthFullName] = useState<string>('');
  const [authPhone, setAuthPhone] = useState<string>('');
  const [authRole, setAuthRole] = useState<'attendee' | 'organizer'>('attendee');
  const [authTenantName, setAuthTenantName] = useState<string>('');
  const [authTenantSlug, setAuthTenantSlug] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Initial Load from Backend API
  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      if (api.getToken()) {
        const me = await api.getMe().catch(() => null);
        if (me) {
          setCurrentUser(me);
          setProfileName(me.full_name);
          setProfilePhone(me.phone || '');
          if (me.role === 'organizer') await loadOrganizerData();
          else if (me.role === 'admin') await loadAdminData();
          else await loadAttendeeOrders();
        } else {
          api.clearSession();
          setCurrentUser(null);
        }
      }
      await loadEvents();
    } catch (err) {
      console.error('Initialization error', err);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await api.login(authEmail, authPassword);
      setCurrentUser(res.user);
      setProfileName(res.user.full_name);
      setProfilePhone(res.user.phone || '');
      setShowAuthModal(false);
      showToast(`Welcome back, ${res.user.full_name}!`);

      if (res.user.role === 'organizer') {
        await loadOrganizerData();
        setCurrentScreen(11);
      } else if (res.user.role === 'admin') {
        await loadAdminData();
        setCurrentScreen(15);
      } else {
        await loadAttendeeOrders();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await api.register({
        email: authEmail,
        password: authPassword,
        full_name: authFullName,
        phone: authPhone,
        role: authRole,
        tenant_name: authRole === 'organizer' ? authTenantName : undefined,
        tenant_slug: authRole === 'organizer' ? authTenantSlug : undefined,
      });
      setCurrentUser(res.user);
      setProfileName(res.user.full_name);
      setProfilePhone(res.user.phone || '');
      setShowAuthModal(false);
      showToast(`Account created! Welcome, ${res.user.full_name}!`);

      if (res.user.role === 'organizer') {
        await loadOrganizerData();
        await loadEvents();
        setCurrentScreen(11);
      } else {
        await loadAttendeeOrders();
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    api.clearSession();
    setCurrentUser(null);
    setShowUserMenu(false);
    showToast('Logged out successfully.');
    if (currentScreen > 10 || currentScreen === 7 || currentScreen === 9) {
      setCurrentScreen(1);
    }
  };

  const loadEvents = async () => {
    try {
      const data = await api.getEvents({
        city: selectedCity === 'all' ? undefined : selectedCity,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        query: searchQuery || undefined,
      });
      setEvents(data);
      if (data.length > 0 && !selectedEvent) {
        await loadEventDetail(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load events from backend', err);
    }
  };

  const loadEventDetail = async (id: string) => {
    try {
      const detail = await api.getEventById(id);
      setSelectedEvent(detail);
      // Initialize tier selections to 0
      const initSelections: { [tierId: string]: number } = {};
      if (detail.tiers && detail.tiers.length > 0) {
        detail.tiers.forEach((t, idx) => {
          initSelections[t.id] = idx === 0 ? 1 : 0;
        });
      }
      setTicketSelections(initSelections);
    } catch (err) {
      console.error('Failed to load event detail', err);
    }
  };

  const loadAttendeeOrders = async () => {
    try {
      const orders = await api.getMyOrders();
      setMyOrders(orders);
    } catch (err) {
      console.error('Failed to load attendee orders', err);
    }
  };

  const loadOrganizerData = async () => {
    try {
      const [analytics, orders] = await Promise.all([
        api.getOrganizerAnalytics(),
        api.getOrganizerOrders(),
      ]);
      setOrganizerAnalytics(analytics);
      setOrganizerOrders(orders);
    } catch (err) {
      console.error('Failed to load organizer data', err);
    }
  };

  const loadAdminData = async () => {
    try {
      const [tenants, users, logs, analytics] = await Promise.all([
        api.getAdminTenants(),
        api.getAdminUsers(),
        api.getAdminLogs(),
        api.getAdminAnalytics(),
      ]);
      setAdminTenants(tenants);
      setAdminUsers(users);
      setSystemLogs(logs);
      setAdminAnalytics(analytics);
    } catch (err) {
      console.error('Failed to load admin data', err);
    }
  };

  // Switch persona with real JWT authentication
  const switchPersona = async (role: 'attendee' | 'organizer' | 'admin') => {
    let email = 'blessed@example.com';
    let pwd = 'password123';
    let targetScreen = 1;

    if (role === 'attendee') {
      email = 'blessed@example.com';
      targetScreen = 1;
    } else if (role === 'organizer') {
      email = 'priya@example.com';
      targetScreen = 11;
    } else if (role === 'admin') {
      email = 'admin@example.com';
      pwd = 'admin123';
      targetScreen = 15;
    }

    try {
      const res = await api.login(email, pwd);
      setCurrentUser(res.user);
      setProfileName(res.user.full_name);
      setProfilePhone(res.user.phone || '+91 9876543210');

      if (role === 'attendee') await loadAttendeeOrders();
      if (role === 'organizer') await loadOrganizerData();
      if (role === 'admin') await loadAdminData();

      setCurrentScreen(targetScreen);
      showToast(`Logged in as ${res.user.full_name} (${role.toUpperCase()})`);
    } catch (err: any) {
      showToast(err.message || 'Login failed');
    }
  };

  // Live countdown timer for active reservation
  useEffect(() => {
    if (!activeReservation || currentScreen !== 3) return;

    const expiryTime = new Date(activeReservation.reservation.expires_at).getTime();
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        showToast('Reservation expired. Tickets released back to inventory.');
        setCurrentScreen(2);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeReservation, currentScreen]);

  // Stepper helper
  const updateTicketCount = (tierId: string, delta: number, availableQty: number) => {
    setTicketSelections((prev) => {
      const curr = prev[tierId] || 0;
      const next = Math.max(0, Math.min(availableQty, curr + delta));
      return { ...prev, [tierId]: next };
    });
  };

  const totalSelectedTickets = useMemo(() => {
    return Object.values(ticketSelections).reduce((a, b) => a + b, 0);
  }, [ticketSelections]);

  const totalCalculatedPrice = useMemo(() => {
    if (!selectedEvent?.tiers) return 0;
    return selectedEvent.tiers.reduce((sum, tier) => {
      const qty = ticketSelections[tier.id] || 0;
      return sum + (tier.price_cents / 100) * qty;
    }, 0);
  }, [selectedEvent, ticketSelections]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 1. Create Real 10-Minute Reservation Hold (Screen 2 -> Screen 3)
  const handleCreateReservation = async () => {
    if (!currentUser) {
      setAuthError(null);
      setAuthMode('login');
      setShowAuthModal(true);
      showToast('Please sign in or register to reserve tickets.');
      return;
    }

    if (!selectedEvent || totalSelectedTickets === 0) {
      showToast('Please select at least 1 ticket');
      return;
    }

    const items = Object.entries(ticketSelections)
      .filter(([_, qty]) => qty > 0)
      .map(([tierId, qty]) => ({ ticket_tier_id: tierId, quantity: qty }));

    try {
      const result = await api.createReservation(selectedEvent.tenant_id, items);
      setActiveReservation(result);
      const expiry = new Date(result.reservation.expires_at).getTime();
      setCountdownSeconds(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
      setCurrentScreen(3);
      showToast('10-minute hold created in database!');
    } catch (err: any) {
      showToast(err.message || 'Failed to hold tickets. Inventory may be sold out.');
    }
  };

  // 2. Proceed to Checkout (Screen 3 -> Screen 4)
  const handleProceedToCheckout = async () => {
    if (!activeReservation) return;
    try {
      const idempotencyKey = `idem-${activeReservation.reservation.id}-${Date.now()}`;
      const order = await api.createOrder(activeReservation.reservation.id, idempotencyKey);
      setActiveOrder(order);
      setCurrentScreen(4);
    } catch (err: any) {
      showToast(err.message || 'Failed to create order');
    }
  };

  // 3. Cancel Active Reservation
  const handleCancelReservation = async () => {
    if (!activeReservation) return;
    try {
      await api.cancelReservation(activeReservation.reservation.id);
      setActiveReservation(null);
      showToast('Reservation cancelled and inventory restored in database.');
      if (selectedEvent) await loadEventDetail(selectedEvent.id);
      setCurrentScreen(2);
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel reservation');
    }
  };

  // 4. Complete Payment Simulation (Screen 4 -> Screen 5 -> Screen 6)
  const handleProcessPayment = async () => {
    if (!activeOrder) return;
    setCurrentScreen(5);
    setProcessingStep(1);

    setTimeout(() => setProcessingStep(2), 600);
    setTimeout(() => setProcessingStep(3), 1200);
    setTimeout(async () => {
      setProcessingStep(4);
      try {
        const result = await api.processMockPayment(activeOrder.id, 'approve', paymentMethod === 'card' ? 'credit_card' : paymentMethod);
        if (result.order.status === 'PAID') {
          setActiveOrder(result.order);
          await loadAttendeeOrders();
          setCurrentScreen(6);
          confetti({ particleCount: 80, spread: 65, origin: { y: 0.6 } });
        } else {
          showToast('Payment rejected. Inventory restored.');
          setCurrentScreen(4);
        }
      } catch (err: any) {
        showToast(err.message || 'Payment simulation failed');
        setCurrentScreen(4);
      }
    }, 1800);
  };

  // 5. Update Profile
  const handleUpdateProfile = async () => {
    try {
      const updated = await api.updateProfile({ full_name: profileName, phone: profilePhone });
      setCurrentUser(updated);
      showToast('Profile updated successfully in database!');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile');
    }
  };

  // 6. Create Organizer Event
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ev = await api.createOrganizerEvent({
        title: newEventTitle,
        description: newEventDesc,
        venue: newEventVenue,
        city: newEventCity,
        starts_at: new Date(newEventStarts).toISOString(),
        ends_at: new Date(newEventEnds).toISOString(),
        sales_cutoff: new Date(newEventCutoff).toISOString(),
        status: 'published',
        image_url: '/images/tech_summit.jpg',
      });
      showToast(`Event "${ev.title}" created successfully!`);
      await loadEvents();
      await loadEventDetail(ev.id);
      setCurrentScreen(13); // jump to manage ticket tiers for new event
    } catch (err: any) {
      showToast(err.message || 'Failed to create event');
    }
  };

  // 7. Add Ticket Tier
  const handleAddTier = async () => {
    if (!selectedEvent || !newTierName) return;
    try {
      await api.createTicketTier(selectedEvent.id, {
        name: newTierName,
        price_cents: Math.round(parseFloat(newTierPrice) * 100),
        total_quantity: parseInt(newTierQty, 10),
      });
      setShowAddTierModal(false);
      setNewTierName('');
      await loadEventDetail(selectedEvent.id);
      showToast('New ticket tier created in database!');
    } catch (err: any) {
      showToast(err.message || 'Failed to create tier');
    }
  };

  // 8. Delete Ticket Tier
  const handleDeleteTier = async (tierId: string) => {
    if (!selectedEvent) return;
    try {
      await api.deleteTicketTier(selectedEvent.id, tierId);
      await loadEventDetail(selectedEvent.id);
      showToast('Tier deleted successfully from database.');
    } catch (err: any) {
      showToast(err.message || 'Cannot delete tier with sold tickets');
    }
  };

  // 9. Add Tenant (Admin)
  const handleAddTenant = async () => {
    if (!newTenantName || !newTenantSlug) return;
    try {
      await api.createAdminTenant({
        name: newTenantName,
        slug: newTenantSlug,
        contact_email: newTenantEmail,
      });
      setShowAddTenantModal(false);
      setNewTenantName('');
      setNewTenantSlug('');
      setNewTenantEmail('');
      await loadAdminData();
      showToast('Tenant organization created in database!');
    } catch (err: any) {
      showToast(err.message || 'Failed to create tenant');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#1e1b4b',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid #6366f1',
          fontSize: '0.85rem',
        }}>
          <Sparkles size={16} color="#818cf8" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* PUBLIC NAVBAR (Screens 1-6, 8, 10)                  */}
      {/* ==================================================== */}
      {(currentScreen <= 6 || currentScreen === 8 || currentScreen === 10) && (
        <header className="nav-header">
          <div className="nav-brand" onClick={() => setCurrentScreen(1)}>
            <Ticket size={24} />
            <span>EventHub</span>
          </div>

          <div className="nav-center-links">
            <button className={currentScreen === 1 ? 'active' : ''} onClick={() => setCurrentScreen(1)}>
              Events
            </button>
            <button onClick={() => setCurrentScreen(10)}>About</button>
            <button onClick={() => setCurrentScreen(10)}>Contact</button>
          </div>

          <div className="nav-auth-actions">
            {!currentUser ? (
              <>
                <button
                  className="btn-nav-login"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                >
                  Sign In
                </button>
                <button
                  className="btn-nav-signup"
                  onClick={() => {
                    setAuthError(null);
                    setAuthMode('register');
                    setShowAuthModal(true);
                  }}
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                {currentUser.role === 'attendee' && (
                  <button
                    className="btn-nav-login"
                    onClick={() => {
                      loadAttendeeOrders();
                      setCurrentScreen(7);
                    }}
                  >
                    My Bookings
                  </button>
                )}
                {currentUser.role === 'organizer' && (
                  <button
                    className="btn-nav-login"
                    onClick={() => {
                      loadOrganizerData();
                      setCurrentScreen(11);
                    }}
                  >
                    Organizer Console
                  </button>
                )}
                {currentUser.role === 'admin' && (
                  <button
                    className="btn-nav-login"
                    onClick={() => {
                      loadAdminData();
                      setCurrentScreen(15);
                    }}
                  >
                    Admin Console
                  </button>
                )}

                <div className="user-dropdown-container">
                  <div
                    className="user-avatar-circle"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    title={currentUser.full_name}
                  >
                    {currentUser.full_name ? currentUser.full_name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
                  </div>

                  {showUserMenu && (
                    <div className="user-dropdown-menu">
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{currentUser.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currentUser.email}</div>
                        <span className="badge-pill active" style={{ marginTop: '4px', display: 'inline-block' }}>
                          {currentUser.role.toUpperCase()}
                        </span>
                      </div>

                      <button className="user-dropdown-item" onClick={() => { setShowUserMenu(false); setCurrentScreen(9); }}>
                        <User size={15} /> Profile & Settings
                      </button>
                      {currentUser.role === 'attendee' && (
                        <button className="user-dropdown-item" onClick={() => { setShowUserMenu(false); loadAttendeeOrders(); setCurrentScreen(7); }}>
                          <Ticket size={15} /> My Bookings
                        </button>
                      )}
                      {currentUser.role === 'organizer' && (
                        <button className="user-dropdown-item" onClick={() => { setShowUserMenu(false); loadOrganizerData(); setCurrentScreen(11); }}>
                          <LayoutDashboard size={15} /> Organizer Dashboard
                        </button>
                      )}
                      {currentUser.role === 'admin' && (
                        <button className="user-dropdown-item" onClick={() => { setShowUserMenu(false); loadAdminData(); setCurrentScreen(15); }}>
                          <Building2 size={15} /> Admin Dashboard
                        </button>
                      )}

                      <div className="user-dropdown-divider"></div>
                      <button className="user-dropdown-item" style={{ color: '#ef4444' }} onClick={handleLogout}>
                        <LogOut size={15} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* ==================================================== */}
      {/* SCREEN 1: LANDING PAGE (PUBLIC)                      */}
      {/* ==================================================== */}
      {currentScreen === 1 && (
        <main>
          <section className="landing-hero">
            <div className="hero-content">
              <h1 className="hero-title">Discover Amazing Events Around You</h1>
              <p className="hero-subtitle">Music • Tech • Sports • Workshops • and more</p>

              <div className="hero-search-container">
                <Search size={18} color="#94a3b8" style={{ marginRight: '8px' }} />
                <input
                  type="text"
                  className="search-input-field"
                  placeholder="Search events, venues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadEvents()}
                />
                <select
                  className="search-city-dropdown"
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                  }}
                >
                  <option value="Chennai">Chennai</option>
                  <option value="Bangalore">Bangalore</option>
                  <option value="Mumbai">Mumbai</option>
                  <option value="all">All Cities</option>
                </select>
                <button
                  className="search-action-btn"
                  onClick={() => {
                    loadEvents();
                    setCurrentScreen(10);
                  }}
                >
                  Search
                </button>
              </div>
            </div>
          </section>

          <section className="popular-events-section">
            <div className="section-head">
              <h2 className="section-title">Popular Events</h2>
              <span className="see-all-btn" onClick={() => setCurrentScreen(10)}>See All</span>
            </div>

            <div className="cards-three-grid">
              {events.slice(0, 3).map((ev) => (
                <div
                  key={ev.id}
                  className="event-box-card"
                  onClick={async () => {
                    await loadEventDetail(ev.id);
                    setCurrentScreen(2);
                  }}
                >
                  <div className="card-img-wrap">
                    <img src={ev.image_url} alt={ev.title} className="card-img" />
                  </div>
                  <div className="card-body-wrap">
                    <h3 className="card-title-text">{ev.title}</h3>
                    <div className="card-category-city">{ev.category} • {ev.city}</div>
                    <div className="card-date-text">
                      {new Date(ev.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="card-price-bottom">
                      ₹{((ev.min_price_cents !== undefined ? ev.min_price_cents : 0) / 100).toLocaleString('en-IN')} onwards
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* ==================================================== */}
      {/* SCREEN 2: EVENT DETAILS                              */}
      {/* ==================================================== */}
      {currentScreen === 2 && selectedEvent && (
        <div className="event-details-container">
          <div>
            <div className="event-banner-media">
              <img src={selectedEvent.image_url} alt={selectedEvent.title} className="event-banner-img" />
              <div className="banner-bottom-bar">
                <div className="banner-title-live">
                  <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>{selectedEvent.title}</h1>
                  <span className="live-pill">● Live</span>
                </div>
              </div>
            </div>

            <div className="event-meta-info">
              <div className="organizer-row">
                <span>By {selectedEvent.organizer_name || 'Event Organizer'}</span>
              </div>
              <div className="datetime-venue-row">
                <div>
                  {new Date(selectedEvent.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} | 10:00 AM - 5:00 PM
                </div>
                <div>{selectedEvent.venue}</div>
              </div>
            </div>

            <div className="details-tab-bar">
              {(['About', 'Tickets', 'Venue', 'FAQ'] as const).map((t) => (
                <button
                  key={t}
                  className={`details-tab-btn ${activeDetailsTab === t ? 'active' : ''}`}
                  onClick={() => setActiveDetailsTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="details-tab-body">
              {activeDetailsTab === 'About' && (
                <p>{selectedEvent.description}</p>
              )}
              {activeDetailsTab === 'Tickets' && (
                <p>
                  Choose your ticket tier from the right panel. All tickets grant full day access. Each temporary hold is guaranteed in the database for 10 minutes.
                </p>
              )}
              {activeDetailsTab === 'Venue' && (
                <p>{selectedEvent.venue}. Ample parking and accessible entrance available.</p>
              )}
              {activeDetailsTab === 'FAQ' && (
                <p>Cancellations allowed up to 24 hours prior to event start.</p>
              )}
            </div>
          </div>

          {/* Right Ticket Selection Sidebar */}
          <aside className="ticket-selection-card">
            <h3 className="ticket-selection-title">Select Tickets</h3>

            {selectedEvent.tiers && selectedEvent.tiers.length > 0 ? (
              selectedEvent.tiers.map((tier) => {
                const count = ticketSelections[tier.id] || 0;
                return (
                  <div key={tier.id} className={`tier-item-row ${count > 0 ? 'selected' : ''}`}>
                    <div className="tier-row-head">
                      <span className="tier-name-text">{tier.name}</span>
                      <span className="tier-price-text">₹{(tier.price_cents / 100).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="tier-subtitle-text">{tier.description || 'Standard Access Pass'}</div>
                    <div className="tier-row-foot">
                      <span className="tier-stock-pill">{tier.available_quantity} left</span>
                      <div className="stepper-container">
                        <button
                          className="stepper-arrow-btn"
                          onClick={() => updateTicketCount(tier.id, -1, tier.available_quantity)}
                          disabled={count === 0}
                        >
                          -
                        </button>
                        <span className="stepper-count-num">{count}</span>
                        <button
                          className="stepper-arrow-btn"
                          onClick={() => updateTicketCount(tier.id, 1, tier.available_quantity)}
                          disabled={count >= tier.available_quantity}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No ticket tiers active for this event.</p>
            )}

            <div className="ticket-card-total-row">
              <span>Total</span>
              <span>₹{totalCalculatedPrice.toLocaleString('en-IN')}</span>
            </div>

            <button
              className="btn-primary-purple"
              disabled={totalSelectedTickets === 0}
              onClick={handleCreateReservation}
            >
              Add to Reservation (10 min hold)
            </button>
          </aside>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 3: RESERVATION HOLD (10 MIN HOLD)             */}
      {/* ==================================================== */}
      {currentScreen === 3 && activeReservation && (
        <div className="centered-flow-card">
          <div className="green-check-circle">
            <Check size={28} />
          </div>
          <h2 className="centered-flow-title">Tickets Reserved!</h2>
          <p className="centered-flow-subtitle">Your tickets are on hold for 10 minutes.</p>

          <div className="timer-green-pill">
            {formatTimer(countdownSeconds)}
          </div>

          <div className="bordered-summary-table">
            <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-dark)' }}>
              Reservation Details
            </div>
            <div className="summary-table-row">
              <span>Reservation ID</span>
              <strong style={{ fontFamily: 'monospace' }}>{activeReservation.reservation.id}</strong>
            </div>
            <div className="summary-table-row">
              <span>Event</span>
              <strong>{selectedEvent?.title}</strong>
            </div>
            <div className="summary-table-row">
              <span>Date</span>
              <strong>{new Date(selectedEvent?.starts_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
            </div>
            <div className="summary-table-row">
              <span>Tickets</span>
              <strong>
                {activeReservation.items.map((it) => `${it.quantity} x Ticket`).join(', ')}
              </strong>
            </div>
            <div className="summary-table-row">
              <span>Amount</span>
              <strong>
                ₹{activeReservation.items.reduce((s, it) => s + (it.quantity * it.unit_price_cents) / 100, 0).toLocaleString('en-IN')}
              </strong>
            </div>
            <div className="summary-table-row">
              <span>Expires At</span>
              <strong>
                {new Date(activeReservation.reservation.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </strong>
            </div>
          </div>

          <button className="btn-primary-purple" onClick={handleProceedToCheckout}>
            Proceed to Checkout
          </button>
          <button className="btn-outline-white" onClick={handleCancelReservation}>
            Cancel Reservation
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 4: CHECKOUT & PAYMENT                         */}
      {/* ==================================================== */}
      {currentScreen === 4 && activeOrder && (
        <div className="centered-flow-card" style={{ maxWidth: '440px', textAlign: 'left' }}>
          <div className="checkout-stepper-header">
            <span className="stepper-item-label">Cart</span>
            <span>&gt;</span>
            <span className="stepper-item-label active">Payment</span>
            <span>&gt;</span>
            <span className="stepper-item-label">Confirm</span>
          </div>

          <div className="order-summary-box">
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Order Summary</div>
            <div className="summary-mini-event">
              <img src={selectedEvent?.image_url || '/images/tech_summit.jpg'} alt="Mini" className="mini-event-img" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedEvent?.title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{selectedEvent?.venue}</div>
              </div>
            </div>
            <div className="summary-table-row" style={{ fontSize: '0.8rem' }}>
              <span>Tickets Subtotal</span>
              <span>₹{((activeOrder.total_cents - 5000) / 100).toLocaleString('en-IN')}</span>
            </div>
            <div className="summary-table-row" style={{ fontSize: '0.8rem' }}>
              <span>Service Fee</span>
              <span>₹50</span>
            </div>
            <div className="summary-table-row" style={{ fontSize: '0.92rem', fontWeight: 700, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
              <span>Total Amount</span>
              <span style={{ color: 'var(--primary)' }}>₹{(activeOrder.total_cents / 100).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="payment-method-radios">
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Payment Method (Mock Gateway)</div>
            <label className="payment-radio-option">
              <input
                type="radio"
                name="payopt"
                checked={paymentMethod === 'card'}
                onChange={() => setPaymentMethod('card')}
              />
              <span>Credit/Debit Card</span>
            </label>
            <label className="payment-radio-option">
              <input
                type="radio"
                name="payopt"
                checked={paymentMethod === 'upi'}
                onChange={() => setPaymentMethod('upi')}
              />
              <span>UPI (Simulated)</span>
            </label>
            <label className="payment-radio-option">
              <input
                type="radio"
                name="payopt"
                checked={paymentMethod === 'wallet'}
                onChange={() => setPaymentMethod('wallet')}
              />
              <span>Wallet (Simulated)</span>
            </label>
          </div>

          {paymentMethod === 'card' && (
            <div>
              <div className="form-field-group">
                <label className="form-field-label">Card Number</label>
                <input
                  type="text"
                  className="form-field-input"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-field-group" style={{ flex: 1 }}>
                  <label className="form-field-label">Expiry Date</label>
                  <input
                    type="text"
                    className="form-field-input"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                  />
                </div>
                <div className="form-field-group" style={{ flex: 1 }}>
                  <label className="form-field-label">CVV</label>
                  <input
                    type="password"
                    className="form-field-input"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <button
            className="btn-primary-purple"
            style={{ marginTop: '12px' }}
            onClick={handleProcessPayment}
          >
            Pay ₹{(activeOrder.total_cents / 100).toLocaleString('en-IN')}
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 5: PAYMENT PROCESSING                         */}
      {/* ==================================================== */}
      {currentScreen === 5 && (
        <div className="centered-flow-card" style={{ maxWidth: '420px' }}>
          <div className="processing-circle-spinner"></div>
          <h2 className="centered-flow-title" style={{ fontSize: '1.25rem' }}>Processing Payment...</h2>
          <p className="centered-flow-subtitle" style={{ fontSize: '0.82rem' }}>
            Please do not close this page. Your payment is being processed securely.
          </p>

          <div className="checklist-progress-items">
            <div className={`checklist-single-row ${processingStep >= 1 ? 'completed' : ''}`}>
              <Check size={16} color={processingStep >= 1 ? '#10b981' : '#94a3b8'} />
              <span>Validating payment details</span>
            </div>
            <div className={`checklist-single-row ${processingStep >= 2 ? 'completed' : ''}`}>
              <Check size={16} color={processingStep >= 2 ? '#10b981' : '#94a3b8'} />
              <span>Connecting to payment gateway</span>
            </div>
            <div className={`checklist-single-row ${processingStep >= 3 ? 'completed' : ''}`}>
              <Check size={16} color={processingStep >= 3 ? '#10b981' : '#94a3b8'} />
              <span>Processing transaction</span>
            </div>
            <div className={`checklist-single-row ${processingStep >= 4 ? 'completed' : ''}`}>
              <Check size={16} color={processingStep >= 4 ? '#10b981' : '#94a3b8'} />
              <span>Finalizing booking</span>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 6: BOOKING CONFIRMATION                       */}
      {/* ==================================================== */}
      {currentScreen === 6 && activeOrder && (
        <div className="centered-flow-card" style={{ maxWidth: '440px' }}>
          <div className="green-check-circle">
            <Check size={28} />
          </div>
          <h2 className="centered-flow-title">Booking Confirmed!</h2>
          <p className="centered-flow-subtitle">Your tickets have been successfully booked.</p>

          <div className="bordered-summary-table" style={{ fontSize: '0.82rem' }}>
            <div className="summary-table-row">
              <span>Booking ID</span>
              <strong style={{ fontFamily: 'monospace' }}>{activeOrder.id}</strong>
            </div>
            <div className="summary-table-row">
              <span>Event</span>
              <strong>{selectedEvent?.title}</strong>
            </div>
            <div className="summary-table-row">
              <span>Date</span>
              <strong>{new Date(selectedEvent?.starts_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
            </div>
            <div className="summary-table-row">
              <span>Venue</span>
              <strong>{selectedEvent?.venue}</strong>
            </div>
            <div className="summary-table-row">
              <span>Amount Paid</span>
              <strong style={{ color: '#059669' }}>₹{(activeOrder.total_cents / 100).toLocaleString('en-IN')}</strong>
            </div>
            <div className="summary-table-row">
              <span>Payment Status</span>
              <strong style={{ color: '#059669' }}>Successful</strong>
            </div>
          </div>

          <button className="btn-primary-purple" onClick={() => setCurrentScreen(8)}>
            View My Tickets
          </button>
          <button className="btn-outline-white" onClick={() => window.print()}>
            Download Invoice
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 7: MY BOOKINGS (ATTENDEE)                     */}
      {/* ==================================================== */}
      {currentScreen === 7 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(1)}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link active">
              <Ticket size={18} />
              <span>My Bookings</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(9)}>
              <User size={18} />
              <span>Profile</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <Bookmark size={18} />
              <span>Saved Events</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <div className="content-top-header">
              <h1 className="content-title-h1">My Bookings</h1>
            </div>

            <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
              <button
                className={`details-tab-btn ${activeBookingsTab === 'Upcoming' ? 'active' : ''}`}
                onClick={() => setActiveBookingsTab('Upcoming')}
              >
                Upcoming ({myOrders.filter((o) => o.status === 'PAID' || o.status === 'PENDING').length})
              </button>
              <button
                className={`details-tab-btn ${activeBookingsTab === 'Past' ? 'active' : ''}`}
                onClick={() => setActiveBookingsTab('Past')}
              >
                Past
              </button>
            </div>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {myOrders.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>No bookings found. Discover events to reserve tickets.</div>
              ) : (
                myOrders.map((ord) => (
                  <div key={ord.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', width: '380px' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                      <img
                        src={ord.event?.image_url || '/images/tech_summit.jpg'}
                        alt="Thumb"
                        style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '6px' }}
                      />
                      <div>
                        <h4 style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ord.event?.title || 'Event Booking'}</h4>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ord.event?.venue}</div>
                        <span className={`badge-pill ${ord.status === 'PAID' ? 'confirmed' : ord.status === 'PENDING' ? 'pending' : 'warn'}`} style={{ marginTop: '4px' }}>
                          {ord.status === 'PAID' ? '● Confirmed' : ord.status === 'PENDING' ? 'Pending Payment' : 'Cancelled'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      {ord.tier_summary || 'Tickets'}<br />
                      Booking ID: {ord.id} • Total: ₹{(ord.total_cents / 100).toLocaleString('en-IN')}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {ord.status === 'PAID' ? (
                        <button
                          className="btn-table-edit"
                          style={{ flex: 1 }}
                          onClick={async () => {
                            setActiveOrder(ord);
                            if (ord.event) setSelectedEvent(ord.event);
                            setCurrentScreen(8);
                          }}
                        >
                          View Ticket
                        </button>
                      ) : (
                        <button
                          className="btn-primary-purple"
                          style={{ flex: 1, padding: '6px 12px', fontSize: '0.82rem' }}
                          onClick={() => {
                            setActiveOrder(ord);
                            if (ord.event) setSelectedEvent(ord.event);
                            setCurrentScreen(4);
                          }}
                        >
                          Complete Payment
                        </button>
                      )}
                      {ord.status !== 'PAID' && (
                        <button
                          className="btn-table-delete"
                          style={{ flex: 1, margin: 0 }}
                          onClick={async () => {
                            try {
                              await api.cancelOrder(ord.id);
                              await loadAttendeeOrders();
                              showToast('Booking cancelled.');
                            } catch (e: any) {
                              showToast(e.message || 'Cannot cancel');
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 8: E-TICKET (ATTENDEE)                         */}
      {/* ==================================================== */}
      {currentScreen === 8 && (
        <div style={{ padding: '40px 24px' }}>
          <div className="eticket-paper-card">
            <div className="ticket-details-col">
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '4px' }}>
                {selectedEvent?.title || activeOrder?.event?.title || 'Event Booking'}
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                {new Date(selectedEvent?.starts_at || activeOrder?.event?.starts_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | 10:00 AM<br />
                {selectedEvent?.venue || activeOrder?.event?.venue || 'Venue'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Name</span>
                  <strong>{currentUser?.full_name || 'Guest Attendee'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Ticket Type</span>
                  <strong style={{ color: 'var(--primary)' }}>{activeOrder?.tier_summary || 'STANDARD PASS'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Booking ID</span>
                  <strong style={{ fontFamily: 'monospace' }}>{activeOrder?.id || 'ORD-N/A'}</strong>
                </div>
              </div>
            </div>

            <div className="ticket-qr-col">
              <svg width="150" height="150" viewBox="0 0 100 100">
                <rect x="5" y="5" width="26" height="26" fill="#111827" rx="3" />
                <rect x="9" y="9" width="18" height="18" fill="#fff" rx="2" />
                <rect x="13" y="13" width="10" height="10" fill="#111827" />

                <rect x="69" y="5" width="26" height="26" fill="#111827" rx="3" />
                <rect x="73" y="9" width="18" height="18" fill="#fff" rx="2" />
                <rect x="77" y="13" width="10" height="10" fill="#111827" />

                <rect x="5" y="69" width="26" height="26" fill="#111827" rx="3" />
                <rect x="9" y="73" width="18" height="18" fill="#fff" rx="2" />
                <rect x="13" y="77" width="10" height="10" fill="#111827" />

                <rect x="37" y="8" width="6" height="6" fill="#111827" />
                <rect x="47" y="8" width="6" height="6" fill="#111827" />
                <rect x="57" y="8" width="6" height="6" fill="#111827" />
                <rect x="37" y="20" width="6" height="6" fill="#111827" />
                <rect x="47" y="20" width="6" height="6" fill="#111827" />
                <rect x="37" y="32" width="6" height="6" fill="#111827" />
                <rect x="47" y="32" width="6" height="6" fill="#111827" />
                <rect x="57" y="32" width="6" height="6" fill="#111827" />

                <rect x="10" y="44" width="6" height="6" fill="#111827" />
                <rect x="22" y="44" width="6" height="6" fill="#111827" />
                <rect x="34" y="44" width="6" height="6" fill="#111827" />
                <rect x="46" y="44" width="6" height="6" fill="#111827" />
                <rect x="58" y="44" width="6" height="6" fill="#111827" />
                <rect x="70" y="44" width="6" height="6" fill="#111827" />
                <rect x="82" y="44" width="6" height="6" fill="#111827" />

                <rect x="10" y="56" width="6" height="6" fill="#111827" />
                <rect x="22" y="56" width="6" height="6" fill="#111827" />
                <rect x="38" y="56" width="6" height="6" fill="#111827" />
                <rect x="50" y="56" width="6" height="6" fill="#111827" />
                <rect x="62" y="56" width="6" height="6" fill="#111827" />
                <rect x="78" y="56" width="6" height="6" fill="#111827" />

                <rect x="37" y="70" width="6" height="6" fill="#111827" />
                <rect x="47" y="70" width="6" height="6" fill="#111827" />
                <rect x="62" y="70" width="6" height="6" fill="#111827" />
                <rect x="76" y="70" width="6" height="6" fill="#111827" />
                <rect x="37" y="82" width="6" height="6" fill="#111827" />
                <rect x="47" y="82" width="6" height="6" fill="#111827" />
                <rect x="62" y="82" width="6" height="6" fill="#111827" />
                <rect x="76" y="82" width="6" height="6" fill="#111827" />
              </svg>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '10px' }}>
                Show this QR code at the venue for entry
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 9: PROFILE & SETTINGS                         */}
      {/* ==================================================== */}
      {currentScreen === 9 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(1)}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(7)}>
              <Ticket size={18} />
              <span>My Bookings</span>
            </button>
            <button className="sidebar-item-link active">
              <User size={18} />
              <span>Profile</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <Bookmark size={18} />
              <span>Saved Events</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '24px' }}>Profile</h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#4f46e5', color: '#fff', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {profileName.split(' ').map((n) => n[0]).join('') || 'BS'}
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{currentUser?.full_name}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{currentUser?.email}</div>
              </div>
            </div>

            <div style={{ maxWidth: '440px' }}>
              <div className="form-field-group">
                <label className="form-field-label">Full Name</label>
                <input
                  type="text"
                  className="form-field-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Email</label>
                <input
                  type="email"
                  className="form-field-input"
                  value={currentUser?.email || ''}
                  disabled
                  style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Phone</label>
                <input
                  type="text"
                  className="form-field-input"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                />
              </div>
              <button className="btn-primary-purple" style={{ marginTop: '12px' }} onClick={handleUpdateProfile}>
                Update Profile
              </button>
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 10: BROWSE EVENTS (FILTERS)                   */}
      {/* ==================================================== */}
      {currentScreen === 10 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar" style={{ width: '260px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '20px' }}>Filters</h3>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-field-label">Location</label>
              <select
                className="form-field-input"
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value);
                  loadEvents();
                }}
              >
                <option value="Chennai">Chennai</option>
                <option value="Bangalore">Bangalore</option>
                <option value="Mumbai">Mumbai</option>
                <option value="all">All Cities</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-field-label">Event Category</label>
              {['all', 'Music', 'Tech', 'Food', 'Sports', 'Workshop'].map((c) => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', margin: '6px 0', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="cat"
                    checked={selectedCategory.toLowerCase() === c.toLowerCase()}
                    onChange={() => {
                      setSelectedCategory(c.toLowerCase());
                      loadEvents();
                    }}
                  />
                  <span>{c === 'all' ? 'All Categories' : c}</span>
                </label>
              ))}
            </div>

            <button
              className="btn-outline-white"
              style={{ width: '100%' }}
              onClick={() => {
                setSelectedCity('all');
                setSelectedCategory('all');
                setSearchQuery('');
                loadEvents();
              }}
            >
              Reset Filters
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px' }}>
              {events.length} Events Available
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="event-box-card"
                  style={{ flexDirection: 'row', height: '140px' }}
                  onClick={async () => {
                    await loadEventDetail(ev.id);
                    setCurrentScreen(2);
                  }}
                >
                  <img src={ev.image_url} alt="Thumb" style={{ width: '200px', height: '100%', objectFit: 'cover' }} />
                  <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{ev.title}</h4>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ev.category} • {ev.city}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(ev.starts_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Heart size={18} color="#94a3b8" />
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>
                      ₹{((ev.min_price_cents !== undefined ? ev.min_price_cents : 0) / 100).toLocaleString('en-IN')} onwards
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 11: ORGANIZER DASHBOARD                       */}
      {/* ==================================================== */}
      {currentScreen === 11 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link active">
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(13)}>
              <Calendar size={18} />
              <span>My Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(12)}>
              <PlusCircle size={18} />
              <span>+ Create Event</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(14)}>
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(7)}>
              <BookOpen size={18} />
              <span>Bookings</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '20px' }}>Overview</h1>

            <div className="stats-four-grid">
              <div className="stat-item-box">
                <div className="stat-item-label">Total Events</div>
                <div className="stat-item-value">{events.length}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Bookings</div>
                <div className="stat-item-value">{organizerAnalytics?.totalBookings ?? organizerOrders.length}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Revenue</div>
                <div className="stat-item-value">₹{(organizerAnalytics?.totalRevenue ?? 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Conversion Rate</div>
                <div className="stat-item-value">{organizerAnalytics?.conversionRate ?? 0}%</div>
              </div>
            </div>

            {/* Revenue Overview Chart */}
            <div className="chart-white-card" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span className="chart-card-title" style={{ margin: 0 }}>Revenue Overview</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Past Months (Live from DB)</span>
              </div>
              <div className="bar-chart-flex" style={{ height: '140px' }}>
                {(organizerAnalytics?.revenueTrend || []).map((item: any) => (
                  <div key={item.month} className="bar-col-item">
                    <div className="bar-shape" style={{ height: `${item.heightPercent || 25}%` }} title={`₹${item.revenue.toLocaleString('en-IN')}`}></div>
                    <span className="bar-lbl">{item.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Recent Bookings Table from Database */}
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px' }}>Recent Bookings</h3>
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Event</th>
                    <th>Tickets</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {organizerOrders.length > 0 ? (
                    organizerOrders.slice(0, 5).map((ord) => (
                      <tr key={ord.id}>
                        <td>{ord.attendee_name}</td>
                        <td>{ord.event_title}</td>
                        <td>{ord.tickets_count}</td>
                        <td>₹{(ord.total_cents / 100).toLocaleString('en-IN')}</td>
                        <td>
                          <span className={`badge-pill ${ord.status === 'PAID' ? 'confirmed' : 'pending'}`}>
                            {ord.status === 'PAID' ? 'Confirmed' : ord.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No orders recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 12: CREATE EVENT (ORGANIZER)                  */}
      {/* ==================================================== */}
      {currentScreen === 12 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(11)}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link active">
              <Calendar size={18} />
              <span>My Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(12)}>
              <PlusCircle size={18} />
              <span>+ Create Event</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(14)}>
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(7)}>
              <BookOpen size={18} />
              <span>Bookings</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '24px' }}>Create New Event</h1>

            <form onSubmit={handleCreateEvent} style={{ maxWidth: '580px', background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
              <div className="form-field-group">
                <label className="form-field-label">Event Title</label>
                <input
                  type="text"
                  className="form-field-input"
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Description</label>
                <textarea
                  className="form-field-input"
                  rows={3}
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Date & Time (Starts)</label>
                <input
                  type="datetime-local"
                  className="form-field-input"
                  required
                  value={newEventStarts}
                  onChange={(e) => setNewEventStarts(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Date & Time (Ends)</label>
                <input
                  type="datetime-local"
                  className="form-field-input"
                  required
                  value={newEventEnds}
                  onChange={(e) => setNewEventEnds(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Sales Cut-off Date</label>
                <input
                  type="datetime-local"
                  className="form-field-input"
                  required
                  value={newEventCutoff}
                  onChange={(e) => setNewEventCutoff(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="form-field-label">Venue</label>
                <input
                  type="text"
                  className="form-field-input"
                  required
                  value={newEventVenue}
                  onChange={(e) => setNewEventVenue(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary-purple" style={{ marginTop: '16px' }}>
                Create Event
              </button>
            </form>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 13: MANAGE TICKET TIERS (ORGANIZER)           */}
      {/* ==================================================== */}
      {currentScreen === 13 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(11)}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link active">
              <Calendar size={18} />
              <span>My Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(12)}>
              <PlusCircle size={18} />
              <span>+ Create Event</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(14)}>
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(7)}>
              <BookOpen size={18} />
              <span>Bookings</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <div className="content-top-header">
              <h1 className="content-title-h1">Ticket Tiers ({selectedEvent?.title})</h1>
              <button
                className="btn-primary-purple"
                style={{ width: 'auto', padding: '8px 18px' }}
                onClick={() => setShowAddTierModal(true)}
              >
                + Add Ticket Tier
              </button>
            </div>

            <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {selectedEvent?.tiers && selectedEvent.tiers.length > 0 ? (
                selectedEvent.tiers.map((tier) => (
                  <div key={tier.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontWeight: 700 }}>{tier.name}</h4>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        ₹{(tier.price_cents / 100).toLocaleString('en-IN')} &nbsp;|&nbsp; {tier.total_quantity} Total &nbsp;|&nbsp; Sold: {tier.total_quantity - tier.available_quantity} &nbsp;|&nbsp; Left: {tier.available_quantity}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-table-edit" onClick={() => showToast(`Edit modal for ${tier.name}`)}>Edit</button>
                      <button className="btn-table-delete" onClick={() => handleDeleteTier(tier.id)}>Delete</button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>No ticket tiers configured. Add one to start selling tickets!</div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 14: ANALYTICS (ORGANIZER)                     */}
      {/* ==================================================== */}
      {currentScreen === 14 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(11)}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(13)}>
              <Calendar size={18} />
              <span>My Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(12)}>
              <PlusCircle size={18} />
              <span>+ Create Event</span>
            </button>
            <button className="sidebar-item-link active">
              <BarChart3 size={18} />
              <span>Analytics</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(7)}>
              <BookOpen size={18} />
              <span>Bookings</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '20px' }}>Analytics</h1>

            <div className="stats-four-grid">
              <div className="stat-item-box">
                <div className="stat-item-label">Total Revenue</div>
                <div className="stat-item-value">₹{(organizerAnalytics?.totalRevenue ?? 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Tickets Sold</div>
                <div className="stat-item-value">{organizerAnalytics?.totalTicketsSold ?? organizerAnalytics?.totalBookings ?? 0}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Conversion Rate</div>
                <div className="stat-item-value">{organizerAnalytics?.conversionRate ?? 0}%</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Views</div>
                <div className="stat-item-value">{organizerAnalytics?.totalViews ?? (events.length * 120)}</div>
              </div>
            </div>

            <div className="charts-double-row">
              <div className="chart-white-card">
                <div className="chart-card-title">Revenue Trend</div>
                <div className="bar-chart-flex">
                  {(organizerAnalytics?.revenueTrend || []).map((item: any) => (
                    <div key={item.month} className="bar-col-item">
                      <div className="bar-shape" style={{ height: `${item.heightPercent || 20}%` }} title={`₹${item.revenue.toLocaleString('en-IN')}`}></div>
                      <span className="bar-lbl">{item.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="chart-white-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="chart-card-title" style={{ width: '100%' }}>Ticket Sales by Tier</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', margin: 'auto', width: '100%', justifyContent: 'space-around' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', width: '100%', padding: '0 16px' }}>
                    {(organizerAnalytics?.tierDistribution || []).map((tier: any, idx: number) => {
                      const colors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
                      const c = colors[idx % colors.length];
                      return (
                        <div key={tier.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '8px', height: '8px', background: c, borderRadius: '50%' }}></span>
                              <strong>{tier.name}</strong>
                            </span>
                            <span>{tier.percentage}% (₹{(tier.revenue || 0).toLocaleString('en-IN')})</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${tier.percentage}%`, height: '100%', background: c }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 15: ADMIN DASHBOARD                           */}
      {/* ==================================================== */}
      {currentScreen === 15 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link active">
              <Building2 size={18} />
              <span>Tenants</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(17)}>
              <Users size={18} />
              <span>Users</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <CalendarRange size={18} />
              <span>Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(18)}>
              <FileText size={18} />
              <span>System Logs</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '20px' }}>Platform Overview</h1>

            <div className="stats-four-grid">
              <div className="stat-item-box">
                <div className="stat-item-label">Total Tenants</div>
                <div className="stat-item-value">{adminAnalytics?.totalTenants ?? adminTenants.length}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Users</div>
                <div className="stat-item-value">{adminAnalytics?.totalUsers ?? adminUsers.length}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Events</div>
                <div className="stat-item-value">{adminAnalytics?.totalEvents ?? events.length}</div>
              </div>
              <div className="stat-item-box">
                <div className="stat-item-label">Total Revenue</div>
                <div className="stat-item-value">₹{(adminAnalytics?.totalRevenue ?? 0).toLocaleString('en-IN')}</div>
              </div>
            </div>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px' }}>Recent Tenants</h3>
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Events</th>
                  <th>Created At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {adminTenants.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td><code>{t.slug}</code></td>
                    <td>{t.events_count ?? 0}</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td><span className="badge-pill active">{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 16: MANAGE TENANTS (ADMIN)                    */}
      {/* ==================================================== */}
      {currentScreen === 16 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link active">
              <Building2 size={18} />
              <span>Tenants</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(17)}>
              <Users size={18} />
              <span>Users</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <CalendarRange size={18} />
              <span>Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(18)}>
              <FileText size={18} />
              <span>System Logs</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <div className="content-top-header">
              <h1 className="content-title-h1">Manage Tenants</h1>
              <button
                className="btn-primary-purple"
                style={{ width: 'auto', padding: '8px 16px' }}
                onClick={() => setShowAddTenantModal(true)}
              >
                Add Tenant
              </button>
            </div>

            <table className="saas-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Contact</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminTenants.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td><code>{t.slug}</code></td>
                    <td>{t.contact_email}</td>
                    <td>{t.events_count ?? 0}</td>
                    <td><span className="badge-pill active">{t.status}</span></td>
                    <td><button className="btn-table-edit" onClick={() => showToast(`Edit tenant ${t.name}`)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 17: MANAGE USERS (ADMIN)                      */}
      {/* ==================================================== */}
      {currentScreen === 17 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(15)}>
              <Building2 size={18} />
              <span>Tenants</span>
            </button>
            <button className="sidebar-item-link active">
              <Users size={18} />
              <span>Users</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <CalendarRange size={18} />
              <span>Events</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(18)}>
              <FileText size={18} />
              <span>System Logs</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <h1 className="content-title-h1" style={{ marginBottom: '24px' }}>Manage Users</h1>

            <table className="saas-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge-pill ${u.role === 'admin' ? 'info' : u.role === 'organizer' ? 'active' : ''}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td>{u.tenant_name}</td>
                    <td><span className="badge-pill active">{u.status}</span></td>
                    <td><button className="btn-table-edit" onClick={() => showToast(`Edit user ${u.full_name}`)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* SCREEN 18: SYSTEM LOGS (ADMIN)                       */}
      {/* ==================================================== */}
      {currentScreen === 18 && (
        <div className="sidebar-layout-container">
          <aside className="app-sidebar">
            <div className="nav-brand" style={{ padding: '0 12px 18px' }} onClick={() => setCurrentScreen(1)}>
              <Ticket size={22} />
              <span>EventHub</span>
            </div>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(15)}>
              <Building2 size={18} />
              <span>Tenants</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(17)}>
              <Users size={18} />
              <span>Users</span>
            </button>
            <button className="sidebar-item-link" onClick={() => setCurrentScreen(10)}>
              <CalendarRange size={18} />
              <span>Events</span>
            </button>
            <button className="sidebar-item-link active">
              <FileText size={18} />
              <span>System Logs</span>
            </button>
            <button className="sidebar-item-link">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </aside>

          <main className="sidebar-main-content">
            <div className="content-top-header">
              <h1 className="content-title-h1">System Logs</h1>
              <button className="btn-table-edit" onClick={loadAdminData}>
                <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Refresh
              </button>
            </div>

            <table className="saas-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {systemLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`badge-pill ${log.level === 'INFO' ? 'info' : log.level === 'WARN' ? 'warn' : 'danger'}`}>
                        {log.level}
                      </span>
                    </td>
                    <td>{log.message}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD TICKET TIER                               */}
      {/* ==================================================== */}
      {showAddTierModal && (
        <div className="clean-modal-backdrop" onClick={() => setShowAddTierModal(false)}>
          <div className="clean-modal-window" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>Add Ticket Tier</h3>
            <div className="form-field-group">
              <label className="form-field-label">Tier Name</label>
              <input
                type="text"
                className="form-field-input"
                placeholder="e.g. Early Bird VIP"
                value={newTierName}
                onChange={(e) => setNewTierName(e.target.value)}
              />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Price (₹)</label>
              <input
                type="number"
                className="form-field-input"
                placeholder="1499"
                value={newTierPrice}
                onChange={(e) => setNewTierPrice(e.target.value)}
              />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Quantity</label>
              <input
                type="number"
                className="form-field-input"
                placeholder="100"
                value={newTierQty}
                onChange={(e) => setNewTierQty(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-outline-white" style={{ width: 'auto', margin: 0 }} onClick={() => setShowAddTierModal(false)}>Cancel</button>
              <button className="btn-primary-purple" style={{ width: 'auto' }} onClick={handleAddTier}>Save Tier</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ADD TENANT                                    */}
      {/* ==================================================== */}
      {showAddTenantModal && (
        <div className="clean-modal-backdrop" onClick={() => setShowAddTenantModal(false)}>
          <div className="clean-modal-window" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>Add Tenant Organization</h3>
            <div className="form-field-group">
              <label className="form-field-label">Tenant Name</label>
              <input
                type="text"
                className="form-field-input"
                placeholder="Hyderabad Tech Club"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
              />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Slug</label>
              <input
                type="text"
                className="form-field-input"
                placeholder="hyd-tech"
                value={newTenantSlug}
                onChange={(e) => setNewTenantSlug(e.target.value)}
              />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Contact Email</label>
              <input
                type="email"
                className="form-field-input"
                placeholder="contact@hydtech.org"
                value={newTenantEmail}
                onChange={(e) => setNewTenantEmail(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-outline-white" style={{ width: 'auto', margin: 0 }} onClick={() => setShowAddTenantModal(false)}>Cancel</button>
              <button className="btn-primary-purple" style={{ width: 'auto' }} onClick={handleAddTenant}>Save Tenant</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: SIGN IN / SIGN UP (AUTHENTICATION)            */}
      {/* ==================================================== */}
      {showAuthModal && (
        <div className="clean-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="clean-modal-window" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="auth-tab-row">
              <button
                className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
              >
                Sign In
              </button>
              <button
                className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => { setAuthMode('register'); setAuthError(null); }}
              >
                Create Account
              </button>
            </div>

            {authError && (
              <div className="auth-error-banner">
                {authError}
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <div className="demo-credentials-row">
                  <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>Quick Demo Logins:</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="demo-pill-btn"
                      onClick={() => { setAuthEmail('blessed@example.com'); setAuthPassword('password123'); }}
                    >
                      Attendee (Blessed)
                    </button>
                    <button
                      type="button"
                      className="demo-pill-btn"
                      onClick={() => { setAuthEmail('priya@example.com'); setAuthPassword('password123'); }}
                    >
                      Organizer (Priya)
                    </button>
                    <button
                      type="button"
                      className="demo-pill-btn"
                      onClick={() => { setAuthEmail('admin@example.com'); setAuthPassword('admin123'); }}
                    >
                      Admin (System)
                    </button>
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Email Address</label>
                  <input
                    type="email"
                    className="form-field-input"
                    required
                    placeholder="name@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Password</label>
                  <input
                    type="password"
                    className="form-field-input"
                    required
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button
                    type="button"
                    className="btn-outline-white"
                    style={{ width: 'auto', margin: 0 }}
                    onClick={() => setShowAuthModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-purple"
                    style={{ width: 'auto' }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Signing In...' : 'Sign In'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <div className="form-field-group">
                  <label className="form-field-label">Full Name</label>
                  <input
                    type="text"
                    className="form-field-input"
                    required
                    placeholder="e.g. Samuel Richard"
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Email Address</label>
                  <input
                    type="email"
                    className="form-field-input"
                    required
                    placeholder="samuel@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Password</label>
                  <input
                    type="password"
                    className="form-field-input"
                    required
                    placeholder="Min 6 characters"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">Phone (Optional)</label>
                  <input
                    type="tel"
                    className="form-field-input"
                    placeholder="+91 9876543210"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-field-label">I am joining as:</label>
                  <div className="role-radio-options">
                    <div
                      className={`role-radio-box ${authRole === 'attendee' ? 'selected' : ''}`}
                      onClick={() => setAuthRole('attendee')}
                    >
                      <span className="role-radio-title">Attendee</span>
                      <span className="role-radio-desc">Discover & reserve tickets</span>
                    </div>
                    <div
                      className={`role-radio-box ${authRole === 'organizer' ? 'selected' : ''}`}
                      onClick={() => setAuthRole('organizer')}
                    >
                      <span className="role-radio-title">Organizer</span>
                      <span className="role-radio-desc">Publish events & sell tickets</span>
                    </div>
                  </div>
                </div>

                {authRole === 'organizer' && (
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <div className="form-field-group" style={{ marginBottom: '10px' }}>
                      <label className="form-field-label">Organization / Club Name</label>
                      <input
                        type="text"
                        className="form-field-input"
                        placeholder="e.g. Chennai Tech Club"
                        value={authTenantName}
                        onChange={(e) => {
                          setAuthTenantName(e.target.value);
                          setAuthTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                        }}
                      />
                    </div>
                    <div className="form-field-group" style={{ marginBottom: 0 }}>
                      <label className="form-field-label">Organization Slug</label>
                      <input
                        type="text"
                        className="form-field-input"
                        placeholder="chennai-tech"
                        value={authTenantSlug}
                        onChange={(e) => setAuthTenantSlug(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button
                    type="button"
                    className="btn-outline-white"
                    style={{ width: 'auto', margin: 0 }}
                    onClick={() => setShowAuthModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-purple"
                    style={{ width: 'auto' }}
                    disabled={authLoading}
                  >
                    {authLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SLEEK FLOATING SCREEN & ROLE SWITCHER                */}
      {/* ==================================================== */}
      <div className="floating-wireframe-navigator">
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Screen:</span>
        <select
          className="floating-select"
          value={currentScreen}
          onChange={(e) => {
            const s = parseInt(e.target.value, 10);
            setCurrentScreen(s);
            if (s >= 11 && s <= 14 && currentUser?.role !== 'organizer') {
              switchPersona('organizer');
            } else if (s >= 15 && s <= 18 && currentUser?.role !== 'admin') {
              switchPersona('admin');
            } else if (s >= 7 && s <= 9 && currentUser?.role !== 'attendee') {
              switchPersona('attendee');
            }
          }}
        >
          <option value={1}>1. Landing Page (Public)</option>
          <option value={2}>2. Event Details</option>
          <option value={3}>3. Reservation Hold</option>
          <option value={4}>4. Checkout & Payment</option>
          <option value={5}>5. Payment Processing</option>
          <option value={6}>6. Booking Confirmation</option>
          <option value={7}>7. My Bookings (Attendee)</option>
          <option value={8}>8. E-Ticket (Attendee)</option>
          <option value={9}>9. Profile & Settings</option>
          <option value={10}>10. Browse Events (Filters)</option>
          <option value={11}>11. Organizer Dashboard</option>
          <option value={12}>12. Create Event (Organizer)</option>
          <option value={13}>13. Manage Ticket Tiers (Organizer)</option>
          <option value={14}>14. Analytics (Organizer)</option>
          <option value={15}>15. Admin Dashboard</option>
          <option value={16}>16. Manage Tenants</option>
          <option value={17}>17. Manage Users</option>
          <option value={18}>18. System Logs</option>
        </select>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className={`persona-switch-btn ${currentUser?.role === 'attendee' ? 'active' : ''}`}
            onClick={() => switchPersona('attendee')}
          >
            Attendee
          </button>
          <button
            className={`persona-switch-btn ${currentUser?.role === 'organizer' ? 'active' : ''}`}
            onClick={() => switchPersona('organizer')}
          >
            Organizer
          </button>
          <button
            className={`persona-switch-btn ${currentUser?.role === 'admin' ? 'active' : ''}`}
            onClick={() => switchPersona('admin')}
          >
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}
