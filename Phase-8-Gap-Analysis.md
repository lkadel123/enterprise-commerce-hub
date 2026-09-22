# Enterprise Commerce Hub - Phase 8: Notifications & Support Conversations

## Backend GAP ANALYSIS ONLY

## 1. Phase Identified

## 2. Exact Architecture Requirements

## 3. Current Implementation Status

## 4. Existing Infrastructure Summary

## 5. Required Phase 8 API Surface

## 6. Database GAP Analysis

## 7. Security / IDOR Analysis

## 8. Order/Payment Event Integration

## 9. Email / Push / In-App Analysis

## 10. Support Workflow Analysis

## 11. Pagination / Sorting

## 12. Rate Limiting

## 13. Data Leakage

## 14. File / Attachment Analysis

## 15. Frontend Contract

## 16. Phase 1–7 Regression Analysis

## 17. Test Matrix (Design Only — NO Tests Created)

## 18. Files That MUST Be Created (EXACT PATHS)

## 19. Files That MUST Be Modified (EXACT PATHS + REASON)

## 20. Recommended Implementation Order

## 21. Explicitly Out of Scope

## 22. Final Conclusion

### Summary of Gaps

1. **No customer notification channel** — existing `Notification` model is admin-only (`recipientId → User`)
2. **No support conversation model** — `Message` model is admin-to-admin only
3. **No customer-scoped API routes** — all existing routes require admin authentication/permissions
4. **No event integration** — order/payment/review events don't trigger customer notifications

### Required Infrastructure

- **Modify** `Notification` model to support customer recipient (`customerId` + `recipientType` discriminant)
- **Create** `SupportConversation` model (customer ↔ support thread)
- **Create** `SupportMessage` model (messages within conversation)
- **New API routes** under `/api/v1/customer/notifications` and `/api/v1/customer/support/*`
- **Event hooks** in order/payment/review services to trigger customer notifications

### Security Priority

- **IDOR prevention** is the highest priority — every endpoint must verify `req.customer._id` matches the resource's `customerId`
- **Message sanitization** required to prevent XSS via message body
- **DTO filtering** to prevent admin/internal data leakage to customers

### Implementation Risk

- **Low risk** — all changes are additive (new routes, new models, modified fields)
- **No breaking changes** to existing Phase 1–7 APIs
- **Typecheck and build** should continue to pass with proper type definitions
- **143 existing tests** should continue to pass; new tests needed for Phase 8 coverage

### Final Statement

ANALYSIS ONLY — NO FILES WERE CREATED, MODIFIED, DELETED, OR REFACTORED.

The following are **explicitly out of scope** for Phase 8 (per architecture analysis):

- ❌ Email/SMS notification delivery (infrastructure not configured; business decision per line 861)
- ❌ FCM/Push notifications (no infrastructure)
- ❌ Web Push notifications
- ❌ File/attachment uploads for notifications or messages (can be added later)
- ❌ Admin support agent APIs (separate admin-facing feature; customer scope only)
- ❌ Guest/anonymous support conversations (architecture requires customer auth)
- ❌ Customer notification preferences configuration (business decision per line 809)
- ❌ CDN/media scaling for notification attachments (out of scope)
- ❌ Newsletter email infrastructure (line 809: "Needs email infra")
- ❌ Discount/offer model decisions (line 861: "Business decision")
- ❌ Guest checkout or anonymous purchasing
- ❌ Public banner endpoints (admin-gated, separate feature)
- ❌ Overhauling existing admin notification/message infrastructure

```text
1. Database models
   - Modify: Notification model (add customerId, recipientType)
   - Create: SupportConversation model
   - Create: SupportMessage model

2. Repositories
   - Update: Notification repository (add customer-scoped queries)
   - Create: SupportConversation repository
   - Create: SupportMessage repository

3. Validators/types
   - Update: Notification validator/schema (add customer context)
   - Create: Conversation validator/schema
   - Create: Message validator/schema (within conversation)

4. Services
   - Update: Notification service (customer ownership checks, event triggers)
   - Create: Conversation service (create/list/read/unread status transitions)
   - Create: Message service (within conversation, sender type handling)

5. Controllers
   - Update: Notification controller (customer-scoped endpoints)
   - Create: Conversation controller (create, list, read, mark-read)
   - Create: Message controller (send, list within conversation)

6. Routes
   - Register: POST /api/v1/customer/notifications/*
   - Register: GET /api/v1/customer/notifications/*
   - Register: PATCH /api/v1/customer/notifications/:id/read
   - Register: GET /api/v1/customer/support/conversations/*
   - Register: GET /api/v1/customer/support/conversations/:id/*
   - Register: GET /api/v1/customer/support/conversations/:id/messages/*
   - Register: POST /api/v1/customer/support/conversations/:id/messages

7. Event integration
   - Order service hooks: order_created, order_status_changed
   - Payment service hooks: payment_initiated, payment_successful, payment_failed
   - Review service hook: review_submitted
   - Coupon service hook: coupon_redeemed

8. app.ts registration
   - Mount customer-notifications routes
   - Mount customer-support-conversations routes
   - Mount customer-support-messages routes (nested under conversations)

9. Tests
   - Write notification API tests (auth, CRUD, IDOR, pagination)
   - Write support conversation API tests (create, list, ownership)
   - Write support message API tests (send, list, validation)
   - Run full test suite: 143 tests + new Phase 8 tests

10. Build
    - `yarn build` → PASS

11. Typecheck
    - `yarn run test:typecheck` → PASS

12. Full regression suite
    - Run all 143 existing tests + new Phase 8 tests
    - Verify no regressions
```

**NOT TO BE MODIFIED during this analysis task.** This section documents what would be needed:

### 1. `backend/src/modules/notifications/notification.model.ts`

**Reason:** Add `customerId` and `recipientType` fields to support customer-scoped notifications while maintaining admin recipient backward compatibility. Add `customerId` index.

### 2. `backend/src/modules/notifications/notification.types.ts`

**Reason:** Add customer notification DTO type (omit `recipientId`, mask `metadata`); update `UnreadCountDto` if needed.

### 3. `backend/src/app.ts`

**Reason:** Register new customer routes:

- `app.use(`${API_PREFIX}/customer/notifications`, ...)`
- `app.use(`${API_PREFIX}/customer/support`, ...)`
- Must mount BEFORE any admin-gated routes that could conflict

### 4. `backend/src/modules/messages/message.model.ts`

**Reason:** Potentially add `senderType` field (`"customer" | "support"`) and `isInternal` flag to separate customer-visible messages from admin internal notes. OR create new `SupportMessage` model in new module.

### 5. `backend/src/modules/messages/message.types.ts`

**Reason:** Add customer-facing Message DTO that filters out internal/admin notes.

**NOT TO BE CREATED during this analysis task.** This section documents what would be needed for implementation:

```
backend/src/modules/customer-notifications/           (NEW module)
  notification.model.ts       // Modified Notification model + customer recipient
  notification.types.ts       // Updated types with customer notification DTO
  notification.routes.ts      // Customer notification routes
  notification.controller.ts  // Customer notification controller
  notification.service.ts     // Notification service logic
  notification.validator.ts   // Zod schemas for customer notifications

backend/src/modules/support-conversations/            (NEW module)
  conversation.model.ts       // SupportConversation new model
  conversation.types.ts       // SupportConversation DTO types
  conversation.routes.ts      // Support conversation routes
  conversation.controller.ts  // Support conversation controller
  conversation.service.ts     // Conversation service logic
  conversation.validator.ts   // Zod schemas for conversations

backend/src/modules/support-messages/                 (NEW module)
  message.model.ts            // SupportMessage new model
  message.types.ts            // SupportMessage DTO types
  message.routes.ts           // Support message routes (within conversation)
  message.controller.ts       // Support message controller
  message.service.ts          // Message service logic
  message.validator.ts        // Zod schemas for messages
```

### 17.1 Authentication

- Unauthenticated → 401
- Expired token → 401
- Customer token rejected (not admin token)
- Inactive customer rejected

### 17.2 IDOR

- Customer A cannot access Customer B's notification
- Customer A cannot access Customer B's conversation
- Customer A cannot send to Customer B's conversation
- Customer A cannot modify Customer B's ticket

### 17.3 Notifications

- Creation with valid payload
- Listing with pagination, sorting, filters
- Unread filtering (`read=false` query)
- Mark one notification read (`PATCH :id/read`)
- Mark all read (`PATCH read-all`)
- Ownership enforcement
- Pagination
- Deletion (customer's own notifications only)

### 17.4 Support

- Create conversation/ticket with subject/body/priority
- List conversations with pagination, filters
- Send message in conversation
- Ownership enforcement (customer ↔ conversation)
- Status transitions (OPEN→PENDING→IN_PROGRESS→RESOLVED→CLOSED)
- Pagination (conversation list)
- Rate limiting on create endpoints
- Message validation (body length, sanitization)

### 17.5 Injection/Security

- Mongo operators injection ($where, $elemMatch via query)
- Unknown fields in create payload
- Oversized payload (>1mb)
- XSS/HTML payload in message body
- Invalid ObjectId in params → 400/404

### 17.6 Regression

- Run existing test suite against Phase 1–7 contracts
- Verify no test breakage from notification model modification
- Verify no test breakage from new model additions
- Verify typecheck still passes
- Verify build still passes

### 16.1 Phase 3 — Customer Authentication/Account Identity

**Risk:** None — customer auth infrastructure already exists and is separate. Phase 8 will use `customerAuthenticate` middleware; no changes to Phase 3 auth.

### 16.2 Phase 4 — Cart/Wishlist

**Risk:** None — cart/wishlist are independent data domains. No interference.

### 16.3 Phase 5 — Orders and Order Tracking

**Risk:** ⚠️ Order notification hooks will be added. `orderService` will need to call notification service after order creation/status changes. Must ensure notifications use `customerId` (not admin `recipientId`) and must not leak `cost` or internal order metadata.

### 16.4 Phase 6 — Payments

**Risk:** ⚠️ Payment event notifications required (payment initiated/successful/failed). `paymentService` will need to call notification service after payment status updates. Same as Phase 5 — must use customer-scoped notifications, not admin; must not expose payment provider secrets.

### 16.5 Phase 7 — Reviews/Coupons

**Risk:** ✅ Review submission already has notification hook pattern (from test analysis). Review creation can trigger `review_submitted` notification; coupon redemption can trigger `coupon_redeemed`. No regression.

### 16.6 Overall Regression Score

**Low risk** — all changes are additive (new routes, new models, modified fields). No breaking changes to existing Phase 1–7 APIs (all new routes under `/api/v1/customer/*`). Model modification to `Notification` is backward-compatible (additive fields with defaults). New models (`SupportConversation`, `SupportMessage`) are entirely new and don't affect existing schemas.

### 15.1 Notification Frontend Needs

| Aspect             | Requirement                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Request**        | `GET /api/v1/customer/notifications?priority=critical&read=false`                                                              |
| **Response**       | Array of notification DTOs with `id, type, title, message, priority, read, readAt, entityType, entityId, actionUrl, createdAt` |
| **Authentication** | `customerAccessToken` in `Authorization: Bearer <token>` header                                                                |
| **Error cases**    | 401 (unauthenticated), 403 (forbidden — IDOR attempt), 404 (not found)                                                         |
| **Pagination**     | TanStack Query `pageSize` + `pageIndex`; initial load page 1                                                                   |
| **Loading state**  | Skeleton state while fetching; unread badge count in header                                                                    |
| **Unread state**   | Bell icon with unread count badge; filter UI for read/unread/all; mark-as-read on click                                        |

### 15.2 Support Conversations Frontend Needs

| Aspect                | Requirement                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Request**           | `GET /api/v1/customer/support/conversations` (list), `GET /api/v1/customer/support/conversations/:id` (detail)      |
| **Response (list)**   | Array of conversation summaries: `id, subject, status, priority, lastMessagePreview, createdAt, unreadMessageCount` |
| **Response (detail)** | Full conversation with messages sorted by `createdAt`, with read/unread state per message                           |
| **Authentication**    | `customerAccessToken` in `Authorization: Bearer <token>` header                                                     |
| **Error cases**       | 401, 403 (IDOR), 404 (conversation not found or not customer's)                                                     |
| **Pagination**        | List conversations with `pageSize`; detailed view no pagination                                                     |
| **Loading state**     | Skeleton states for conversation list and message loading                                                           |
| **Unread state**      | Conversation list badge with unread message count; message read markers                                             |

### 15.3 Error State Handling

- **401:** Redirect to login, preserve intended destination
- **403:** Show access denied error; log IDOR attempt for security
- **404:** Show "Conversation not found" or "No notifications"; handle gracefully
- **Validation errors:** Display Zod validation error messages from API response

### 14.1 Does Phase 8 Require Attachments?

The architecture does not explicitly mention file attachments for notifications or support conversations — **optional, not architecture-required**.

### 14.2 Recommendation for Phase 8

- **Start without attachments** — Phase 8 is notification text + support conversation text
- **Attachments can be added in a later phase** (Phase 9 or later)
- **If needed later:** Reuse existing `multer` + `localMediaStorage` infrastructure

### 13.1 Customer-Safe DTO Requirements

Customer APIs must **not expose**: internal database fields, admin-only metadata, security tokens, provider secrets, internal notes, staff-only messages, cost fields, private system metadata.

### 13.2 Support Conversations — Internal/Admin Notes Separation

**Critical:** Support conversations must separate customer-visible messages from internal/admin notes. `SupportMessage` has `senderType: "customer" | "support"`; internal notes flagged with `isInternal: true` must NOT be returned in customer-facing responses.

### 13.3 Notification DTO Customer-Safe Fields

**NotificationDto** must omit or mask: `metadata` if it contains admin-only data, `recipientId` if it reveals admin User IDs, internal system metadata fields.

### 12.1 Which Operations Require Rate Limiting?

| Operation                     | Required Limiter           | Rationale                    |
| ----------------------------- | -------------------------- | ---------------------------- |
| Creating support tickets      | ✅ `authActionRateLimiter` | Prevent spam ticket creation |
| Sending support messages      | ✅ `authActionRateLimiter` | Prevent conversation spam    |
| Marking notifications read    | ⚠️ `apiRateLimiter`        | Low risk; can reuse existing |
| Listing notifications         | ⚠️ `apiRateLimiter`        | Standard API rate limit      |
| Listing support conversations | ⚠️ `apiRateLimiter`        | Standard API rate limit      |
| Unread count                  | ⚠️ `apiRateLimiter`        | Standard API rate limit      |

### 12.2 Recommended Limiters

- **`authActionRateLimiter`** for `POST` endpoints (create conversation, send message, create notification)
- **`apiRateLimiter`** for `GET` endpoints (list, unread count, get by ID)
- **No new limiter needed** — existing limiters are sufficient

### 11.1 Notification List Endpoint

Reuse existing `parsePagination`, `paginationMeta`:

```typescript
// Query params (from existing notificationListQuerySchema):
page?: number      // default: 1
pageSize?: number  // default: 20 (or existing default)
sort?: string      // default: "-createdAt" (descending)
filters: {
  priority?: "low"|"normal"|"high"|"critical"
  read?: "true"|"false"
  q?: string       // search in title/message
  type?: NotificationType
}
```

### 11.2 Support Conversations List Endpoint

```typescript
// Query params:
page?: number      // default: 1
pageSize?: number  // default: 20
sort?: string      // default: "-createdAt"
filters: {
  status?: "OPEN"|"PENDING"|"IN_PROGRESS"|"RESOLVED"|"CLOSED"
  priority?: "low"|"normal"|"high"|"urgent"
}
```

### 11.3 Messages in Conversation List Endpoint

```typescript
// Query params:
page?: number
pageSize?: number
sort?: string      // default: "-createdAt"
filters: {
  isRead?: "true"|"false"
  type?: MessageType
}
```

### 10.1 Intended Lifecycle

Proposed statuses: `OPEN`, `PENDING`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`

### 10.2 Ownership & Workflow

| Question                             | Answer                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Who creates a ticket?                | Customer (via `POST /api/v1/customer/support/conversations`)           |
| Who can reply?                       | Customer + Support staff (separate admin auth)                         |
| Who can close it?                    | Support agent (admin) or Customer (reopen if needed)                   |
| Can customers reopen?                | Yes — status transition from RESOLVED/CLOSED back to OPEN/PENDING      |
| Are conversations tied to orders?    | Optional — `orderId` field on SupportConversation for context          |
| Are conversations tied to customers? | Yes — `customerId` is required                                         |
| Attachments?                         | Not specified by architecture; can be added later                      |
| Pagination required?                 | Yes — list endpoints need pagination (`parsePagination`)               |
| Unread counts required?              | Yes — `unread-count` endpoint for both notifications and conversations |

### 9.1 Existing Infrastructure Classification

| Channel                  | Status                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **In-app notifications** | ⚠️ Partially implemented — `Notification` model exists but admin-only; needs customer-scoped API |
| **Email (SMTP)**         | ❌ Completely missing                                                                            |
| **FCM / Push**           | ❌ Completely missing                                                                            |
| **Web Push**             | ❌ Completely missing                                                                            |
| **SMS**                  | ❌ Completely missing                                                                            |
| **Configuration-only**   | ⚠️ None identified                                                                               |

### 9.2 Recommended Approach for Phase 8

- **Start with in-app only** — the `Notification` model + customer-scoped API
- **Email/Push are out of scope for Phase 8**
- **Architecture says** (line 861): `email/SMS provider; customer notification recipient design` — these are "requires business decision" items for later phases
- **Do not introduce external infrastructure** (SMS, FCM, SMTP) during Phase 8 analysis

### 9.3 Notification Recipient Design

**Business decision required** (line 861): Should notifications be per-customer or per-CRM-customer-account? Recommend using `customerId` (CRM Customer model from Phase 3) as the primary recipient.

### 8.1 Events That Should Trigger Notifications

| Event                | Required?        | Already Has Hook?                       | Required Modification                               |
| -------------------- | ---------------- | --------------------------------------- | --------------------------------------------------- |
| Order created        | ✅ Yes           | ❌ No customer-scoped hook              | Add `order_created` notification type + hook        |
| Order status changed | ✅ Yes           | ❌ No customer-scoped hook              | Add `order_status_changed` notification type + hook |
| Payment initiated    | ✅ Yes           | ❌ No customer-scoped hook              | Add `payment_initiated` notification type + hook    |
| Payment successful   | ✅ Yes           | ❌ No customer-scoped hook              | Add `payment_successful` notification type + hook   |
| Payment failed       | ✅ Yes           | ❌ No customer-scoped hook              | Add `payment_failed` notification type + hook       |
| Review submitted     | ✅ Yes (Phase 7) | ✅ Yes — Phase 7 review creation exists | Link to notification on review creation             |
| Coupon redemption    | ✅ Yes           | ⚠️ Partial — coupon validate exists     | Add `coupon_redeemed` notification type + hook      |

### 8.2 Event/Outbox Infrastructure

- **Does an event/outbox/queue infrastructure exist?** ❌ No
- **Synchronous or asynchronous?** ⚠️ Recommend asynchronous (background job + outbox pattern)
- **Architecture requirement:** Not explicitly mandated, but outbox pattern recommended for production readiness
- **Current approach:** Can start synchronous and migrate to async later

### 8.3 Specific Service Hooks Needed

1. `orderService` — after order creation/update, call notification service
2. `paymentService` — after payment status update, call notification service
3. `reviewService` — after review creation, call notification service
4. `couponService` — after coupon redemption, call notification service

### 7.1 Notification Ownership

**CRITICAL:** A customer must never be able to read another customer's notification, mark it as read, or delete it. Enforcement via `req.customer._id` matching `notification.customerId`.

### 7.2 Support Conversation Ownership

**CRITICAL:** A customer must never be able to read another customer's conversation, send messages to another customer's conversation, or modify another customer's ticket. Enforcement via `req.customer._id` matching `supportConversation.customerId`.

### 7.3 Message Security

- **Message body length:** Max 5000 chars (already in Message model)
- **HTML/script injection:** Sanitize message body before storage
- **Mongo operators:** Use strict schema validation; avoid `$where`
- **Oversized payloads:** Express limit `1mb` (already in app.ts)
- **Rate limiting:** Apply `apiRateLimiter` or `authActionRateLimiter`
- **Spam/replay:** Track send frequency; optional rate limiting per customer/conversation

### 7.4 Notification Preference / Channel

Business decision required (line 861): `customer notification recipient design`. Recommend starting with in-app notifications only.

### 6.1 Models That Need Creation/Modification

#### ✅ `Notification` model — REQUIRES MODIFICATION

Currently: recipientId → User (admin)
**Required:** Add `customerId` field or polymorphic recipient support

#### ✅ `SupportConversation` model — REQUIRES CREATION

**New model** — does not currently exist.

#### ✅ `SupportMessage` model — REQUIRES CREATION

**New model** — does not currently exist.

#### ⚠️ `CustomerAccount` model — EXISTS, may need enhancement

Already exists from Phase 3 (`backend/src/modules/customer-auth/customerAccount.model.ts`):

- Fields: `_id, name, email, phone, group, status, city, address, joinedAt, createdAt, updatedAt`
- **Status:** Can be reused; needs `supportConversations` or notification references if required

### 6.2 Models That Are NOT Needed (already covered)

- `User` model — exists (admin), will be referenced for support staff
- `Customer` model — exists (CRM customer from Phase 3), referenced via `customerId`

### 6.3 Model Summary

| Model                 | Status    | Required Fields                                                                  | References                        | Indexes                                                              |
| --------------------- | --------- | -------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `Notification`        | ✅ Modify | `customerId`, `recipientType`, keep existing                                     | `User` (or `Customer`)            | Add `customerId` index                                               |
| `SupportConversation` | ❌ Create | `customerId`, `status`, `subject`, `priority`, `isRead`, `readAt`                | `Customer`                        | `{customerId: 1, status: 1, createdAt: -1}`                          |
| `SupportMessage`      | ❌ Create | `conversationId`, `senderId`, `senderType`, `body`, `type`, `priority`, `isRead` | `SupportConversation`, `Customer` | `{conversationId: 1, createdAt: -1}`, `{senderId: 1, createdAt: -1}` |

Based strictly on the architecture:

### 5.1 Notifications API

| Method   | Path                                      | Auth                   | Purpose                              | Validation                    |
| -------- | ----------------------------------------- | ---------------------- | ------------------------------------ | ----------------------------- |
| `GET`    | `/api/v1/customer/notifications`          | `customerAuthenticate` | List customer's notifications        | `notificationListQuerySchema` |
| `GET`    | `/api/v1/customer/notifications/:id`      | `customerAuthenticate` | Get single notification by ID        | `notificationParamsSchema`    |
| `PATCH`  | `/api/v1/customer/notifications/:id/read` | `customerAuthenticate` | Mark single notification as read     | `notificationParamsSchema`    |
| `PATCH`  | `/api/v1/customer/notifications/read-all` | `customerAuthenticate` | Mark all notifications as read       | —                             |
| `DELETE` | `/api/v1/customer/notifications/:id`      | `customerAuthenticate` | Delete notification (customer's own) | `notificationParamsSchema`    |

**Query params** (from existing `notificationListQuerySchema`):

- `priority?: "low"|"normal"|"high"|"critical"`
- `read?: "true"|"false"`
- `q?: string` (search query)
- `type?: NotificationType`
- `sort?: string`
- `page?: number`, `pageSize?: number`

### 5.2 Support Conversations API

| Method  | Path                                                  | Auth                   | Purpose                                | Validation                    |
| ------- | ----------------------------------------------------- | ---------------------- | -------------------------------------- | ----------------------------- |
| `POST`  | `/api/v1/customer/support/conversations`              | `customerAuthenticate` | Create new support ticket/conversation | `createConversationSchema`    |
| `GET`   | `/api/v1/customer/support/conversations`              | `customerAuthenticate` | List customer's conversations          | `conversationListQuerySchema` |
| `GET`   | `/api/v1/customer/support/conversations/:id`          | `customerAuthenticate` | Get conversation by ID                 | `paramsSchema`                |
| `GET`   | `/api/v1/customer/support/conversations/:id/messages` | `customerAuthenticate` | List messages in conversation          | `messageListQuerySchema`      |
| `POST`  | `/api/v1/customer/support/conversations/:id/messages` | `customerAuthenticate` | Send message in conversation           | `createMessageSchema`         |
| `PATCH` | `/api/v1/customer/support/conversations/:id/read`     | `customerAuthenticate` | Mark conversation as read              | `paramsSchema`                |

### 5.3 Support Messages (within conversations)

| Method | Path                                                              | Auth                   | Purpose                               | Validation            |
| ------ | ----------------------------------------------------------------- | ---------------------- | ------------------------------------- | --------------------- |
| `POST` | `/api/v1/customer/support/conversations/:conversationId/messages` | `customerAuthenticate` | Send message in existing conversation | `createMessageSchema` |

| Infrastructure                      | Status                                                                                        | Reusable for Phase 8?                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NotificationModel`                 | Admin-only, recipient=User                                                                    | ❌ No — recipient must change to Customer                                                 |
| `NotificationType enum`             | `order, inventory, customer, product, review, coupon, system, authentication, user, security` | ⚠️ Yes — can add `support`, `review_submitted`, `coupon_redeemed`, `order_status_changed` |
| `NotificationDto`                   | Admin DTO format                                                                              | ⚠️ Yes — needs customer DTO (omit internal fields)                                        |
| `MessageModel`                      | Admin-to-admin, senderId/recipientId=User                                                     | ❌ No — must be customer ↔ support                                                        |
| `MessageType enum`                  | `general, order, customer, product, inventory, system, support`                               | ✅ Yes — `support` type already exists                                                    |
| `MessageDto`                        | Admin DTO format                                                                              | ⚠️ Yes — needs customer DTO                                                               |
| `customerAuthenticate` middleware   | ✅ Exists                                                                                     | ✅ Yes — required for all customer endpoints                                              |
| `ensureCrmCustomer`                 | ✅ Exists                                                                                     | ✅ Yes — ownership enforcement                                                            |
| `parsePagination`, `paginationMeta` | ✅ Exists                                                                                     | ✅ Yes                                                                                    |
| `apiRateLimiter`                    | ✅ Exists                                                                                     | ✅ Yes                                                                                    |
| `authActionRateLimiter`             | ✅ Exists                                                                                     | ✅ Yes                                                                                    |
| Zod validation schemas              | ✅ Exists per module                                                                          | ✅ Yes                                                                                    |
| Mongo indexes                       | ✅ Exist on Notification & Message                                                            | ✅ Yes (adapt for customer)                                                               |

### 3.1 Existing Notification Infrastructure (admin-only)

- **Model:** `Notification` in `backend/src/modules/notifications/notification.model.ts`
  - Recipient: **admin `User`** (`recipientId → User`)
  - Types: `order, inventory, customer, product, review, coupon, system, authentication, user, security`
  - Priorities: `low, normal, high, critical`
  - Fields: `read, readAt, entityType/id, actionUrl, metadata`
  - Indexes: `{recipientId: 1, read: 1, createdAt: -1}`, `{recipientId: 1, type: 1, createdAt: -1}`, `{recipientId: 1, priority: 1, createdAt: -1}`
  - **Status:** Admin-targeted only; **no customer-scoped endpoints**

- **Routes:** `backend/src/modules/notifications/notification.routes.ts`
  - All routes require `authenticate` + `requirePermission("administration", ...)`
  - Endpoints: `GET /`, `GET /unread-count`, `POST /`, `GET /:id`, `PATCH /:id/read`, `PATCH /read-all`, `DELETE /:id`
  - **Status:** Completely admin-gated; **no customer routes**

- **Tests:** `backend/test/notifications.test.ts`
  - All tests use Super Admin or Admin tokens
  - Test IDOR protection: "does not delete notifications owned by another user"
  - **Status:** No customer authentication or customer-scoped tests

### 3.2 Existing Message/Support Infrastructure (admin-only)

- **Model:** `Message` in `backend/src/modules/messages/message.model.ts`
  - senderId → User, recipientId → User (both admin Users)
  - Fields: `subject, body ≤5000, type (general|order|customer|product|inventory|system|support), priority, isRead, readAt, entityType/id, actionUrl, metadata`
  - Indexes: `{recipientId: 1, isRead: 1, createdAt: -1}`, `{senderId: 1, createdAt: -1}`
  - **Status:** Admin-to-admin only; **no customer-scoped endpoints**

- **Routes:** `backend/src/modules/messages/message.routes.ts`
  - All routes require `authenticate` + `requirePermission("messages", ...)`
  - Endpoints: `GET /`, `GET /unread-count`, `POST /`, `GET /:id`, `PATCH /:id/read`, `PATCH /:id/unread`, `DELETE /:id`
  - **Status:** Completely admin-gated; **no customer routes**

- **Types:** `MESSAGE_TYPES` includes `"support"` but this is for admin message typing, not customer support conversations

### 3.3 Customer Authentication (Partially from Phase 3)

- Customer accounts exist via `customer-auth` module
- `customerAccessTokenFor`, `customerRefreshCookie` helpers available
- Routes: `POST /api/v1/auth/customer/register`, `POST /api/v1/auth/customer/login`, `GET /api/v1/auth/customer/me`
- Customer JWT auth middleware: `customerAuthenticate` (used in customer-scoped routes)
- **Status:** Customer authentication infrastructure exists but is separate from notification/support

### 3.4 Customer-Scoped Routes Already Registered in app.ts

```
POST /api/v1/auth/customer/*
GET /api/v1/auth/customer/me
POST /api/v1/account/profile
GET /api/v1/public/*
GET /api/v1/customer/orders
GET /api/v1/customer/payments
GET /api/v1/customer/reviews
GET /api/v1/customer/coupons
```

**None** of these include notification or support conversation endpoints.

From `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`:

### Line 35 (Roadmap)

> **Phase 8 — Notifications & support:** customer notification channel + support conversations.

### Line 237 (Customer features summary)

> - Customer notifications and a customer-support conversation/message channel.

### Line 464 (Message/Support Architecture)

> **No customer-support conversation model exists.** **REQUIRED BACKEND ENHANCEMENT:** a `Conversation`/`Message` (thread) between a customer and support staff, with customer-scoped create/list/read and unread counts. Do **not** fabricate a support inbox on the frontend against the admin messaging API.

### Line 566 (Customer Website Architecture)

> **Message/support** → customer-scoped conversation threads (create/list/read/unread).

### Line 695 (Backend Gap Analysis table)

| Support conversations | — | — | NO | /support/conversations (customer) |

### Line 709 (Gap Analysis)

> Support conversations | No (admin-to-admin) | No | — | Conversation/Message threads | High

### Line 790 (Phase summary)

> - **Phase 8 — Notifications & support:** customer notification channel + support conversations.

### Line 807 (Confirmed from existing source)

> Notification/message recipient model is admin-only + recipient bug | Medium | New customer channel; fix payment-notification recipient

### Line 861 (Requires business decision)

> email/SMS provider; customer notification recipient design.

### Line 880 (Missing backend capabilities)

> customer notifications; support conversations

**Phase 8** from the Implementation Roadmap: **"Notifications & support"** (line 790 of `docs/CUSTOMER-WEBSITE-ARCHITECTURE.md`)

The architecture explicitly states (line 35): `**Customer notifications / support conversations** | NOT CURRENTLY IMPLEMENTED`

Also confirmed in the Gap Analysis table (line 708-709):
| Customer notifications | No (admin-user targeted) | No | Recipient mismatch/bug | Customer notification channel | High |
| Support conversations | No (admin-to-admin) | No | — | Conversation/Message threads | High |

**Date:** 2026-08-18
**Status:** ANALYSIS COMPLETE - NO IMPLEMENTATION PERFORMED
**Verification baseline:** yarn build PASS, yarn run test:typecheck PASS, yarn test 8 files passed 143/143 tests passed
��
