# Felicity Event Management System

## Technology Stack and Justifications

### Backend (Node.js + Express)
| Library | Justification |
| :--- | :--- |
| **Express.js** | Minimalist web framework for building the REST API with middleware-based routing and error handling. |
| **Mongoose** | Schema-based MongoDB ODM for data validation, type casting, and cross-collection references via populate. |
| **Socket.IO** | Enables real-time bidirectional communication for the discussion forum, with room-based isolation per event. |
| **BcryptJS** | Hashes passwords with a configurable salt factor, preventing plaintext storage and rainbow table attacks. |
| **JWT** | Stateless token-based authentication that works naturally with the React SPA frontend. |
| **Nodemailer** | Sends ticket confirmation emails with embedded QR codes via Gmail SMTP. |
| **Multer** | Handles multipart file uploads (payment proofs, form attachments) within Express's middleware chain. |
| **Cloudinary + multer-storage-cloudinary** | Cloud-based file storage so uploaded images persist across deployments without relying on local disk. |
| **QRCode** | Generates base64-encoded QR codes containing ticket data for display and email embedding. |
| **UUID** | Creates unique ticket IDs in the format `FEL-XXXXXXXX` without needing database sequences. |
| **Dotenv** | Loads sensitive config (DB URI, API keys, secrets) from `.env` to keep credentials out of source code. |
| **CORS** | Allows the frontend (port 5173) to communicate with the backend (port 5000) during development. |

### Frontend (React + Vite)
| Library | Justification |
| :--- | :--- |
| **React** | Component-based UI library for building the role-based dashboards, forms, modals, and real-time views. |
| **React Router DOM** | Client-side routing for the SPA with protected routes based on user role (admin/organizer/participant). |
| **Axios** | HTTP client with interceptors for automatic JWT attachment on every API request. |
| **Socket.IO Client** | Pairs with the backend Socket.IO server for real-time forum message delivery and typing indicators. |
| **HTML5-QRCode** | Provides both live camera scanning and image file scanning in one library for the attendance tracker. |
| **Vite** | Fast dev server with HMR and built-in reverse proxy to the backend, replacing the slower Create React App. |
| **Custom CSS** | A single `index.css` with CSS variables for theming — keeps the bundle small and avoids the overhead of UI frameworks like Material UI. |

## Advanced Features

### Tier A: High-Complexity Workflows

**2. Merchandise Payment Approval Workflow**

* **Justification:** Merchandise sales are central to real-world event management and require verified payments before fulfillment. This feature exercises a complex multi-step workflow spanning file uploads, cloud storage, state management, and email integration.

* **Design Choices & Implementation:** Orders follow a two-phase flow — participants place an order (status: `pending_approval`) and then upload a payment proof image, which is streamed to Cloudinary via `multer-storage-cloudinary`. Organizers see a table of all orders with proof links and can approve or reject each one. On approval, stock is decremented (after a fresh read of the Event document to avoid stale data), a ticket ID (`FEL-XXXXXXXX`) is generated, a QR code is created via the `qrcode` library, and a confirmation email with the QR embedded inline is sent via Nodemailer. Rejected orders can re-upload new proof without creating a new registration.

* **Technical Decisions:** Stock is only decremented at approval time, not at order time — this avoids phantom stock loss from rejected or abandoned orders and eliminates the need for rollback logic. QR codes are embedded in emails as inline CID attachments so they render in email clients without needing a publicly hosted image URL. The registration tracks `status` and `paymentStatus` as separate fields so the payment lifecycle can be retried independently of the registration itself.

**3. QR Scanner & Attendance Tracking**

* **Justification:** Solves the physical event check-in problem. Integrating device camera access, real-time QR decoding, and server-validated attendance in a web app — with no native app needed — was a practical and technically interesting challenge.

* **Design Choices & Implementation:** The attendance tab offers three input methods: live camera scanning (via `html5-qrcode` using WebRTC with rear camera), image file upload for printed QR codes, and manual ticket ID entry. On scan, the server validates event ownership, checks that the event has started, looks up the registration by ticket ID, and marks attendance with a timestamp. Duplicate scans are rejected with a message showing who was already marked and when. A live dashboard displays total registered, present, absent, and attendance rate, along with a full attendance record table. CSV export is also available.

* **Technical Decisions:** `html5-qrcode` was chosen because it provides both live camera and file-based scanning in a single library, unlike alternatives like `jsQR` (requires manual frame capture) or `zxing-js` (larger bundle). Duplicate rejection is enforced server-side rather than client-side so it works correctly even when multiple organizer devices scan simultaneously. A temporal guard prevents attendance marking before the event's start date to avoid accidental scans during setup.

### Tier B: Real-Time and Communication

**1. Real-Time Discussion Forum**

* **Justification:** Enables pre-event community building and participant-organizer interaction. Chosen because it required WebSocket integration (Socket.IO) — a fundamentally different communication model from the REST API — plus moderation and permissions layered on top of real-time messaging.

* **Design Choices & Implementation:** Uses a hybrid REST + WebSocket architecture — messages are persisted via a REST endpoint first (guaranteeing durability), then broadcast to the event's Socket.IO room (`forum-{eventId}`) for instant delivery. Participants must be registered to post; organizers can post announcements (pinned to top), pin messages, and soft-delete inappropriate ones (content replaced with "[Message deleted by moderator]" to preserve thread structure). Threading is implemented via a `parentMessage` reference on each reply. Typing indicators and emoji reactions (toggle-based) are also supported. Notification badges use timestamp comparisons between `lastForumActivity`/`lastAnnouncementAt` fields on the Event model and `localStorage`-stored "last viewed" times.

* **Technical Decisions:** Socket.IO was chosen over polling (wasteful) and SSE (unidirectional) because the forum needs bidirectional communication for both receiving messages and sending typing indicators. The REST-first persistence approach ensures no messages are lost if a WebSocket connection drops mid-send. Soft delete was preferred over hard delete to maintain thread integrity — replies to a deleted message still make sense when the parent shows a "[deleted]" placeholder.

**2. Organizer Password Reset Workflow**

* **Justification:** Since organizer accounts are admin-provisioned (not self-registered), a self-service email reset would be inappropriate. An admin-mediated flow adds accountability and lets the admin detect suspicious reset patterns.

* **Design Choices & Implementation:** Organizers submit a reset request with a reason from their Profile page. The admin sees all pending requests with organizer details and reasons, and can approve or reject with an optional comment. On approval, the system generates a random 12-character password using `crypto.randomBytes`, hashes it with bcrypt, updates the User document, and displays the plaintext password once in the admin UI for manual sharing. Only one pending request per organizer is allowed. Organizers can also view their request history with status badges and admin comments.

* **Technical Decisions:** `crypto.randomBytes` was used for password generation because it draws from the OS-level CSPRNG, producing cryptographically secure values. Hex encoding avoids special characters that could cause issues when shared verbally. The single-pending-request constraint prevents an organizer from flooding the admin with requests — one request, one decision.

### Tier C: Post-Event Features

**1. Anonymous Feedback System**

* **Justification:** Completes the event lifecycle — after attendance, participants provide feedback. Enforcing anonymity while still preventing duplicate submissions was an interesting design challenge.

* **Design Choices & Implementation:** Participants submit a 1–5 star rating with an optional text comment. Anonymity is enforced at the API layer: the `participant` ID is stored in the database (needed for deduplication via a unique compound index on `{event, participant}`), but the GET endpoint never populates it, so organizers only see ratings, comments, and dates — no author info. Deduplication is enforced at three levels: client-side state, a server-side query check, and the database unique index. Organizers see aggregate stats, a color-coded rating distribution chart, filter/sort controls, and can export feedback as CSV (with no identity information).

* **Technical Decisions:** API-layer anonymity was chosen over database-level anonymity because storing the participant reference enables deduplication and authorization checks ("did this user attend?") without exposing identity to the organizer. Server-side filtering (`?rating=N`) was preferred over client-side filtering to reduce data transfer for events with large feedback volumes. The unique compound index acts as a final safety net against race conditions that could bypass the application-level duplicate check.

## Setup and Installation

### Prerequisites
* Node.js (v18+)
* MongoDB (Atlas or local)
* Cloudinary account
* Gmail account with App Password

### Backend Setup
1. Navigate to the backend folder: `cd codebase/backend`
2. Install dependencies: `npm install`
3. Create a `.env` file with:
   * `PORT`, `MONGODB_URI`, `JWT_SECRET`
   * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   * `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
4. Seed the database (optional): `npm run seed`
5. Start the server: `npm run dev`

### Frontend Setup
1. Navigate to the frontend folder: `cd codebase/frontend`
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. The app runs on `http://localhost:5173` with API requests proxied to the backend.

### Default Credentials
After seeding, log in as admin with `admin@felicity.iiit.ac.in` / `admin123`. Organizer and participant accounts can be created via the registration page or admin panel.
