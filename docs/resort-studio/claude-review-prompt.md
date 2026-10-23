# Claude Review Request: Hemu Ski to a Reusable Resort Production Platform

## Your role and assignment

Act as an independent reviewer with practical experience in geospatial data pipelines, browser-based 3D games, developer tooling, and AI-assisted production workflows. Review the English report accompanying this request. The report was prepared by another AI assistant; its conclusions are proposals to examine, not decisions you must accept.

This assignment is a research and architecture review. Do not modify the application, migrate repositories, deploy services, publish anything, or start scheduled automations. Deliver Markdown only; no HTML application or prototype is required. Write your review in Simplified Chinese for the project owner, retaining English technical terms and file paths where helpful.

## Project background and the owner's goal

The existing project is [Hemu Ski](https://github.com/eric1hua/hemu-ski), a stylized Three.js/Vite snowboarding game and interactive diorama based on the Hemu Jikepulin ski resort. It already includes terrain baking, run and lift data, a map editor, navigation, riding physics, menus, touch controls, stylized rendering, and customized assets and interactions.

The owner's long-term goal is to create a reusable production environment that can generate Hemu-like products for ski resorts in different countries. Hemu is the first working product and a validation project for that production process. The intended output is a family of independently releasable resort products supported by reusable tools, runtime capabilities, asset workflows, and accumulated knowledge.

Here, “production environment” means the broader production system as well as reproducible developer setup. It is not limited to configuring a server or installing dependencies.

The owner described this workflow:

1. Find public, free online elevation data, lift alignments, and trail maps for a chosen resort, along with available facility information.
2. Use the accumulated technical stack to generate an initial world containing terrain, ski runs, and usable lifts.
3. Use AI to compare that generated world with resort maps and reference material, then correct it.
4. Assemble navigation, riding, menus, gameplay, interactions, and visual stylization comparable to Hemu.
5. Customize the resort with its branding, logos, mascots, service centers, cafes, hotels, landmarks, and recognizable animals where appropriate.
6. Keep learning from technologies supplied by the owner or found through future recurring research. Test candidates in a lab, then validate suitable improvements in mature projects such as Hemu.
7. Maintain a systematic knowledge base of decisions, implementation experience, pitfalls, and successful and failed experiments so different AI agents can resume development quickly.

The owner asked for improvements to this workflow based on external research and comparisons, and a concrete account of what the production platform should look like in relation to Hemu.

## What the report proposes

The report recommends a platform provisionally called Resort Studio, built around:

- Shared production tools.
- Pinned source snapshots and a semantic world model.
- A reviewed canonical world version and traceable corrections.
- Separate gameplay and visual derivations.
- A reusable game runtime and resort-specific content and code extensions.
- A research lab and portable, version-aware agent knowledge.
- Incremental extraction from Hemu, tested through a second resort before extensive platform infrastructure.

Treat these as hypotheses to evaluate. You may recommend a simpler design, different boundaries, alternative tools, or a different sequence if the evidence supports it.

## Evidence and repository access

The original report examined local revision `2550026` and selected remote files at `e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5`. The English document is an adaptation of that report, not a fresh audit. If the repository has changed, distinguish the pinned snapshot from current HEAD.

If you have repository or browsing tools, independently inspect the relevant code and primary documentation. Read applicable repository instructions. Prioritize the terrain baker, world loader, map-editor save format, game and diorama entry points, summit photo-review code, runtime coupling, asset-lab dependencies, tests, and deployment workflow.

If you cannot access code or sources, continue with the report and explicitly label conclusions that remain unverified. Do not claim that you browsed, tested, or confirmed anything you did not inspect. The full report is included below in a combined brief, or is provided separately as `report-en.md`; neither local cloud paths nor the earlier HTML prototype are prerequisites for this review.

## Questions you must examine

### A. Does the proposal meet the owner's actual goal?

Check whether it provides a credible route from one functioning resort product to repeatable production across different resorts and countries. Identify missing workflow stages, unnecessary complexity, and assumptions inherited from Hemu.

Separate requirements essential for a first repeatable production workflow from capabilities that can wait. Do not assume a large platform team or operations budget; where staffing or budget matters, state the assumption.

### B. Are the report's repository claims accurate?

Check the stated current capabilities and gaps. In particular, examine edit propagation between the game and diorama, source and grid resolution claims, gameplay terrain shaping, photo-calibration limits, hard-coded resort assumptions, route connections, and the relationship between existing tests and deployment.

Do not misclassify an upstream source limitation or an intentional artistic choice as an application defect. Distinguish confirmed problems from future generalization risks.

### C. Are the data strategy and AI correction workflow realistic?

Evaluate coverage, geographic and vertical reference systems, DEM versus DSM, source freshness, OSM representations, difficulty conventions, stable identities, and practical accuracy limits.

Assess what AI can reliably automate, what needs deterministic processing, and what requires human judgment. Consider artistic trail maps, multi-view photographs, control points, camera fitting, missing references, and disagreement between sources.

Examine whether immutable inputs, semantic patches, raster edits, source refreshes, and three-way conflict handling are specified well enough. Identify where a proposed mechanism is only an aspiration and suggest the smallest useful experiment to validate it.

### D. Are the architecture and technology choices justified?

Evaluate the separation between source data, reviewed world data, gameplay geometry, rendering, navigation, collision, production tools, and resort-specific extensions.

Compare the recommendation to retain Three.js/Vite with alternatives only where the requirements justify comparison. Assess the proposed roles of OpenSkiData, Terrain Tiles, Copernicus DEM, QGIS/GDAL/PROJ, STAC/COG, MapLibre/PMTiles, Cesium/3D Tiles, DVC, and any materially relevant alternatives.

Do not require every suggested package, service, or standard to exist in the first version. Challenge whether the target directory structure or infrastructure is premature. Distinguish geographic data providers, storage formats, processing tools, and rendering engines rather than treating them as interchangeable solutions.

### E. Will the lab and knowledge base improve future development?

Assess whether experiment records, baselines, budgets, promotion criteria, and rollback paths are practical. Explain how failed experiments and superseded advice remain searchable without misleading future agents.

Evaluate whether the proposed knowledge interface is genuinely portable across agents. Consider provenance, applicable versions, task-context retrieval, and the risk of unverified generated notes becoming accepted project facts.

### F. Is the implementation sequence and acceptance plan practical?

Evaluate making Hemu configurable, choosing a second resort, defining a common world model, implementing reproducible builds, adding review tooling, and improving orchestration. Identify dependencies that should change the proposed order.

Recommend a small first milestone with concrete deliverables and pass/fail checks. Suggest criteria for selecting a second resort; do not assume any named resort has complete free data without checking.

Consider compute, inference, asset, storage, licensing, and maintenance costs where they affect feasibility. Avoid fabricated cost totals or precise schedules without supporting inputs.

## Required review output

Provide a decision-oriented review with:

1. **Overall assessment:** What to retain, change, or defer, and whether the report is sufficient to guide the next implementation step.
2. **Prioritized findings:** Prefer a concise table containing severity, report section, finding, evidence or verification status, practical consequence, and recommended correction. Separate release/implementation blockers, major architectural concerns, and optional improvements. Do not inflate speculative concerns into confirmed defects.
3. **Fact-check results:** Distinguish confirmed, contradicted, outdated, and unverified claims. Cite repository paths and revisions or primary-source links for material factual findings.
4. **A revised minimal architecture and workflow:** State the simplest arrangement that supports the owner's near-term goal, including the source-to-reviewed-world-to-product boundary.
5. **The recommended first milestone:** Include scope, prerequisites, deliverables, pass/fail checks, and a concrete second-resort selection strategy.
6. **Report edits:** Identify the exact sections or claims that should be corrected, expanded, qualified, or removed, with replacement wording for the most important changes.
7. **Only essential open questions:** Ask the owner only about decisions that materially affect the plan and cannot be resolved from available evidence.

Do not merely summarize or endorse the report. Test its assumptions, preserve well-supported existing capabilities, and make your recommendations proportionate to an incremental project.

**Now independently review the English report, verify the claims you can, and return your evidence-based assessment and recommended corrections in Markdown.**
