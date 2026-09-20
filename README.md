# Rimrock Rooms

**Original product concept, operating design, and project owner: Ryan Kelly**  
Everhome Suites Denver Airport (CO534)  
Created September 2026

Rimrock Rooms is a fast hotel operations WebUI conceived by Ryan Kelly for housekeeping, room inspections, maintenance, preventive maintenance, and property operations.

## Project principles

- Fast on top.
- Simple for the user.
- Reportable underneath.
- Build only what materially improves hotel operations.

## Section 1 — WebUI Shell

Locked scope:
- Responsive desktop/mobile shell
- Everhome Suites Denver Airport (CO534)
- Role-ready navigation
- Initial Property, User, and Room data structures
- Operational modules intentionally remain placeholders

No Bedrock dependencies. Build and performance are kept deliberately small.

## Attribution

The Rimrock Rooms concept, workflows, operating model, and design direction originated with **Ryan Kelly**. Project source files should retain this attribution as the application evolves.


## Section 1 Lock — 2026-09-18

**Status: APPROVED & LOCKED**

Accepted by Ryan Kelly after live desktop and iPhone testing.

Section 1 baseline includes:
- Live GitHub Pages WebUI
- Responsive desktop and mobile shell
- CO534 property identity and 114-room master inventory
- Ryan Kelly Manager / Inspector role recognition
- Role-based navigation foundation
- Mobile Home / More navigation
- Performance-first static architecture

Future sections must build into this shell without redesigning or bloating the Section 1 foundation.


## Section 2 — Step 2 Acceptance — 2026-09-18

**Choice PDF Preview: PASSED**

Live parser acceptance test:
- Business Date: 9/18/2026
- Property: CO534
- Unique Rooms: 114
- Housekeepers: 1
- Detra Pleasant correctly identified
- Room 122 correctly assigned
- Preview remains read-only; no import occurs at Step 2

Approved test basis: CO534 Housekeeping Room Assignment report supplied by Ryan Kelly.


## Section 2 — Step 3 Acceptance — 2026-09-18

**Choice Import Validation: PASSED & LOCKED**

Live validation confirmed:
- Property CO534 matched
- Business date valid
- 114 extracted rooms matched the room master
- No duplicate extracted room rows
- No duplicate housekeeper assignments
- Detra Pleasant matched as an active CO534 housekeeper
- Import remained disabled when an employee was unresolved and enabled only after all checks passed

Step 4 import was not executed during Step 3 acceptance.


## RELAY Authentication V1 — Locked Architecture

RELAY uses five permission classes: ADMIN, INSPECTOR, FRONT DESK, HOUSEKEEPER, MAINTENANCE.

Production authentication must be server-side. Browser code must never download password hashes, salts, or other users' credentials.

Backend auth store schema:
- USERS: user_id, property_id, name, username, role, password_hash, password_salt, active, created_at, updated_at
- AUTH_SESSIONS: session_id, user_id, property_id, role, created_at, expires_at, revoked, last_seen_at

Required backend actions:
1. authLogin(username, password) -> validates a salted password hash and returns a session token plus the authenticated user's safe profile.
2. authSession(sessionToken) -> validates an unexpired, non-revoked session and returns the safe profile.
3. authLogout(sessionToken) -> revokes the session.
4. adminListUsers(sessionToken) -> ADMIN only; never returns password_hash/password_salt.
5. adminCreateUser(sessionToken, user fields, temporary password) -> ADMIN only; hashes server-side.
6. adminUpdateUser(sessionToken, user fields) -> ADMIN only.
7. adminResetPassword(sessionToken, userId, temporary password) -> ADMIN only; hashes server-side.
8. adminDeactivateUser(sessionToken, userId) -> ADMIN only; preserves historical attribution.

Legacy ?user= authentication is disabled. GitHub users.json is temporary development data only and must be removed from the production authentication path once backend auth is live.
