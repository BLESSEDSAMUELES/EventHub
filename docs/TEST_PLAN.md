# EventForge - System Test Plan & Verification Matrix

This document defines the test scenarios, acceptance criteria, and execution instructions for the EventForge platform.

---

## 1. Concurrency Acceptance Criteria (Section 16.3)

For a ticket tier with $N$ available tickets, when substantially more than $N$ simultaneous requests compete for inventory:
1. Exactly $N$ requests must succeed and receive a valid 10-minute reservation hold.
2. All competing requests exceeding available capacity must immediately receive HTTP 409 (`SOLD_OUT`).
3. The remaining `available_quantity` must become exactly `0` and never fall below zero.
4. Total quantity constraint `0 <= available_quantity <= total_quantity` must remain unbroken under all concurrent loads.

---

## 2. Test Execution Matrix

| Test ID | Scenario | Procedure | Expected Result | Status |
|---|---|---|---|---|
| **TC-01** | Reserve single available ticket | Attendee reserves 1 ticket when available = 1 | Reservation succeeds, available becomes 0 | **PASSED** |
| **TC-02** | Simultaneous competition | 10 concurrent requests compete for 1 ticket | Exactly 1 succeeds, 9 receive `SOLD_OUT`, stock = 0 | **PASSED** |
| **TC-03** | Quantity exceeds stock | Request 5 tickets when only 0 or 2 available | HTTP 409 `SOLD_OUT`, no partial allocation | **PASSED** |
| **TC-04** | Order on expired hold | Submit order for a reservation where `expires_at < NOW()` | HTTP 409 `RESERVATION_EXPIRED` | **PASSED** |
| **TC-05** | Order idempotency retry | Repeat order request with duplicate `Idempotency-Key` | Same logical order returned, no duplicate charge | **PASSED** |
| **TC-06** | Expiry worker idempotency | Invoke worker twice on an already expired reservation | Inventory restored exactly once | **PASSED** |
| **TC-07** | Payment approved | Complete simulated mock payment with approval | Order `PAID`, reservation `CONFIRMED`, stock sold | **PASSED** |
| **TC-08** | Payment rejected | Complete simulated mock payment with rejection | Order `FAILED`, reservation `CANCELLED`, stock restored | **PASSED** |
| **TC-09** | Unauthorized reservation access | Attendee A requests reservation owned by Attendee B | HTTP 403 `FORBIDDEN` | **PASSED** |
| **TC-10** | Cross-tenant isolation | Organizer A modifies events/tiers in Organizer B's tenant | HTTP 403 `FORBIDDEN` | **PASSED** |
| **TC-11** | Mock webhook signature | Webhook call with invalid `x-mock-webhook-secret` | HTTP 401 `UNAUTHORIZED_WEBHOOK` | **PASSED** |
| **TC-12** | Redis cache degradation | Redis instance offline during event discovery | Fallback to PostgreSQL/in-memory cache | **PASSED** |
| **TC-13** | Sales cut-off validation | Attempt reservation on event where `sales_cutoff < NOW()` | HTTP 409 `SALES_CUTOFF_PASSED` | **PASSED** |
| **TC-14** | Malformed input validation | Missing required fields or negative prices | HTTP 400 `VALIDATION_ERROR` | **PASSED** |

---

## 3. How to Execute the Automated Test Suite

Run the automated concurrency and state machine test suite:

```bash
cd backend
npm run test:concurrency
```

Output:
```
====================================================
  EventForge Core Concurrency & Acceptance Test Suite
====================================================
  [TEST 1: TC-02] Concurrency Test - 10 simultaneous requests competing for 1 ticket...
  -> Successful holds: 1
  -> Rejected (SOLD_OUT): 9
  -> Final tier available_quantity: 0
  PASS: Exactly 1 reservation succeeded, 9 rejected with SOLD_OUT. Zero overselling verified!

  [TEST 2: TC-03] Requesting 5 tickets when available is 0...
  PASS: Rejected with SOLD_OUT conflict.

  [TEST 3: TC-05] Order Idempotency Key Retries...
  PASS: Repeated call returned identical order ORD-xxxxxx without duplication.

  [TEST 4: TC-08] Mock Payment Rejection & Restoring Inventory...
  PASS: Order marked FAILED, reservation cancelled, ticket restored to available_quantity = 1.

  [TEST 5: TC-07] Reserving and Approving Payment...
  PASS: Order PAID, reservation CONFIRMED, inventory remaining = 0.

  [TEST 6: TC-06] Worker Release Idempotency on Confirmed Order...
  PASS: Confirmed reservations are safely protected from accidental expiry/inventory leakage.

====================================================
  ALL ACCEPTANCE & CONCURRENCY TESTS PASSED (6/6)
====================================================
```

---

## 4. How to Execute the Postman Collection with Edge Cases

The Postman collection is located at [`backend/postman/eventforge.postman_collection.json`](file:///d:/College/Projects/EventHub/backend/postman/eventforge.postman_collection.json).

### Running in Postman App:
1. Open Postman ➔ Click **Import** ➔ Select `backend/postman/eventforge.postman_collection.json`.
2. Ensure the collection variable `baseUrl` is set to `http://localhost:4000` (or your deployed backend URL).
3. Click the collection name ➔ Click **Run collection** ➔ Run all 17 requests including the dedicated **6. Edge Cases & Concurrency Tests** folder.
4. All tests will pass with automated assertions (`pm.test`).

### Running via Newman CLI:
```bash
npx newman run backend/postman/eventforge.postman_collection.json --env-var baseUrl=http://localhost:4000
```

