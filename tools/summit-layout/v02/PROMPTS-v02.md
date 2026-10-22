# 云霄峰 v02 图像生成任务（待逐次付费授权）

计划两次内置 imagegen 调用，每次生成一张图。工具未提供单次金额或额度报价；
未得到用户明确许可前不调用。此文件是生成准备，不代表图片已生成或获批。

两次调用使用相同四张输入，顺序固定：

1. `annotated-views-v02.jpg`：用户四视角照片与原标注端点，控制布局和地形。
2. `refs-2-3-4-6-v02.jpg`：2/3/4/6 的实物形态，控制造型。
3. `refs-7-8-9-v02.jpg`：7/8/9 的实物形态，控制造型。
4. `/Users/erichua/Developer/hemu-ski-asset-lab/00-references/render-style-reference.png`：仅控制渲染美术风格，不复制人物、街道、汽车等内容。

## 调用 A：山顶总览

Create one high-resolution landscape concept reference board for the Hemu Ski game, titled exactly “云霄峰 · 山顶重建 v02”. The subject is the real Jikepulin Yunxiao summit around gondola upper terminals G6 and G7, rebuilt as a snowy stylized game environment. This is a spatial reconstruction concept for a developer, not a photogrammetric survey, not a promotional fantasy resort.

REFERENCE ROLES: Image 1 is the authoritative four-view layout evidence. Use its bottom-right winter aerial VIEW 4 as the main camera/composition, expanded upward and leftward enough to include the ridge landmarks. Cross-check height, silhouette, rim and landmark identities against the other three views; VIEW 1 especially disambiguates the photo frame 6. Images 2 and 3 are authoritative numbered real object morphology references. Image 4 supplies ONLY the game's rendering language: fine irregular charcoal outlines, flat cel-shaded three-dimensional forms, two or three broad value planes, warm cream sunlight, muted teal/cool blue-gray shadow planes, graphic teal sky and distant mountains, sparse restrained hatching. No photoreal PBR, no glossy toy plastic, no pixel art. Do not copy the street, cars, traffic signs or character from Image 4.

LAYOUT: In the main winter aerial, G6 is lower-left, G7 lower-right. Preserve their differing terminal axes and existing gondola lines descending out of the foreground. The shared snowy circulation terrace connects them. Object 2 is the central wooden four-countries signpost between stations. Object 8 is the rustic two-seat swing near G7 on the plaza-facing side. Object 1 is a traditional white Mongolian felt yurt on the rounded snowy knoll behind/right of the plaza. Object 5 is the tiny gabled wooden hut near the tall communications mast behind G6; the mast is a separate unnumbered landmark. Object 3 is three distinct red timber shallow-roof shelters, seven gold prayer wheels in EACH shelter (21 wheels total), following the ridge-side connection from G6 toward object 4. Object 4 is the stepped circular stone ovoo farther along that narrow ridge, with three decreasing stone tiers, a central pole/finial and prayer ribbons. Object 7 is the small steep-gabled coffee cabin on the outer snow shoulder beyond the mast; its visible real silhouette has overlapping gables and pale log walls. Object 9 is THREE orange faceted geodesic cabins on high legs, black triangular glazed top panels and access ladders, further up the ridge beyond 7, distinct from object 1 and distinct from moving gondola cabins. Object 6 is the freestanding oversized rectangular wooden photo frame near the outer plaza rim; cross-reference VIEW 1 where it sits beside 1 and on the outer side of 2. Its exact placement across camera views remains provisional: label 6 with an asterisk, do not invent measured coordinates.

TERRAIN: Continuous uneven snowy summit, two station pads, rounded yurt knoll, narrowing ridge to prayer wheels and ovoo, separate outer snow shoulder under the coffee cabin, stepped small foundation pads under the three orange pods. Show real relief and a steep outer mountain slope while keeping an inner traversable snow route. Do not flatten the entire mountain into a large slab; do not make a floating cutaway island; no isolated disconnected platforms or fantasy cliffs. Preserve characteristic real building scales, do not enlarge landmarks into monumental architecture. Simplify material detail for game readability while preserving recognizable construction.

BOARD: Dominant large coherent bird's-eye scene, enough space between numbered callouts to avoid overlapping objects. Small clean round callouts “1” through “9” and “G6”, “G7”, each pointing to the correct object. Number 3 points to the three-wheel-shelter ensemble, 9 to the three-pod ensemble, one category label each. Add a compact legend along the bottom with exact text: “1 蒙古包”, “2 一眼望四国路牌”, “3 转经轮：3组×7个”, “4 敖包与经幡”, “5 小木屋”, “6 巨型木相框*”, “7 咖啡小屋”, “8 双座秋千”, “9 现代穹顶帐篷×3”. Footer: “布局草案 · 非测绘图 · *6号朝向与精确落点待校准”. A few thin unobtrusive dashed route lines may indicate traversable snow connections, with a tiny key “通行连接示意”. No invented north arrow, scale bar, meter dimensions or exact elevations. Avoid crowds, commercial logos, source watermarks and decorative UI. Render all labels directly in the image. Output one finished bitmap.

## 调用 B：1–9 号物体美术参考板

Create one high-resolution landscape 3-by-3 game asset concept sheet titled exactly “云霄峰 · 地标造型参考 v02”. Exactly nine equally clear numbered panels, read left to right then top to bottom. It is a faithful stylization of the real landmarks from the provided references for Hemu Ski, suitable for making simple replaceable placeholder geometry first and finished 3D models later. This is an art reference, not a claim that 3D models have been made.

REFERENCE ROLES: Image 1 identifies all objects and their summit context, especially the traditional white felt yurt 1 and small hut 5. Image 2 supplies real close-up morphology for 2,3,4,6. Image 3 supplies real close-up morphology for 7,8,9. Image 4 is ONLY rendering style: fine irregular charcoal ink outlines, stylized cel-shaded 3D, broad flat two/three-tone planes, warm cream sunlight, muted teal/cool blue-gray shadow planes, restrained graphic hatching, simplified readable forms and natural timber ochres with red/orange accents. Do not reproduce the street scene, character, cars or UI of the style reference. No photographic pasted thumbnails, no realistic rendering, no glossy toy diorama.

COMPOSITION: Each panel has a readable three-quarter asset view on a minimal pale snow base, consistent lighting, camera angle family and visual detail level, generous whitespace, dark teal linework. Individual panel scales adapt so silhouettes stay legible; do not imply a shared metric scale. Do not add unrelated props, people, chairs, or gondola stations. Asset construction should be visible, recognizable and usable by a modeler.

PANEL 1 label “1 蒙古包”. One traditional white Mongolian felt yurt: low cylindrical wall, shallow conical felt roof, central cap, simple dark doorway, small muted red trim. It is not a faceted orange dome.

PANEL 2 label “2 一眼望四国路牌”. Real tall timber signpost with chunky splayed supporting legs around a central vertical pole, forked timber crown and crossing horizontal arrow boards. Small flag-color panels represent China, Russia, Kazakhstan, Mongolia. Preserve the timber structure seen in reference, not a golden statue. Use small arrow text “中国”, “俄罗斯”, “哈萨克斯坦”, “蒙古”.

PANEL 3 label “3 转经轮”. Main view of ONE red timber shallow pitched-roof shelter with exactly SEVEN clearly separated gold cylindrical prayer wheels, each upright with a vertical axle, supported between red beams. A small secondary silhouette shows three identical shelters as an ensemble. Clear caption “每组7个 · 共3组 · 21个”. The roof is snowy; avoid intricate invented religious inscriptions. Seven wheels must remain countable.

PANEL 4 label “4 敖包与经幡”. Three progressively smaller stacked circular stone tiers, short approach steps, central upright finial/pole, strings and many restrained multicolor cloth prayer ribbons attached around tiers. Follow the real low broad stepped stone mound from reference. It is neither a tent nor a flat ring nor a pagoda building.

PANEL 5 label “5 小木屋”. Small simple warm timber hut with gabled snow roof and one door, derived only from visible wide photographs. A tiny gray mast silhouette nearby may show context but must not merge into the hut. Caption “按总览简化 · 功能未定”. Do not invent a shop, utility equipment or tower building.

PANEL 6 label “6 巨型木相框”. Oversized freestanding full rectangular timber picture frame including bottom crossbar, empty walk-through center, two angled supporting feet, wood ochre outline. Small hanging gold text “云霄峰2800” from top rail. Follow real rectangular frame proportions, do not turn it into a gate with no bottom bar, billboard or solid photo board.

PANEL 7 label “7 咖啡小屋”. Faithful small cabin from references: pale whitewashed horizontal log walls, a steep gabled roof with overlapping gable volumes, timber round-end cladding in triangular gables, dark entrance and simple windows, small hand-painted sign “咖啡”. Keep compact building silhouette; snowy roof. No fantasy Swiss chalet or enlarged lodge.

PANEL 8 label “8 双座秋千”. Rustic timber beam on two vertical poles with visible rope-lashed joints, exactly TWO hanging simple bench/plank seats on ropes. Preserve straight post-and-beam construction from reference, not A-frame playground equipment. No people.

PANEL 9 label “9 现代穹顶帐篷”. THREE distinct orange faceted geodesic pods on tall angled legs, dark charcoal triangular glazing across their upper caps, orange triangular lower shell panels, access ladders beneath the doorway. Main pod larger in foreground, other two smaller behind, all clearly three units. Caption “三间 · 架高支腿 · 三角玻璃”. No gondola cable, no hanging cars, no white felt yurt, no ground-level igloo.

Footer exactly “项目美术风格参考 · 造型草案 · 尺寸与朝向待现场关系校准”. All text and numbers should be directly generated in the image, clean and readable. One finished bitmap only.
