# Container Survey VLM — Product Requirements Document (PRD)

**Document version:** 1.0 — Draft for review  
**Date:** 09 October 2026  
**Product / repository:** `ongkokl/Container-Survey-VLM`  
**Primary users:** Container depot surveyors, survey supervisors, CEDEX/IICL master-data administrators, QA personnel  
**Implementation:** Mobile-first Cloudflare Workers application, D1, R2 and Workers AI  
**Document purpose:** Define the complete end-to-end survey workflow and the target requirements for moving from the current vision-language-model proof of concept (POC) toward a controlled operational survey application.

> **Non-negotiable principle:** AI assists a trained surveyor; AI output is never treated as a final damage assessment, a guaranteed measurement, an IICL acceptance decision or an authorised repair order without the appropriate human review. Original predictions, evidence and final human decisions must remain traceable.

## 1. Product summary

Container Survey VLM is a mobile-first application for identifying depot containers, capturing condition evidence, finding visible defects, proposing CEDEX component/damage/location codes, evaluating measurements and recommending allowable repair methods using verified references. The surveyor corrects or accepts the recommendations and completes a documented survey suitable for review and downstream depot workflows.

**Primary operating principle:**

`Gate cycle → container identity → camera/face coverage → overview → damage findings → CEDEX classification → measurement and repair disposition → surveyor confirmation → QA/completion → output and learning`

The software must support **one survey per depot gate cycle with zero, one or multiple findings**. A finding describes one distinct damage/condition at a defined physical location and may link to several photos. A single photo may show multiple findings. Old gate-cycle surveys must never be overwritten by a new visit for the same container number.

### 1.1 Business problems

- Surveyors manually identify containers, locate and categorise damage, refer to CEDEX/IICL material and capture evidence in several steps.
- Inconsistent code selections and approximate damage locations increase rework and QA disputes.
- Multiple defects on one face can be overlooked when an AI workflow returns only a single prominent defect.
- An attractive AI prediction can be mistaken for verified IICL acceptance or a mandatory repair method.
- Confirmed surveyor corrections are often unavailable for systematic evaluation and future model improvement.

### 1.2 Desired outcomes

- Reduce repetitive entry and taps without removing required human judgement.
- Produce consistent and auditable CEDEX records, photos and measurement evidence.
- Detect multiple distinct visible defects, allowing surveyors to add missed defects manually.
- Provide evidence-grounded repair suggestions while avoiding invented rules or false precision.
- Retain a high-quality correction dataset for QA, retrieval and potential specialist CNN/model training.

## 2. Scope, releases and implementation status

This document defines the **target product**, not a claim that all requirements are deployed. Statuses below reflect a source-code review of the repository's main branch on 09 October 2026, not a live production UAT.

| Capability | Current repository baseline | Target release |
|---|---|---|
| Container door photo, OCR, ISO 6346 validation and manual correction | Implemented in POC | R1 harden |
| Container asset vs repeat gate-cycle and survey record | Implemented in data model | R1 retain |
| Fixed R/L/D/F/T/B camera profiles; face/orientation and calibration | Implemented POC paths | R1 harden |
| Zero-touch overview analysis | Implemented for **one primary damage**, GP side/front scope | R1 retain; R2 multi-damage |
| Manual overview location area/point and close-up pinpoint | Implemented POC paths | R1 retain/improve |
| Face-scoped IICL component catalogue, CEDEX rule validation | Implemented POC paths | R1 harden |
| Damage classification with surveyor decision | Implemented POC paths, with limited validated classifications | R1 expand QA |
| Image-assisted length/width; surveyor depth and direction | Implemented POC paths | R1 calibration/uncertainty |
| Measurement/history/rule-backed repair suggestion | GP/PAA/DT reasoning path; rules-only outside validated scope | R1 retain; R2 expand |
| Multi-damage detection from one overview | Not shown as complete in reviewed zero-touch orchestrator | R2 |
| Complete survey/face coverage, no-damage, final report and approval workflow | Target requirements; not established as fully implemented | R2 |
| Role-based access, production-grade security and tenant boundaries | POC intentionally has no login | R2 production |
| CNN model prioritisation, advanced RF/interior inspection, integrations | Future roadmap | R3 |

**Release definitions**
- **R1 — Controlled POC hardening:** maintain the existing mobile single-finding and single-overview experience, standardise corrections, make errors and measurements defensible, and benchmark real-world performance.
- **R2 — Depot survey MVP:** multiple findings per photo/survey, end-to-end survey completion, searchable review/reporting, user roles, QA and production controls.
- **R3 — Expansion:** broader GP/RF inspection views, richer repair rules, approved integration/export formats, specialised models and offline capability if feasible.

## 3. Users and permissions

| Role | Key tasks | Permissions / safeguards |
|---|---|---|
| Surveyor | Identify container, inspect assigned faces, add/edit findings, enter measurements, decide codes, submit survey | Cannot silently change approved surveys; corrections attributed to user |
| Senior surveyor / QA reviewer | Review uncertain/high-risk findings; return for correction; approve surveys | Can approve/return with reason; decisions auditable |
| Depot supervisor | Review work queues, coverage, outstanding surveys, exceptions | Can assign/close operational tasks within policy |
| CEDEX/IICL administrator | Maintain versioned code masters, face eligibility, visual rules and camera calibration | Changes require permissions, validation and audit |
| System administrator | Manage users, depot configuration, quotas, retention and deployment health | No automatic authority to falsify survey findings |
| Integration service (future) | Consume approved data and receive change events | Service authentication, idempotency and least privilege |

**POC constraint:** The existing unauthenticated testing flow may remain available in a separate non-production environment; it must not be used as the authorisation model for operational survey data.

## 4. End-to-end operational workflow

### Stage 0 — Start / resume survey

1. Surveyor selects depot/work area (or receives it from an authorised integration).
2. System accepts a gate transaction/booking/reference when available, without making it mandatory for a POC.
3. Surveyor scans or enters the container number, or uses door-photo identification.
4. System checks for an active gate cycle and resumes the existing survey rather than creating a duplicate.
5. The application displays a single prominent **Continue survey** action.

**Exception:** If a prior survey is completed, the same container may start a new survey only under a new gate cycle; historical records remain intact.

### Stage 1 — Container identification

1. Take or upload a door photo; offer manual entry and, in test environments only, a default GP test container.
2. OCR proposes ISO 6346 container number and the 4-character ISO size/type code.
3. Application independently validates the ISO 6346 check digit; it must not trust the VLM's assertion of validity.
4. Application maps ISO size/type through the D1 reference table to GP/RF, length and height.
5. Surveyor confirms or corrects OCR fields. Wrong/unknown codes block ordinary confirmation; any exceptional override requires an authorised reason and audit record.
6. Store original image, OCR attempt, corrections and confirmed identity separately.

### Stage 2 — Inspection coverage and camera profile

1. Display required/optional inspection faces configured for the survey type: **R** right, **L** left, **D** door, **F** front, **T** roof, **B** floor/underside.
2. Select the corresponding fixed-camera profile. Use the known face/orientation from the profile, without burdening the surveyor with repeated face dropdowns.
3. Provide a camera guide overlay and capture-quality advice (full face in frame, appropriate distance, lighting and obstruction warnings).
4. Use profile-specific geometry calibrated by authorised staff for equipment length/height/type and camera position.
5. For door/front, support calibrated internal structural boundaries in addition to four corners.
6. Mark each inspected face as **Inspected: damage recorded**, **Inspected: no visible damage**, **Not inspected / inaccessible**, or **Pending**. Face completion must be explicit; an absence of AI detections does not imply a completed inspection.

**Safety:** Roof/underbody imaging must not require unsafe access; record not inspected and reason where safe equipment or access is unavailable.

### Stage 3 — Overview capture and zero-touch finding

1. Surveyor captures or selects an overview, with R2 evidence saved and linked to the survey and face.
2. **Default action:** invoke one consolidated zero-touch analysis pipeline. Do not also trigger a separate `local-overview-damage` call automatically for the same uploaded image.
3. The AI identifies candidate damage regions with thin, accurate overlays and suggests component/damage/location when supported.
4. A no-reliable-damage result is **Not detected**, not **No damage confirmed**; surveyor still inspects the face.
5. Surveyor may adjust a box, pinpoint a local defect, dismiss a false positive or add a missed finding.
6. On supported faces, process a photo once for shared contextual analysis and create independent finding records for each accepted region.

**R1:** Existing unified service may propose a single primary region.  
**R2:** Propose **multiple** distinct regions in one image, each independently editable. Provide duplicate suppression but allow the surveyor to split combined damages or keep distinct nearby defects.

### Stage 4 — Finding evidence and classification

For each finding:

1. Reuse its overview image and corresponding region/point; do not force another full overview upload.
2. Allow an optional or required close-up based on type, severity, confidence and QA rules; camera/gallery choices remain available.
3. The close-up crosshair targets the **exact component**; a damage-area box marks extent. Keep these separate from the overview location annotation.
4. Offer the complete set of applicable **face-filtered** component candidates, not unrelated roof/floor/door codes.
5. AI produces ranked component candidates and ranked damage candidates, explanations and confidence; rule engine validates admissibility.
6. Surveyor accepts/corrects component, damage and location with minimal repeated dropdown selection.
7. Preserve model prediction, top-N candidates, final selection, correction reason and timestamp.
8. Distinguish material cut (`CU`), corrosion (`CO`), improper repair (`IR`), dent (`DT`) and other codes through evidence-specific visual rules; uncertain or context-dependent codes require review.

### Stage 5 — CEDEX location

1. Derive face/orientation from the selected fixed-camera profile (unless corrected through an authorised exception).
2. Map the damage box/point to the face's physical coordinate system using calibrated boundaries and container geometry.
3. Compute a valid four-character CEDEX location code under the configured standard/reference; do not simply use percentage-based zones where a calibrated physical boundary exists.
4. Show the suggested code on the overview with the visible affected region.
5. If a region spans boundaries, require a documented choice of the primary location or an additional finding as defined by the depot coding policy; do not silently pick an arbitrary cell.
6. Calibration absent, mismatch, low confidence or obstructed face → manual location decision and review flag.

### Stage 6 — Measurements and condition assessment

1. Capture damage length and width in **centimetres**, depth in **centimetres or millimetres with unit conversion**, and affected corrugation count where applicable.
2. Record **measurement source** (surveyor/physical tool, image-derived/model, device) and measurement quality.
3. Overview-calibrated planar estimates may propose length/width but must display uncertainty and never be presented as verified physical dimensions without adequate calibration/reference.
4. An optical-zoom close-up may refine visible extent, but ordinary monocular images **must not claim to measure dent depth reliably**. Depth and inward/outward direction are surveyor-entered or obtained from an approved measurement device.
5. For dents, record **INWARD / OUTWARD / UNKNOWN** and reference the appropriate criterion only when its version, scope and units are verified.
6. Distinguish: **within a mapped dimensional criterion**, **exceeds criterion**, and **criterion unavailable / other conditions need review**. A single dimensional check is not a final IICL accept/reject decision.
7. Allow notes, previous repair evidence and additional images where needed.

### Stage 7 — Repair disposition and recommendation

1. Separate **condition disposition** (no repair required under approved criteria / repair required / further inspection / hold) from the **CEDEX repair method**.
2. Filter potential repair codes using the approved, versioned equipment + component + damage applicability master (currently GP.xlsx for the POC rules).
3. For **GP/PAA/DT**, use confirmed measurements, mapped and verified IICL information and comparable approved historical cases for evidence-grounded Qwen suggestions.
4. For all other component/damage combinations outside the validated reasoning scope, present the allowed repair methods for **manual surveyor selection**; do not fabricate a Qwen reasoned recommendation.
5. AI may abstain or return insufficient evidence. Never substitute a guessed code; present reason and next required action.
6. If historical cases conflict with approved rules, approved rules prevail. Historical examples inform reasoning, not standards.
7. Store proposed code(s), rule sources, measured inputs, final code, decision-maker and rationale.
8. No automatically generated repair recommendation may initiate repair work or declare a container safe/acceptable without the relevant organisational approval.

### Stage 8 — Findings review and survey completion

1. Present a summary list grouped by container face, with thumbnail, finding number, location, component, damage, measurements, repair disposition and approval status.
2. Permit **Add finding**, **Edit**, **Duplicate/split**, **Remove false positive**, and **Mark face inspected / no damage** with audit-tracked revisions.
3. Highlight incomplete fields, invalid CEDEX combinations, inconsistent photos, out-of-scope AI results and unresolved safety/QA flags.
4. Supervisor review is mandatory for configurable risk cases, including critical structural/material-break indications, invalid/overridden identity, unverified location and conflicting measurements.
5. A survey with zero findings is valid only if required face coverage has been explicitly completed with **No visible damage** or approved exceptions.
6. Once all required checks pass, surveyor submits; QA approves/returns or authorised workflow auto-closes only low-risk fully confirmed surveys according to policy (never solely because of model confidence).
7. Complete survey is immutable for ordinary users; post-completion amendment creates a new version with reason and audit trail.

### Stage 9 — Report and downstream records

1. Produce an exportable survey report (PDF planned) and structured output (JSON/CSV; operator-specific EDI mapping later).
2. Include container and gate-cycle identity, date/depot, faces inspected or inaccessible, photo evidence, each approved finding with all CEDEX fields, measured values, disposition, sign-off and source/version information.
3. Distinguish **draft**, **submitted**, **approved**, **returned**, **amended** and **cancelled** report status.
4. Support searchable survey history, duplicate prevention and authorised re-export without modifying survey results.

## 5. Functional requirements and acceptance criteria

The following requirement IDs should become the development/backlog reference.

| ID | Priority | Requirement | Acceptance condition |
|---|---|---|---|
| FR-001 | P0 | Create/resume survey by gate cycle | Repeated scan returns active cycle; later visit uses a new cycle |
| FR-002 | P0 | Door OCR and manual identity review | Check digit independently validated; original OCR retained |
| FR-003 | P0 | Decode ISO size/type | GP/RF length/height from versioned master, unknown code flagged |
| FR-004 | P0 | Support safe test identity bypass only in non-production | Test container cannot contaminate operational survey history |
| FR-005 | P0 | Six external camera profiles | R/L/D/F/T/B face/angle mapping reproducible |
| FR-006 | P0 | Fixed camera calibration by geometry | Versioned four-corner, boundary and equipment profile; edit logged |
| FR-007 | P0 | Camera quality checks and gallery upload | Handles denied camera, blur/occlusion/retake and gallery images |
| FR-008 | P0 | One zero-touch default analysis | No redundant auto invocation for same overview |
| FR-009 | P0 | Visible, adjustable damage overlay | Displayed region and stored coordinates match at different screen sizes |
| FR-010 | P0 | Manual marking fallback | Surveyor can create/correct finding when AI fails |
| FR-011 | P0 | Face-scoped component candidates | Wrong-face candidates excluded; full master remains intact |
| FR-012 | P0 | CEDEX damage code validation | Invalid or unsupported selections rejected or reviewed |
| FR-013 | P0 | Deterministic location mapping | Calibrated mapping, four-character code and orientation handled |
| FR-014 | P0 | Surveyor acceptance/correction | AI and human values never overwrite one another |
| FR-015 | P0 | Physical measurements and provenance | Length/width/depth sources and units explicit |
| FR-016 | P0 | Restricted repair recommendation | GP/PAA/DT reasoning only until expanded validation; otherwise rules/manual |
| FR-017 | P0 | Abstain/review states | AI uncertainty does not block manual workflow or fabricate a code |
| FR-018 | P0 | Store photo and prediction audit | Evidence, timestamps, model/prompt and decisions recoverable |
| FR-019 | P0 | Idempotent API persistence | Retry must not produce duplicated gate cycles or findings |
| FR-020 | P0 | Efficient mobile interaction | No jumpy scroll, large controls, persistent context and clear save status |
| FR-021 | P1 | Detect multiple findings from one overview | Separate candidate boxes and records; add/split/merge/dismiss controls |
| FR-022 | P1 | Zero-finding inspection record | No-damage status requires active surveyor face confirmation |
| FR-023 | P1 | Face coverage checklist | Required/inaccessible/complete states validated at submission |
| FR-024 | P1 | Multi-photo per finding | Overviews reused; close-ups linked to correct finding |
| FR-025 | P1 | Finding review screen | All CEDEX codes, disposition, measurements and evidence editable |
| FR-026 | P1 | Survey status lifecycle | Draft/submitted/returned/approved/amended appropriately enforced |
| FR-027 | P1 | Supervisor QA workflow | Risk routing, rejection reason, audit and re-submission |
| FR-028 | P1 | PDF and structured export | Approved data produces traceable, readable document and data output |
| FR-029 | P1 | Identity, depot and user access control | Role checks at API and UI, operational data isolated |
| FR-030 | P1 | Code master/version management | GP/RF context, reference version, effective dates and uniqueness checked |
| FR-031 | P1 | Calibration administration and QA | Privileged edits; invalid/misaligned profile excluded from auto location |
| FR-032 | P1 | Accuracy/evaluation dashboards | Ground-truth based by code, face, model, equipment and confidence |
| FR-033 | P1 | Photo/evidence quality and retention | Secure access, configured retention and image integrity metadata |
| FR-034 | P1 | Risk classification and safety hold | High-risk signals prevent unattended auto-finalisation |
| FR-035 | P1 | Correction/learning review | Only QA-verified cases enter training-ready sets |
| FR-036 | P1 | Depot search and re-open policy | Search by container, gate cycle, date, status; amendments logged |
| FR-037 | P2 | RF-specific external/machinery pathways | Only when view-specific rules and benchmark support them |
| FR-038 | P2 | Interior inspection mode | Separate view tags and accessible component candidates |
| FR-039 | P2 | Specialised CNN-assisted pipeline | Compare to VLM; feature flag and safe fallback |
| FR-040 | P2 | Depot/terminal EIR or EDI integration | Approved schema/version, retries, reconciliation and traceability |
| FR-041 | P2 | Offline field capture | Local encrypted queue, synchronisation conflict handling, only after design |

**Priorities:** P0 = necessary for safe, usable controlled pilot; P1 = depot MVP; P2 = future expansion. Priority is a design recommendation, not an assertion of implementation.

## 6. Data definitions and standards

### 6.1 Authoritative data hierarchy

1. **Confirmed photographic/physical evidence and surveyor measurement**.
2. **Approved reference masters and applicable IICL criteria**, versioned with source/copyright/permission.
3. **Deterministic application calculations** (ISO check digit, location mapping, code applicability).
4. **Surveyor-confirmed prior cases** used as context, not as standards.
5. **VLM-generated suggestions**, never authoritative merely because confidence is high.

### 6.2 Core data entities

- `container`: long-lived physical asset, ISO 6346 number and latest informational metadata.
- `gate_cycle`: uniquely identifies each depot visit, preserves observed ISO size/type and relevant visit metadata.
- `survey`: inspection for a particular gate cycle, face coverage and workflow state.
- `finding`: distinct defect/condition, sequence, confidence/review state and final CEDEX fields.
- `photo`: R2 object and immutable capture metadata; shared overview or per-finding close-up.
- `annotation`: image-space point/box/polygon and coordinate version/transform.
- `calibration`: depot/camera/equipment profile, version, geometry and who approved it.
- `prediction`: model/prompt version, run ID, candidates/confidence, evidence and analysis status.
- `decision`: human field-by-field confirmation/correction, reason, attribution and time.
- `measurement`: values, units, method/source, uncertainty and instrument/inspection notes.
- `repair_disposition`: acceptance/repair/hold decision separate from CEDEX repair-code proposal.
- `review`: QA assignment, return/approval/amendment and history.
- `reference_master`: versioned GP/RF component, damage, repair, location and rule applicability.
- `training_candidate`: verified or rejected example with split and provenance.

### 6.3 Code master constraints

- The repository documents **66 GP** and **114 RF** IICL component master rows, **not** the same number of eligible camera candidates. These counts are a reviewed source baseline, not a promise that every component is classifier-ready.
- A code is scoped by **equipment + code + standard/version**: `GP/PAA = Panel Assembly`; `RF/PAA = Subfloor`. Never interpret a CEDEX component code without its equipment context.
- Only expose physically possible codes for the current inspection face/view while retaining the full approved master.
- Component, damage and repair code masters are separate; eligibility is validated as a relationship, not inferred from a free-form AI response.
- Do not silently replace a verified code definition when effective-date ties or duplicate active versions occur; require a master-data validation check.
- `IR` means **Improper Repair**, not a generic damage shortcut; do not confuse visible rust/corrosion with cut damage.
- Keep location code formatting, face mapping and operator-specific export layouts configurable and tested.

## 7. AI architecture and decision policies

### 7.1 Orchestration

The baseline uses `@cf/qwen/qwen3.8-27b` for door/visual interpretation and a unified GP overview path. Requirements must remain provider-agnostic so that specialist CV/CNN detectors or other VLMs can later be evaluated.

`Image + capture metadata + calibrated geometry → visual observation → constrained classification → deterministic code/rule validation → proposed finding → surveyor review → persisted decision`

**Do not** ask a model to invent every CEDEX field without deterministic validation.

### 7.2 Multi-damage target design

- Return up to a configurable maximum of candidate physical findings per overview with box/polygon, confidence, type hint and evidence.
- Distinguish genuinely separate cuts, dents, corrosion, improper repair and surface defects; avoid combining distinct defects because they share one panel.
- Merge repeated appearances of a **single continuous physical defect** only when spatial/content evidence supports it; make merge/split decisions reversible.
- Perform detection once per overview where possible, then crop/reference each region for targeted classification; use close-up images where ambiguity remains.
- Offer **Add missed finding** even when AI reports none; never let a detection cap hide surveyor work.
- Save stable finding IDs and avoid duplicate findings from retry/resume.
- Score at finding level; no universal confidence alone authorises confirmation.

### 7.3 Confidence, review and abstention

- Independent application-side thresholds override any AI self-reported `needs_review=false`.
- The current unified POC code uses 0.80 as a component/damage review threshold; it is a review heuristic, **not a calibrated real-world probability of correctness**.
- Force review for ambiguous, unsupported, safety-critical, conflicting or out-of-scope cases regardless of reported confidence.
- Possible analysis states: `SUGGESTED`, `REVIEW_REQUIRED`, `ABSTAINED`, `INCOMPLETE`, `INVALID_RESPONSE`, `ERROR`.
- When Workers AI is unavailable, use validated manual entry and a clear retry option; never replace unavailable output with fabricated predictions.
- Re-analysis retains earlier candidate history and must not silently overwrite surveyor edits.

### 7.4 Repair grounding

- Restrict AI suggestions to an explicit allow-list from the approved `GP.xlsx` (or later approved master), with version recorded.
- Require traceable evidence: measurements, verified criterion, master description or comparable human-confirmed cases.
- An IICL depth-limit exceedance is an **escalation signal**, not automatic evidence that one particular repair method is required.
- Missing dimension(s), unverifiable criterion, conflicting references or insufficient distinguishing evidence produce **manual selection / further inspection**, not an invented rule.
- Supervisor approval and repair-work authorisation are separate business decisions from AI recommendation.

## 8. UI/UX requirements

The design must be **mobile-first and field-friendly**, with high contrast, readable text and minimal taps.

1. **Single survey workspace:** persistent container number, equipment type, depot, survey progress and save status at top.
2. **Progressive disclosure:** show relevant fields only for the current step; advanced inspection/repair fields expand when needed.
3. **One review sheet per finding:** component, damage, location, measurements and repair disposition together, avoiding repeated multi-screen confirmation dialogs.
4. **Defaults and suggestions:** prefill confident valid codes, but visually distinguish *AI suggested* from *Surveyor confirmed*.
5. **Direct selection:** searchable, grouped code pickers with favourites/recent choices, code + description and context. Do not make users open cascading dropdowns for common codes.
6. **Camera actions:** large capture and gallery controls, retake, zoom/pan and simple photograph quality warnings.
7. **Annotation precision:** thin fine-crosshair target, clearly distinguished extent box; overlay coordinates must remain correct under zoom, crop, rotation, mirroring and responsive sizing.
8. **Multiple findings:** numbered overlay regions and a compact list; tapping a region selects only that finding.
9. **Context preservation:** do not scroll to the top after accepting, correcting, undoing or saving; restore scroll/selected finding when returning.
10. **Sticky primary action:** consistent `Save / Continue` control where helpful; guard against accidental double-submit and destructive changes.
11. **Fast path:** trained surveyor can record a normal/no-damage face with very few actions while still explicitly confirming the inspection.
12. **Accessibility:** minimum practical 44 × 44 px touch targets, visible focus, labelled controls, clear inline errors, no status conveyed solely by colour.
13. **Error feedback:** distinguish AI timeout, unsupported equipment, invalid code, missing calibration, lost upload and rejected save. Preserve work and show manual alternatives.
14. **No surprise mutations:** re-running analysis must not replace verified CEDEX fields without explicit confirmation.

### 8.1 Proposed mobile screens

`Survey queue / Start → Container identification → Face coverage → Overview & AI regions → Finding detail / close-up → Measurement & repair → Survey summary → Submit → QA / Report`

A single physical screen may combine adjacent steps, provided the user does not lose orientation or have to re-enter information.

## 9. Lifecycle and business rules

### 9.1 Gate cycle / survey

Reference baseline supports `CREATED`, `IDENTIFIED`, `SURVEYING`, `REVIEW_REQUIRED`, `COMPLETED`, `CANCELLED`, `ABANDONED`. For the MVP, model review/submission actions explicitly (or via a separate review table) while preserving backward compatibility.

Proposed flow: `CREATED → IDENTIFIED → SURVEYING → SUBMITTED/REVIEW_REQUIRED → APPROVED/COMPLETED`, with `RETURNED → SURVEYING`, plus authorised `CANCELLED`, `ABANDONED`, `AMENDED` paths.

### 9.2 Finding

Reference baseline supports `CAPTURED`, `ANALYSING`, `AI_SUGGESTED`, `REVIEW_REQUIRED`, `APPROVED`, `CORRECTED`, `CANCELLED`.

A finding must not reach final approval without valid required code decisions, a documented disposition and satisfactory evidence/required measurements. A dismissed AI box is not necessarily a finding, but must be recorded for model QA where retained.

### 9.3 Hard invariants

- One active gate cycle per container under the existing operational uniqueness rule, unless a later approved multi-depot workflow changes that invariant deliberately.
- A survey/finding/photo belongs to exactly the correct gate cycle and user-authorised depot.
- AI-generated values and original photos are append-only evidence; human-corrected final fields remain versioned.
- A survey cannot silently convert **not inspected** to **no damage**.
- A valid CEDEX code does not, by itself, mean a proposed repair is required or acceptable.
- No AI result may silently write a final approved survey decision.

## 10. Security, privacy, reliability and non-functional requirements

| Domain | Requirement |
|---|---|
| Access control | Production SSO/identity and server-side RBAC for surveyor, QA, admin; no public mutation of operational data |
| Depot isolation | Authorise access to each survey, image and export by depot/workscope; avoid enumeration of raw R2 keys |
| File upload | Validate MIME and actual image content, maximum size/resolution, safe decoding, object names and rate limits |
| Secrets | Workers secrets/environment configuration; never expose provider keys or sensitive details to browser |
| Audit | Append-only attributable log for identification overrides, changed codes, deleted findings, QA and reference updates |
| Evidence integrity | Record photo hashes, image transformations and linkage; preserve originals per retention policy |
| Data lifecycle | Document retention, access/deletion approvals, backup/recovery and training-data de-identification where applicable |
| Resilience | Graceful handling for AI quota/rate limits, lost network, partial R2 upload, database conflict and retry |
| Performance | Target responsive field interactions; render local preview immediately; expose AI progress and allow manual continuation |
| Observability | Per-stage latency, model usage, error rates, failure mode, request ID; redact personal/sensitive content from logs |
| Maintainability | TypeScript type checking, unit tests, integration tests, migration rollback planning and feature flags |
| Compatibility | Existing APIs and D1 history must survive staged upgrades; migrations non-destructive by default |
| Cost | Track Workers AI inference cost/latency, R2 storage and repeat inference; avoid duplicate model calls |
| Accessibility | Readable outdoors, high contrast, clear state, keyboard/screen-reader basics where applicable |

**Initial performance targets for pilot validation (proposed, not observed):** Common UI actions show feedback within 0.3 seconds on supported devices; image preview displays immediately after capture; 95% of valid API saves succeed without manual retry; model and end-to-end response-time targets are set from measured field tests rather than promised without benchmarks. Report both median and 95th-percentile analysis time by stage.

## 11. Data quality, evaluation and learning

### 11.1 Metrics

- ISO OCR accuracy and independent check-digit rejection rate.
- Face/profile mismatch frequency and calibration acceptance/rework rate.
- Detection **precision, recall and false-negative rate per physical damage instance**, including multi-defect photos.
- Component and damage **top-1** and **top-3** accuracy by equipment, camera face and code.
- `CU` vs `CO`, `DT` vs related deformation classes, and `IR` disambiguation confusion matrices.
- Exact-match CEDEX location accuracy and boundary-crossing error rate.
- Measurement error against physical tape/depth-gauge ground truth, not model estimates alone.
- Repair recommendation applicability validity, abstention rate, surveyor override and IICL rule-grounding coverage.
- Survey time per container, touches/taps per finding, retake rate and QA return rate.
- Workers AI latency, cost per survey, retry rate and availability.

### 11.2 Ground-truth protocol

1. Surveyor confirms each component/damage/location/repair separately.
2. QA validates a stratified sample and all high-risk or conflicting cases.
3. Save verified image regions, physical labels, camera metadata, measurements, versioned criteria and approved decisions.
4. Prevent near-duplicate same-container and same-photo data leakage between train/validation/test splits.
5. Maintain a fixed holdout set by defect and conditions (lighting, corrosion, old repairs, camera angle, 20/40 ft, GP/RF).
6. Do not treat five examples per code as sufficient evidence for production-grade claims; require larger representative test sets and confidence intervals before broadening scope.
7. Document what was actually tested; do not report unvalidated model confidence as accuracy.

### 11.3 Rollout quality gates (proposed)

- **Mandatory:** Zero invalid CEDEX component/damage/repair combinations in final approved test records.
- **Mandatory:** No silent overwrite of human corrections and no unauthorised approval path.
- **Mandatory:** All deliberately seeded critical defects in the safety UAT suite cause review/hold rather than unattended clearance.
- **Mandatory:** A failed model call still permits a valid manual survey.
- **Conditional:** Set numeric detector/classifier accuracy gates only after representative labelled baseline data is available; do not assume the current POC accuracy is production-ready.

## 12. User acceptance test scenarios

| UAT | Scenario | Expected behaviour |
|---|---|---|
| UAT-01 | Clear container door image | Read ISO number/type, validate, propose mapped dimensions |
| UAT-02 | Wrong OCR check digit | Block ordinary confirmation; allow correction and retain original OCR |
| UAT-03 | No camera permission | Gallery/manual path available without losing survey |
| UAT-04 | Same container scanned during active gate cycle | Resume existing survey; no duplicate active cycle |
| UAT-05 | Same container returns on another date | New gate-cycle survey; historical survey unchanged |
| UAT-06 | GP 40 ft high cube side photo, correct fixed camera | Correct face/orientation and location geometry |
| UAT-07 | Mirrored/rotated/cropped image | Overlay remains correctly aligned or prompts review |
| UAT-08 | Missing/invalid camera calibration | Manual location; clear review requirement |
| UAT-09 | A single visible panel dent | One region; correctable CEDEX and surveyor decision |
| UAT-10 | A cut and a dent on the same panel | Two independent findings or surveyor split; no silent loss |
| UAT-11 | Corroded patch next to cut | Avoid forced CO/CU merge; independent manual control |
| UAT-12 | No obvious damage | AI 'none found' cannot mark face inspected automatically |
| UAT-13 | False-positive dark mark | Surveyor dismisses; final survey excludes it; QA evidence retained as appropriate |
| UAT-14 | AI misses a defect | Surveyor adds annotated finding manually |
| UAT-15 | Door hardware vs locking-bar guide | Face-scoped master and visual rules distinguish HWR/LBG |
| UAT-16 | GP/PAA vs RF/PAA | Names/candidate meaning change according to equipment type |
| UAT-17 | Low-confidence component or damage | Force review even if model says no review |
| UAT-18 | Damage crossing two calibrated location cells | Review/explicit coding policy applied; no arbitrary location |
| UAT-19 | Depth cannot be inferred from photo | Manual/tool depth and source required for depth-based reasoning |
| UAT-20 | GP/PAA/DT with length/width and grounded prior cases | Allowed and traceable recommendation; surveyor confirms |
| UAT-21 | Unsupported repair reasoning combination | Rules-only/manual code selection, no invented AI repair |
| UAT-22 | AI timeout or rate limit | Preserve images and work; manual code path works |
| UAT-23 | Upload retry and repeated save | Idempotent records; no double findings |
| UAT-24 | Survey with no damage | Every required face explicitly inspected or exception authorised |
| UAT-25 | One finding missing mandatory disposition | Submission blocked with link to exact missing field |
| UAT-26 | Approved survey edited | Versioned amendment; identity and prior approval preserved |
| UAT-27 | Supervisor returns a finding | Surveyor sees reason, corrects and re-submits |
| UAT-28 | PDF/report generation | Images, codes, measurement provenance, review status and audit identifiers match approved records |
| UAT-29 | Unauthorised user accesses survey/photo | Server rejects request; object storage remains private |
| UAT-30 | Mobile browser back/reload or scroll during correction | No unintended scroll jump or lost user edits |

## 13. Proposed implementation roadmap

### Phase A — Stabilise existing POC (R1)

- Verify existing door/OCR, fixed-camera profile and unified single-damage flow under real lighting/capture conditions.
- Keep **one unified zero-touch call by default**, remove accidental parallel auto detection.
- Test overlay geometry, thin pinpoint, rotation and image-size conversions.
- Validate GP/RF scoped master and independent confidence/review rules.
- Standardise measurements, rule provenance, repair abstention and correction logging.
- Add QA dashboards and retry/latency metrics; keep the manual-first fallback.

### Phase B — Multi-finding workflow (R2 priority 1)

- Change zero-touch inference contract to a collection of candidate ROIs, not a single primary box.
- Add a finding list linked to each overview; reuse overview photo and allow targeted close-ups.
- Add add/split/merge/dismiss/re-analyse actions with idempotency and prediction preservation.
- Implement true no-damage/face-coverage states.

### Phase C — Operational workflow (R2 priority 2)

- Add survey summary, submission validation, QA approval/return and amendments.
- Add production authentication, depot scope, audit, secure photos, structured export and PDF report.
- Set quality gates and complete real depot UAT prior to operational use.

### Phase D — Scale and specialise (R3)

- Expand GP component/damage/repair criteria where grounded and tested; introduce RF-specific views cautiously.
- Add interior/machinery inspection modes rather than exposing hidden parts to external cameras.
- Capture high-quality verified cases; benchmark CNN detectors/classifiers against VLM, gated by version and rollback.
- Plan EIR/EDI integration and offline support only with tested operational use cases.

## 14. Development and repository guidance

**Reviewed baseline:** [`ongkokl/Container-Survey-VLM`](https://github.com/ongkokl/Container-Survey-VLM)

- Worker routing/API: `src/index.ts`.
- Unified zero-touch POC: `src/application/overviewUnifiedZeroTouchService.ts`.
- Component/damage services: `src/application/cedexClassificationService.ts`, `damageClassificationService.ts`.
- Location/camera calibration: `locationSuggestionService.ts`, `fixedCameraCalibrationService.ts`.
- Repair recommendation: `repairRecommendationService.ts`.
- Browser UI: `public/index.html`, `public/app.js`, `public/camera-guidance.js`, `public/styles.css`.
- Data model: `docs/data-model/DATA_MODEL.md` and D1 `migrations/`.
- Source master scope: `docs/architecture/IICL_COMPONENT_MASTER_SCOPE.md`.
- Tests: `tests/`.

**Change-management rules for AI coding assistants**

1. Read this PRD and the existing architecture/data model before implementing a feature.
2. Describe affected endpoints, D1 tables, UI state and regression tests in each PR.
3. Reuse existing services and code-master validation; avoid a second independent classification path without a justified design.
4. Do not remove the working single-finding POC until multi-finding passes acceptance tests.
5. Any schema change requires an additive migration and a rollback/recovery plan.
6. Never silently change CEDEX code meanings, IICL references, location geometry or historical surveyor decisions.
7. Add unit, integration and mobile UI tests for every workflow transition and known failure mode.
8. Update this PRD, relevant architecture docs and changelog when requirements change.

## 15. Explicit exclusions and assumptions

- The product is **decision support**, not a substitute for qualified IICL/CEDEX-trained professional inspection or current approved acceptance criteria.
- IICL numeric limits are not inferred from the VLM, hard-coded speculatively or universally applied outside their permitted component/equipment context.
- A CEDEX repair code alone does not authorise work, establish costs, determine liability or confirm container road/sea-worthiness.
- A depot tariff/price list is not an authority for deciding which repair method is technically applicable.
- The present unified zero-touch implementation is a **single-primary-finding POC**; multi-damage is a formal target, not a declared existing feature.
- POC's absence of login is intentional; production requires authentication and access control.
- Automated physical depth measurement, automatic approval, autonomous repair orders, unrestricted RF/machinery coverage, offline mode and direct EDI are outside the first controlled pilot.
- Required face coverage, acceptance criteria versions, QA routing rules, approval authority, export schema and retention periods are depot-specific configuration decisions to finalise before R2 release.

## 16. Product acceptance definition

The depot survey MVP is accepted only when a qualified surveyor can:

1. Identify and validate a container for the correct gate cycle.
2. Record which required faces were inspected and which were inaccessible.
3. Capture shared overviews and reliably manage zero, one or multiple damage findings.
4. Accept/correct each finding's CEDEX component, damage and location using constrained masters and calibrated geometry.
5. Enter credible measurements and distinguish manual/tool readings from image estimates.
6. Record condition disposition and select only applicable, traceable repair codes or escalate for review.
7. Submit the survey to the correct QA workflow and produce an approved, auditable report.
8. Recover gracefully from AI failures without losing evidence or falsifying decisions.

**Product owner sign-off:** ____________________  
**Operations / senior surveyor sign-off:** ____________________  
**Technical / QA sign-off:** ____________________