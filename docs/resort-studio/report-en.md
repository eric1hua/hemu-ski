# Resort Studio: A Reusable Production Platform for Ski Resort Worlds

**Status:** Architecture and workflow proposal, prepared for independent review.

**Reference project:** [Hemu Ski](https://github.com/eric1hua/hemu-ski).

**Repository snapshot examined in the original research:** `e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5`.

**Local checkout examined:** `2550026`, an earlier revision.

**Document provenance:** English adaptation of the Chinese research report produced in this conversation. This translation does not constitute a new repository audit or a fresh verification of external sources.

## Executive recommendation

Develop a reusable production platform, provisionally called **Resort Studio**, that combines:

1. A reproducible development environment.
2. Tools for acquiring, generating, inspecting, and editing resort worlds.
3. Versioned geographic data and reviewed corrections.
4. A shared browser-game runtime and visual system.
5. Resort-specific content and extension code.
6. An experimental lab and a searchable knowledge base usable by different AI agents.

The platform should accept a resort boundary and reference material, then produce independently releasable game and diorama products with a release manifest.

The central architecture is:

> Shared production tools + a reviewed world version + a shared runtime + a resort-specific content package.

Start by making Hemu configurable and taking a second resort through a small end-to-end playable workflow. Use that second resort to test the abstractions before building an extensive management application.

This is a proposal, not an implemented platform. The original research did not migrate application code, deploy services, enable recurring agents, or establish worldwide data coverage. A separate visual prototype was created, but this Markdown report is self-contained and does not require that prototype.

## 1. Product goal and scope

The project owner wants to generate stylized, playable 3D worlds for ski resorts around the world, using publicly available, free geographic data wherever possible. Each world should include terrain, ski runs, usable lifts, and resort facilities, and support experiences comparable to Hemu Ski.

The intended workflow includes:

- Finding elevation, lift, trail-map, and facility information.
- Generating an initial resort world through a reusable technical stack.
- Using AI-assisted comparison with resort maps and other references to propose corrections.
- Adding navigation, riding, menus, gameplay, interaction, and visual stylization.
- Customizing branding, landmarks, buildings, mascots, and recognizable local animals.
- Testing new technologies in a lab and validating suitable improvements in mature projects such as Hemu.
- Recording implementation knowledge, experiments, and failures so another AI agent can become productive quickly.

“Production environment” therefore includes both the development environment and the content-production platform. A development VM or dependency-install script alone does not satisfy this goal.

Worldwide extensibility is an architectural objective. Fully automatic, accurate reconstruction of every resort from free data is not an established capability. Free source data also does not imply free inference, model generation, compute, storage, or hosting.

## 2. Research scope and evidence boundaries

The original investigation inspected the local checkout and made a read-only remote HEAD check. Because the remote revision was newer, relevant files were also read at the pinned remote commit above.

The inspected material included README and agent instructions, the terrain baker, map-editor documentation and save logic, world loading, the game and diorama entry points, summit photo-review code, and the deployment workflow.

External research used GitHub repository search and documentation maintained in official project or specification repositories. Google search and several standalone documentation domains were blocked by the environment's egress policy. Candidate tools were not benchmarked, and coverage was not checked for every country or resort.

Repository observations below describe the examined snapshot. Recommendations describe a proposed future architecture. Neither category establishes that the proposed platform is already operational.

### Observed Hemu capabilities and gaps

| Area | Existing foundation at the examined revision | Work needed for reuse |
| --- | --- | --- |
| Geographic ingestion | `tools/terrain/fetch-data.mjs` downloads Terrarium elevation tiles and OSM runs and lifts, with local caching. | Parameterize the origin, extent, grid, and output paths; introduce source-version locking and an explicit refresh policy. |
| World editing | `tools/map-editor/` supports terrain, run geometry, trees, facility positions and orientations, and lift endpoints, with undo and save. | Add evidence references, candidate changes, stable identities, persistent versions, and conflict handling during rebuilds. |
| Visual calibration | `tools/review/summit.html` combines photo-fitted cameras and image overlays for summit landmarks. | Generalize references, camera calibration, matched points, and review tasks. Existing overlays do not establish automated AI calibration. |
| Product views | The game and diorama share several `src/world/` modules. | The game reads edit overlays, while the diorama reads a separate `diorama/` bake. Derive both from the same reviewed world version. |
| Runtime | Three.js and Vite; riding physics, GPS, menus, touch input, characters, vehicles, a dog, and stylized rendering. | Separate reusable modules from Hemu-specific names, coordinates, the 2,350 m treeline, the assumed 34 m run width, and other local choices. |
| Terrain processing | An 8 m base grid, with newer gameplay processing that resamples to 4 m, adds snow banks and summit shaping, and uses distance-dependent detail. | Distinguish authored gameplay geometry from measured terrain. The editor documentation notes that some game-side shaping is absent from its editing view. |
| Asset production | A separate local Tripo/Blender asset lab; shipped GLBs have source and SHA-256 records. | Make reusable recipes, exporters, and manifests reproducible and backed up; keep large source materials in appropriate storage. |
| Verification and release | A character-animation regression test and GitHub Actions deployment of the game and diorama. | The examined deployment workflow builds but does not run `npm test`. Add relevant world, navigation, lift, and browser checks. |

The baked data contains **87 run-feature records and 10 lift-feature records**. These are not verified counts of officially named resort runs or independently operated lifts. OSM segmentation, relations, areas, and feature types affect counting.

The summit-review code contains a useful limitation: its comments state that view C cannot reliably fit the stations and is useful for checking landmark ordering and occlusion rather than their positions. Photo references also point to `/canvas/pages/.../assets/`. Reference availability, calibration limits, and versioning therefore need explicit treatment.

## 3. Recommended production workflow

```text
Resort selection and data feasibility
  -> Immutable source snapshots
  -> Geographic normalization and semantic modeling
  -> Initial world generation
  -> AI-assisted calibration and human review
  -> Reviewed world version
  -> Gameplay, visual-style, and localization assembly
  -> Resort-specific content and interactions
  -> Data, visual, gameplay, and performance validation
  -> Independent release and feedback

Research lab
  -> Small benchmark scene
  -> Hemu candidate build
  -> Second-resort validation
  -> Stable shared capability

Every stage
  -> Structured decisions, recipes, incidents, and experiment records
  -> Searchable knowledge base
  -> Context for subsequent tasks
```

Three capabilities should span this workflow: **feasibility assessment, reproducible versioning, and acceptance criteria**.

### 3.1 Assess data feasibility before generation

Create a data assessment for each resort covering:

- Geographic extent and source dates.
- Actual source resolution and elevation reference.
- Run, lift, and facility coverage.
- Official-map and photo availability.
- Missing or contradictory information.
- Applicable licenses and redistribution constraints.

Record known, unknown, and conflicting information per field. A single numerical quality score should not conceal missing evidence.

A preliminary classification could be:

| Class | Available information | Expected workflow |
| --- | --- | --- |
| A | Elevation, runs, and lifts are reasonably complete. | Generate, inspect, and calibrate. |
| B | Elevation is usable, but some routes or facilities are missing. | Generate a partial world and supplement it from references and manual work. |
| C | Only coarse terrain or schematic material is available. | Produce an explicitly approximate concept world, with inferred content identified. |

These are proposed operating categories, not validated industry standards.

### 3.2 Separate three layers of world information

**Geographic source layer.** Preserve original DEMs, OSM extracts, credible control points, and facility information. Record provenance, dates, coordinate reference systems, vertical datums, and uncertainty. Preserve source assertions without treating every source value as unquestionable ground truth.

**Reviewed correction layer.** Store accepted run geometry, lift connections, stations, facilities, and terrain corrections. Every change references evidence and a baseline. Together with normalized source information, this forms the canonical world used by downstream products.

**Gameplay and art layer.** Store rideability smoothing, snow banks, stylized scale, procedural vegetation choices, fictional experiences, and accelerated lift animation. Identify which elements represent measured features and which are authored or inferred.

Hemu's `raiseBanks`, `shapeSummit`, and exaggerated diorama proportions illustrate why these layers matter. Different products can derive different representations from one reviewed world, provided their differences are explicit. Rendered terrain and collision terrain must agree where gameplay depends on them; editing tools should expose relevant differences.

An 8 m or 4 m output grid is not evidence of 8 m or 4 m measurement detail. Interpolating approximately 30 m source data does not create new measured terrain features.

### 3.3 Define a semantic world model

The production interface should preserve more than meshes and GLBs. It should represent:

- Run lines or areas, widths, original difficulty labels, country-specific difficulty mappings, and directional rules.
- Lift types, stations, intermediate stops, and allowed boarding and alighting points.
- Facility types, entrances, physical and navigational connections, and collision proxies.
- Names, aliases, and localized labels.
- Uncertainty and source attribution.

A proposed entity record includes:

```text
id
sourceRef
geometry
attributes
evidenceRefs
observedAt
reviewStatus
uncertainty
```

Use stable internal IDs with source mappings so identity can survive source feature splits, merges, or replacement. Preserve unknown difficulty instead of silently assigning an intermediate rating. Hemu's current ingestion fallback to intermediate should not automatically become a worldwide rule.

Geometric proximity does not prove traversability. Hemu uses distance thresholds when joining routes and stations; broader reuse must account for grade-separated crossings, ridges, pedestrian connections, and intermediate stations. Ingestion should evaluate relevant OSM ways, relations, run areas, lift segments, and facilities rather than assume one set of line features is sufficient.

## 4. AI-assisted calibration and review

### Inputs and proposed processing

Inputs are pinned source data, resort maps, landmark and facility photos, known control points, and user corrections.

A proposed process is:

1. Extract labels and legends with OCR.
2. Match candidate stations, landmarks, and run names.
3. Identify whether a reference is orthographic, schematic, photographic, or artistically distorted.
4. Fit camera views for appropriate photographs, or establish geographic control points where the reference supports georeferencing.
5. Produce explicit candidate patches with evidence.
6. Run geometry and topology checks.
7. Have a reviewer accept, adjust, reject, or request more evidence.

This sequence is a design proposal, not a demonstrated automatic capability.

### Limits of map-to-world matching

Official trail maps often combine slopes shown from different viewpoints. A single global warp should not be assumed to recover reliable geographic coordinates.

QGIS georeferencing is relevant for references with meaningful geographic correspondences. Artistic trail maps may require regional comparisons, fitted views, and topological constraints. Hold back independent check points rather than evaluating only points used in the fit. A low fitting residual is not sufficient evidence of geographic accuracy. [4]

### Candidate changes as inspectable artifacts

An illustrative patch, not an executable schema:

```yaml
kind: move_lift_station
target: lift:stable-id:top
base_world: sha256:...
before: {x: ..., z: ...}
after: {x: ..., z: ...}
evidence: [reference-image-id, matched-control-points]
method: camera-fit-and-manual-review
model_and_prompt: recorded-reference
uncertainty: unresolved-until-reviewed
status: proposed
```

The review interface should place reference material beside linked 2D and 3D views, with a change list, provenance, before/after differences, and local validation results. Support per-change acceptance, rejection, adjustment, annotations, and rollback.

The AI proposes changes. Deterministic programs check what can be checked. Human review resolves ambiguous correspondences and consequential terrain changes.

Validation should examine control-point errors, run continuity, plausible endpoints, lift-ground intersections, station accessibility, and invalid connections across barriers. Image similarity and model-reported confidence are insufficient substitutes.

### Updating sources without losing editorial work

Compare both the accepted patch set and the new source snapshot against their old baseline. Source geometry changes, projection changes, splits, and merges may require conflict resolution. Do not replay patches by array index.

For nondeterministic AI steps, store the original response, candidate changes, and accepted result. Historical reproducibility should not depend on getting the same answer from a future inference call. The exact merge strategy for raster edits and semantic changes remains an engineering task to validate.

## 5. Research comparison and technology choices

This comparison evaluates fit based on official documentation. It does not report performance benchmarks or completed integrations.

| Project or technology | Relevant existing capability | Recommended role and limitation |
| --- | --- | --- |
| OpenSkiData / OpenSkiMap [1] | Sanitization, normalization, and graph processing of ski data; resort, run, and lift outputs; regional processing and GeoPackage support. | Evaluate as a geographic input adapter. It does not supply Hemu's riding, collisions, or visual experience. Its OSM-derived output is not independent survey evidence against raw OSM. |
| Terrain Tiles / Terrarium [2] | Public tiled elevation already used by Hemu. | Retain the current fast path. Check actual source resolution, regional provenance, and attribution instead of interpreting zoom or grid size as measurement accuracy. |
| Copernicus DEM [3] | AWS registration describes GLO-30 Public and GLO-90, supplied as COGs. | Consider an optional elevation adapter. It is a DSM that can include vegetation, buildings, and infrastructure. The AWS registration identifies some public GLO-30 coverage exclusions; verify the selected distribution, release, coverage, and license. |
| QGIS / GDAL / PROJ [4][5] | Georeferencing, clipping, reprojection, raster resampling, and format conversion. | Reuse established GIS tooling while retaining useful JavaScript world-generation logic. Add heavier GIS components where an actual processing need justifies them. |
| STAC / COG [5][6] | Geographic asset metadata conventions and efficient raster organization. | Use appropriate conventions for source catalogs and intermediate rasters. An MVP can use a static catalog; a hosted STAC API is not a prerequisite. Games can continue to consume compact baked formats. |
| MapLibre / PMTiles [7] | Map interfaces, regional selection, review, and tiled-data archives. | Appropriate for production maps. They do not directly replace the Three.js riding runtime. The existing editor may suffice for an initial small-area workflow. |
| Cesium / 3D Tiles [8] | Large-scale geographic visualization and streaming of heterogeneous 3D content. | Reassess if scope grows to continuous global browsing or very large geographic scenes. Multiple separately loaded resorts alone do not require this architecture. |
| DVC [9] | Versioning data artifacts and their build dependencies alongside Git. | Evaluate as data volume and workflow complexity grow. Hashes, manifests, and artifact storage may suffice initially. |
| Arnis [10] | An existing real-geography-to-game-world workflow with modular acquisition, processing, and generation. | Learn from area selection, generation presets, and boundaries. Its voxel-oriented generators are not direct replacements for Hemu terrain or riding physics. |

Retain Three.js and Vite for the existing game unless a concrete requirement justifies a change. A complex production UI could use React independently; this does not require moving gameplay into React Three Fiber. Preserve the tuned riding model while testing alternative physics approaches in isolated experiments if needed.

## 6. Proposed production workspace

The main context selector is **resort + world version**. Six workspaces cover the production process:

| Workspace | Main functions | Outputs |
| --- | --- | --- |
| Resorts and references | Area selection, coverage assessment, references, licensing, and missing-data tasks. | Resort configuration, source snapshots, and feasibility findings. |
| World and calibration | Linked references, 2D and 3D views, editing, candidate patches, and version comparisons. | Reviewed worlds and correction history. |
| Experience and customization | Module options, visual presets, localization, branding, landmarks, animals, and interactions. | Experience profiles, assets, and resort extensions. |
| Validation and release | World checks, visual comparisons, route playback, device performance, and release differences. | Game, diorama, release manifest, and attribution package. |
| Research lab | Technology inbox, experiment records, benchmark scenes, and promotion criteria. | Validated shared capabilities or documented negative results. |
| Knowledge and agents | Search, decisions, recipes, incidents, task context, and execution history. | Evidence-linked task context packages. |

### Durable tasks and disconnection handling

A proposed job lifecycle includes queued, running, awaiting review, validated, failed, and cancelled states. Jobs should record run IDs, stages, inputs, outputs, progress, logs, executors, error classes, retries, and cancellation.

Persist job state on the service side. Use WebSocket or, where appropriate, SSE to notify the browser of progress. After reconnection, query authoritative job state and resume event delivery. Closing a page should not discard a long-running bake or generation job. Serve terrain and asset files through ordinary HTTP or artifact storage.

The earlier report of “WebSocket closed” in this conversation did not establish a cause. Development hot-reload connections, future production-job connections, and platform browser-tool connections must be diagnosed separately. The task architecture above is a recommendation, not a diagnosis of that incident.

## 7. Code, content, and artifact organization

Begin with a modular codebase and keep the current Hemu product working. The following is a target layout, not a completed migration or a requirement to create every package immediately:

```text
resort-studio/
  apps/studio/                 Production UI, excluded from visitor builds
  apps/game/                   Shared game shell
  apps/diorama/                Shared diorama shell
  packages/world-schema/       World model, stable IDs, validation rules
  packages/world-builder/      Adapters, normalization, baking, derivation
  packages/runtime/            Loading, riding, navigation, interactions
  packages/visual-style/       Toon, ink, sky, material presets
  packages/asset-pipeline/     GLB checking, optimization, export recipes
  resorts/hemu/                Configuration, manifests, patches, extensions
  resorts/second-resort/       A second instance to test reuse
  labs/                       Experiments, benchmarks, results
  knowledge/                  Decisions, recipes, incidents, indexes
  agent/                      Portable entry instructions and tool contracts

artifact-storage/             DEMs, photos, DCC sources, versioned builds
```

A resort consists of configuration, a world version, content, and necessary extension code. Configuration should cover identity, coordinates, vegetation, run widths, spawn points, languages, difficulty mapping, optional capabilities, visual style, and performance profiles.

Keep complex behavior in extension code. A prayer-wheel interaction, for example, need not become a general YAML language. A resort without a dog, hot spring, or aircraft should still load correctly.

Preserve the existing boundary between production tools and shipped product code. Development editing endpoints, local asset paths, credentials, and experimental dependencies should not leak into visitor builds.

Make extraction incremental and compatible. The current asset lab imports game material and character modules; map those dependencies before moving interfaces.

### Independent releases

Build independent sites or subpaths from shared runtime versions and resort content. A release manifest should pin:

```text
runtime version
builder version
source snapshot references
reviewed world hash
patch-set hash
asset manifest
visual-style profile
```

Rollback should restore a complete release. Runtime improvements should be validated against representative resorts rather than silently replacing every published product.

## 8. Research lab and knowledge system

### Technology intake and promotion

Technology candidates can come from the owner or from a future scheduled research process. Start with an inbox and research summaries rather than automatic dependency upgrades. A weekly review is a suggested cadence, not an enabled automation.

An experiment record should capture:

- The problem, hypothesis, and source material.
- Dependency versions and a minimal representative scene.
- A baseline, success criteria, and time and cost budgets.
- Results, failures, limitations, and reproducibility instructions.
- Adoption conditions and a rollback path.

Possible experiments include texture and mesh delivery improvements, terrain chunking, or more reliable reference matching. These are candidates to test, not established recommendations with measured benefits.

Promote capabilities through a small scene, a Hemu candidate build, and a second resort before making them shared defaults. Keep existing releases recoverable. Measure first-load time, long frames, memory, resource sizes, and visual quality under fixed conditions rather than relying only on average FPS.

### Knowledge as versioned project memory

Start with Markdown and structured metadata in Git, with large attachments and logs in artifact storage.

| Record type | What it should preserve |
| --- | --- |
| Decisions | The chosen approach, alternatives, rationale, and applicability limits. |
| Recipes | Terrain processing, calibration, GLB export, LODs, skeleton compatibility, localization, and release procedures. |
| Incidents | Symptoms, environment, reproduction, root cause, correction, and verification. |
| Experiments | Baselines, positive and negative findings, budgets, and promotion status. |
| Resort dossiers | Geographic evidence, local characteristics, fictional design additions, and unresolved questions. |

Each record should have an ID, scope, applicable versions, evidence links, verification date, and status. Retain superseded findings with clear replacement links.

An agent should read a lightweight project entry point and retrieve a task-specific context package: the selected resort and versions, goals and constraints, relevant decisions, recipes, known failures, commands, and verification requirements.

Begin with keyword, tag, and structured filtering. Add semantic retrieval only when scale or search quality warrants it. CLI and MCP adapters can help, but core knowledge and tools should remain accessible through ordinary files and documented interfaces. A knowledge base accelerates onboarding; it does not eliminate the need for an agent to verify its work.

## 9. Acceptance criteria

| Area | Meaningful minimum verification |
| --- | --- |
| Geographic data | Checksums, invalid values, bounds, actual resolution, CRS, vertical reference, and known-point comparisons. |
| Topology | Run directions, representative destination reachability, boarding and alighting, intermediate stops, and crossings that must remain disconnected. |
| Representation consistency | Rendering and collisions agree where required; editor, game, and diorama share a reviewed world version; representation differences are documented. |
| Gameplay | Spawn, ride, reach a station, board, arrive, and navigate; recover from falls and handle boundaries. |
| Assets | Scale, facing, ground anchors, collision, animation, GLB validity, textures, and delivery budgets. |
| Browser behavior | Desktop and touch input, responsive layout, load failures, WebGL context recovery, and production-job reconnection. |
| Release | Per-resort base paths, pinned shared versions, independent packages, attribution, and full rollback. |

Mobile 30 FPS and desktop 60 FPS could be initial discussion targets, but must be tied to named devices, quality settings, and routes. Use frame-time distributions such as p95 as well as other metrics. These are not claims about current Hemu performance.

Set geographic tolerances in relation to source resolution, uncertainty, and intended use. Do not invent precision thresholds before evaluating representative data.

## 10. Implementation sequence

Use acceptance-based milestones rather than unsupported schedule commitments.

### Milestone 1: Make Hemu configurable

Inventory current setup and generation entry points. Extract resort-specific constants, identity, facilities, spawn points, and save-data namespaces.

**Acceptance:** Hemu's existing core experience still works, and asset-lab imports remain usable.

### Milestone 2: Run a minimal second-resort workflow

Choose a resort with reasonably available data and some geographic or facility differences from Hemu. Generate terrain, a few runs, one usable lift, and navigation.

**Acceptance:** The shared workflow runs without copying the entire core application. Necessary exceptions are explicit. A Japanese resort is one possible candidate, but data quality must be checked before selection.

### Milestone 3: Establish reproducible data and world versions

Add source snapshots, stable identities, manifests, correction records, and common derivation of game and diorama data.

**Acceptance:** Pinned inputs, tools, and seeds can reproduce the intended outputs; source refreshes do not silently overwrite reviewed work. Record nondeterministic outputs rather than assuming identical future inference.

### Milestone 4: Build the calibration workflow

Connect the existing editor and photo-review tools before adding AI proposals, evidence handling, and source-update conflict resolution.

**Acceptance:** Accepted changes are explainable, reviewable, and reversible.

### Milestone 5: Package experiences and customization

Add optional capability profiles, style and localization settings, landmark assets, and resort-specific behaviors.

**Acceptance:** Hemu and the second resort can each be built, released, and rolled back independently.

### Milestone 6: Expand orchestration, the lab, and agent access

Improve durable task execution, logs, version comparisons, experiment promotion, and task-context retrieval. Knowledge recording starts in the first milestone; it is not deferred until this stage.

**Acceptance:** A browser disconnect does not lose a production job, and a newly connected agent can retrieve the relevant, version-aware project context.

### Initial infrastructure

An early setup could use the existing Node/Three.js/Vite stack, Python/GDAL/PROJ where needed, local manifests and SQLite for task metadata, and files or object storage for artifacts.

Reassess PostgreSQL/PostGIS and a dedicated queue as collaboration and workload grow. Microservices, Kubernetes, a vector database, or global 3D streaming are not initial prerequisites. The exact boundary between local tools and shared services should be tested against the owner's actual workflow.

The first decisive success criterion is:

> A second resort can be generated, calibrated, played, and independently released through the same traceable workflow, with its findings reusable in the next task.

## 11. Licensing, costs, and unresolved questions

Track data licenses separately from rights to map images, photos, logos, mascots, and model assets. Public visibility does not establish redistribution permission. Generate attribution from selected sources; OSM's ODbL requirements, the underlying Terrain Tiles source requirements, and image permissions require separate consideration. AI generation does not remove restrictions on its inputs. [2][11]

The proposal has not established a cost model. Geographic data may be free while generation, inference, storage, bandwidth, and operations incur costs. Initial experiments should record these costs.

Important open engineering questions include:

- How much configuration can be extracted before a second resort exposes different requirements?
- Which source and reference combination is sufficient for that second resort?
- How should raster corrections and semantic patches be merged across source changes?
- What geographic accuracy and visual fidelity are necessary for the intended product?
- Which operations remain local, and which require durable shared services?
- Which asset-lab and reference dependencies must be made portable first?
- What minimum checks justify release, and which tools can provide them economically?

## 12. Sources

These sources were consulted during the original research through their official GitHub files or repositories. Links to moving branches may change; this report does not claim permanent freshness or independent validation of every upstream assertion.

1. [OpenSkiMap architecture](https://github.com/russellporter/openskimap.org) and [OpenSkiData Processor](https://github.com/russellporter/openskidata-processor).
2. [AWS Terrain Tiles registration](https://github.com/awslabs/open-data-registry/blob/main/datasets/terrain-tiles.yaml), [Terrarium formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md), and [terrain-source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
3. [AWS Copernicus DEM registration](https://github.com/awslabs/open-data-registry/blob/main/datasets/copernicus-dem.yaml).
4. [QGIS georeferencing documentation](https://github.com/qgis/QGIS-Documentation/blob/master/docs/user_manual/managing_data_source/georeferencer.rst).
5. [GDAL COG documentation](https://github.com/OSGeo/gdal/blob/master/doc/source/drivers/raster/cog.rst) and [PROJ](https://github.com/OSGeo/PROJ).
6. [STAC specification](https://github.com/radiantearth/stac-spec).
7. [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) and [PMTiles](https://github.com/protomaps/PMTiles).
8. [3D Tiles](https://github.com/CesiumGS/3d-tiles).
9. [DVC](https://github.com/iterative/dvc).
10. [Arnis](https://github.com/louis-e/arnis).
11. [OSM website licensing text](https://github.com/openstreetmap/openstreetmap-website/blob/master/config/locales/en.yml).
12. [OpenSkiStats](https://github.com/dhimmel/openskistats), a potentially useful source of analysis ideas. Its examined README describes methods and results as under development, so it was not treated as a production acceptance authority.

### Pinned Hemu references

- [README](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/README.md).
- [Repository instructions](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/AGENTS.md).
- [Terrain baker](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/tools/terrain/fetch-data.mjs).
- [Map-editor documentation](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/tools/map-editor/README.md).
- [Map-editor state and saves](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/tools/map-editor/map.js).
- [World loading and data](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/src/world/data.js).
- [Game entry point](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/src/main.js).
- [Diorama entry point](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/src/diorama/main.js).
- [Summit photo-review code](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/tools/review/summit-review.js).
- [Deployment workflow](https://github.com/eric1hua/hemu-ski/blob/e3fcd491f49c92416383ae6bb6a8f1a4b3d773e5/.github/workflows/deploy.yml).
