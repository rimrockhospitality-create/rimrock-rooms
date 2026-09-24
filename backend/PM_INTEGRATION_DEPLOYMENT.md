# Flexible PM room selection — September 24, 2026

## This update

Deploy the updated private `RELAY_CO534_PM_INTEGRATION.txt` as a new version of the existing Apps Script web app. Its health version is `PM-PICKER-20260924`. Then release the coordinated frontend branch. The saved rotation is already initialized: **do not restart or rebuild it**.

The new default CHOOSE ROOM tab exposes all 114 rooms, room-number search, vacant/due/in-progress filters, last PM, next deadline and imported Choice status/date. Active work comes first, then vacant due rooms, other vacant rooms, other due rooms and remaining rooms. Completed-today rooms are disabled. VAC/OCC hints reflect the latest eligible ROOM_STATE import; an older import is labeled and excluded from the current-day vacant filter. Staff confirm access before entry. Availability does not change deadlines or block early work.

Date-only spreadsheet cells now use the spreadsheet timezone, while actual event timestamps retain hotel timezone semantics. No stored schedule dates are rewritten. Early completion keeps the established completion business date + 84 days rule.

Backend and actual-frontend DOM tests pass for date boundaries, imported availability and stale/missing rooms, 114-room selection, filtering/search, calendar retention, future-due completion and existing session/repair/report behavior. Physical device acceptance is pending deployment.

---

# Room PM and Maintenance integration — September 24, 2026

Prepared from Ryan Kelly's supplied backend and frontend main commit b845cf0.

## Deploy in order

1. Copy all of the privately delivered `RELAY_CO534_PM_INTEGRATION.txt` into the existing Apps Script backend, replacing its current main code. This is a full replacement, not an additional script alongside the old functions. Keep the current spreadsheet and deployment URL.
2. Save and update the existing web-app deployment to a new version. The health response identifies `PM-PICKER-20260924`.
3. Merge the coordinated frontend branch and allow GitHub Pages to publish. Avoid using PM between steps 2 and 3: the new completion endpoint requires a server PM session.
4. In Ryan's account, open Preventive Maintenance and select **START ROOM ROTATION** once. It creates the saved 114-room schedule over 84 days, starting on the current RELAY business date. Existing completed rooms use their last recorded completion plus 84 days. Running this again does not reset the calendar or history.
5. In Bradley's account, open Maintenance → **OPEN PM SCHEDULE**. Select a due room, scan its QR, complete checklist answers, enter a work-order note and priority where needed, pause, refresh/reopen, resume, then complete once.
6. Confirm one PM completion, one linked maintenance ticket per work-order item, next due date, technician, active time, maintenance checklist submission and report totals. Resolve the linked repair through the existing Maintenance flow and confirm its completion appears in the report. Physical camera and production Apps Script validation remain pending.

## Behavior

- Real calendar, due/overdue rooms and history replace sample rows and counts. Existing 12-week design and 19 checklist items are retained.
- PM start verifies the room QR on the server; session IDs, ownership, answers, pause time and real timestamps persist in `PM_SESSIONS`.
- A technician can have one running PM at a time. Paused sessions can be recovered; other technicians cannot take over someone else's session.
- Completion requires all 19 valid statuses, plus notes and priority for work-order items. Stable IDs make retries idempotent. A partially finalized completion is frozen and can be retried.
- Work orders link `PM_ITEMS` to `MAINTENANCE`, retain blocking priority, and use the existing repair resolution/photo workflow. A room PM completion does not certify unresolved repairs as fixed.
- Next due is completion business date + 84 days. Schedule setup and completion history are never erased.
- Daily and current-business-day manager reporting read open, opened and resolved maintenance, PM completions and recorded work time. The daily report includes the maintenance checklist submission. The existing manager report is still based on the current business day; this change does not turn it into a seven-day aggregation.
- Room PM is implemented here. The old nonfunctional Property PM tab is removed; recurring equipment/building PM is not implemented by this change.
- Existing camera scanner, housekeeping/inspection QR flows, login code, cleaning records and maintenance completion-photo handler are preserved.

## Source module

The public repository contains `RELAY_PM_INTEGRATION_PATCH.gs`, which has no production database/folder IDs. The privately delivered full replacement includes this module, removes the old `savePmCompletion_`, adds routes for `getPmBoard`, `initializePmSchedule`, `startPm`, `updatePmSession`, and `getMaintenanceReport`, and updates the health version. Use the full replacement for deployment; do not append duplicate completion functions.

## Data additions

New sheets: `PM_SCHEDULE`, `PM_SESSIONS`. Both are created only when first needed. Existing `PM_COMPLETIONS` gains `active_minutes`; `PM_ITEMS` gains `maintenance_id` and `note`. Historical rows remain unchanged and display “Time not recorded” when no duration exists.

## Verification

`npm install` then `npm test` runs the backend and DOM integration checks without making production requests. `npm run test:backend` has no third-party dependencies.

Verified: 114-room rotation; invalid QR rejection; duplicate-start recovery; session ownership; pause/resume; complete-checklist validation; interrupted-write retry without duplicate tickets; blocking work-order creation; next-due date; selected dropdown values; persisted repair notes; completion history and daily-report totals.

A full browser render could not run in the preparation environment because Chromium was unavailable. DOM tests executed the actual frontend scripts against the mocked spreadsheet backend. A physical phone test is still required after deployment.

## Recovery

Retain the previous Apps Script deployment version and frontend commit b845cf0. If rollback is needed, revert both frontend and backend together. Keep the additive PM sheets and history; do not delete operational data.
