# Clone a record

Date: 2026-11-16

## Purpose

A person who has an existing record, such as a closed permit, can start a new one from it. The create form opens already filled. They change what they need, then save. Save creates a new Draft. The source record stays as it was.

This is a runtime feature for every entity type. It does not add a permit-only path or a new server endpoint.

## What the user does

1. Open a record.
2. Click **Clone** in the record header, beside Audit Log. The button is available for any status, including Closed and Expired.
3. The create form for that entity type opens with the source field values filled in.
4. Change any values, including the title and the validity dates.
5. Save. The app creates a new record in the workflow’s first state (Draft for a permit) and opens that record.

The source record’s id, status, audit history, and tasks are not changed.

## What is copied

Copy every custom field value from the source record:

- Text, dates, times, lists, and dropdowns
- Equipment and other components
- The selected safety plan id
- Gas test, chemist, and result
- Declaration text and acceptance
- Isolation, LOTO, zero-potential, and toolbox file references
- Extension and acceptance notes

Do not copy the record id, status, workflow stage, workflow version, events, tasks, or keys that start with `_`. Do not copy `subprocess_child_id`.

Form values use the same text the create form already edits:

- Booleans become `yes` or `no`.
- A list of strings, such as nature of work, becomes a comma-separated string.
- Equipment, component lists, and file lists stay JSON.

Empty values stay empty. The title is copied unchanged.

## What the review form shows

A blank create form hides sections whose rule depends on `_workflow_status`. Declaration, approval, extension, and acceptance are examples. During clone review those status rules are ignored, so those sections are visible and can be edited. Their values are included when the user saves.

Rules that depend on another field still apply. Gas-test details stay hidden unless gas test is Yes. Isolation evidence stays hidden unless isolation is required. A hidden field is not saved.

After save, the new record is Draft and the normal section rules apply again. Values saved from the review form remain on the record.

## Save

Use the existing create API. There is no clone API.

If the saved fields include a safety plan id, apply that plan to the new record once, using the site and the equipment selected on the form. The hazard and precaution rows then exist on the new record. If applying the plan fails, still open the new record and show the error. The record has already been created.

If the copied Valid to is already in the past, the existing expire escalation can move the new Draft to Expired after it is saved. The form does not change the date. The user changes it before saving when they want the new record to stay open.

## When the source cannot be loaded

The create form still opens. It shows that the source record could not be loaded, and the fields stay blank. The user can fill them in and save a normal new record.

## Out of scope

- A Clone action on the records list
- A new backend endpoint
- Copying audit events, tasks, or status
- Changing the title automatically
- Role checks, permit numbers, signatures, or print layout

## Test

1. Open the closed permit “String monitoring on Inverter 1”.
2. Click Clone. Confirm the job fields, equipment, permit type, nature of work, and gas test are filled. Confirm Declaration is visible even though the new record has not been saved.
3. Change the title and set Valid to in the future. Save.
4. Confirm the new record is Draft, the changed title is stored, and the safety plan’s hazards are on it.
5. Confirm the original permit is still Closed.
