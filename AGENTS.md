# AI Coding Agent Instructions — Container Survey VLM

This file guides AI-assisted changes to `ongkokl/Container-Survey-VLM`. Read the relevant files before implementing changes. The product requirements in [PRD.md](PRD.md) describe the **target** product, not proof that each feature already exists.

## 1. Sources of truth and reading order

1. [PRD.md](PRD.md) — user workflow, scope, requirements, acceptance tests and release staging.
2. [docs/architecture/POC_ARCHITECTURE.md](docs/architecture/POC_ARCHITECTURE.md) — bounded contexts and evidence-to-decision architecture.
3. [docs/architecture/IICL_COMPONENT_MASTER_SCOPE.md](docs/architecture/IICL_COMPONENT_MASTER_SCOPE.md) — approved equipment-scoped component master and camera-face candidate rules.
4. [docs/data-model/DATA_MODEL.md](docs/data-model/DATA_MODEL.md) — container, gate-cycle, survey, finding and prediction relationships.
5. Existing `src/application`, `src/domain`, `src/infrastructure`, `public`, `migrations`, and `tests` code — verify real deployed behavior rather than assuming the README or PRD is implemented.

If documents conflict with the current code, report the difference and follow the requested change scope. Do not silently rewrite domain rules to match an assumption.

## 2. Product and operational invariants

- Maintain the hierarchy **container asset → repeated gate cycles → one survey per cycle → zero or more findings**. A container number must never substitute for a survey or gate-cycle primary key.
- Preserve original photos, model predictions, ranked candidates, model/prompt provenance, surveyor decisions and correction history. Never overwrite the AI prediction with the human-confirmed value.
- Human review is authoritative. AI cannot unilaterally issue a final IICL acceptance decision, repair authorisation or approval.
- Do not hallucinate CEDEX codes, damage measurements, repair thresholds, IICL limits or historical case evidence. Unsupported inference must abstain or request surveyor review.
- Always validate ISO 6346 check digits and size/type codes deterministically.
- Scope component candidates to equipment family and permitted face/view. The same code may mean different components for GP versus RF (e.g. `PAA`).
- Use versioned code masters and verified applicability rules for component, damage, repair and location decisions. Do not derive code validity from VLM prose.
- Camera profiles `R`, `L`, `D`, `F`, `T`, `B` identify survey view, orientation and fixed-camera geometry. Preserve calibrated physical boundaries and coordinate mapping.
- Store physical dimensions with units, source and uncertainty. A single uncalibrated photograph must not be treated as a reliable source of physical dent depth.
- An overview photograph may support multiple findings. Avoid duplicating shared evidence or losing finding-level annotations.

## 3. Current POC boundaries

- Current unified zero-touch overview analysis selects **one primary damage** and is limited to validated GP side/front workflows. Multi-damage is an R2 requirement until code and tests prove it.
- GP/PAA/DT has a measurement/history/rule-grounded Qwen repair suggestion path. Other combinations must use verified applicability rules and surveyor selection until independently validated.
- POC may run without login in a separated test environment, but production survey data requires authenticated, role-scoped access.
- Do not remove the functional single-finding workflow during multi-finding development; preserve backwards compatibility or provide an explicit migration plan.

## 4. Implementation guidance

- Keep the **Evidence → Observation → Classification → Rules → Recommendation → Surveyor Decision → Learning** separation.
- Reuse existing application services and D1 repositories. Avoid competing implementations of CEDEX validation or location geometry.
- Keep the default surveyor workflow mobile-first, responsive, and low-tap; provide gallery upload and manual fallback when camera or AI is unavailable.
- Prefer one intended zero-touch inference trigger after overview submission; prevent duplicate automatic model calls caused by UI state changes or repeated taps.
- Use stable photo/annotation coordinate spaces; overlays must remain aligned after rescaling, scrolling and rotation.
- Never silently auto-merge nearby defects or interpret multiple separate defects as a single confirmed finding.
- Use additive, numbered D1 migrations; protect existing survey and training evidence. Document effects on D1, R2 and APIs.
- Do not make destructive changes, deploy to production, or run remote migrations unless explicitly requested.
- Introduce clear state transitions and idempotent save/confirm behavior; retries must not create duplicate surveys or findings.

## 5. Verification before proposing completion

Run relevant checks where the environment supports them:

```bash
npm run typecheck
npm test
```

For changes to survey workflows, test: ISO 6346 validation, duplicate active-cycle prevention, camera orientation and location boundaries, overlay alignment, component/damage candidate filtering, abstention behavior, repair rule applicability, measurement provenance, multiple findings/shared photos, surveyor correction persistence, and graceful AI/API failures. Report tests that were not run.

For each change, summarize: requirement ID from `PRD.md`, what changed, affected files/endpoints/tables, new or changed test cases, unresolved risks, and whether migration or deployment steps are needed. Update the PRD and architecture documentation when approved product behavior changes.
