# Exports the Old English Sheepdog for the game: the Tripo mesh on its Rigify
# wolf rig (tirpo assets lab/03-tripo-exports/white-dog-wolf-rig-v01/), as
# public/models/dog/old-english-sheepdog.glb.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b \
#     "tirpo assets lab/03-tripo-exports/white-dog-wolf-rig-v01/white-dog-wolf-rig-v06.blend" \
#     --python scripts/export-dog.py -- public/models/dog/old-english-sheepdog.glb
#
# The game poses the dog in code (src/world/dog-rig.js), so the 823-bone Rigify
# rig, with its controls, mechanism bones and constraints, isn't exported.
# Instead this builds a plain skeleton out of the deform bones the mesh is
# weighted to, at their rest positions, named for what they are and chained
# the way a dog's body goes: root → hips → spine → chest → neck → head → jaw,
# the tail and tongue out from where they join (Rigify chains both from the
# tip in), each leg hip to paw. A Rigify limb's second half (thigh.001 and so
# on) carries no weights, so each leg bone runs on to the next joint. The few
# weights on the rig's own root bone (the rump, from automatic weighting) go to
# the hips, so the rump moves with the body. Each vertex keeps its four
# strongest weights, normalised. The 8K base colour comes down to 2K.
#
# The .blend is read and never saved.
import sys
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '//old-english-sheepdog.glb'
RIG, MESH = 'Dog_Wolf_Rig_v01', 'Dog_Wolf_Mesh_v01'
TEXTURE = 2048

# name: (source deform bone, parent, reversed?, the joint it runs on to)
# A reversed bone runs from the source's tail to its head (Rigify's tail and
# tongue chains start at the tip). With no joint, it ends where the source does.
BONES = {
    'root': (None, None, False, None),
    'hips': ('DEF-spine.004', 'root', False, None),
    'spine': ('DEF-spine.005', 'hips', False, None),
    'spine1': ('DEF-spine.006', 'spine', False, None),
    'spine2': ('DEF-spine.007', 'spine1', False, None),
    'chest': ('DEF-spine.008', 'spine2', False, None),
    'neck': ('DEF-spine.009', 'chest', False, None),
    'neck1': ('DEF-spine.010', 'neck', False, None),
    'head': ('DEF-spine.011', 'neck1', False, None),
    'jaw': ('DEF-jaw', 'head', False, None),
    'tongue': ('DEF-tongue.002', 'jaw', True, None),
    'tongue1': ('DEF-tongue.001', 'tongue', True, None),
    'tongue2': ('DEF-tongue', 'tongue1', True, None),
    'tail': ('DEF-spine.003', 'hips', True, None),
    'tail1': ('DEF-spine.002', 'tail', True, None),
    'tail2': ('DEF-spine.001', 'tail1', True, None),
    'tail3': ('DEF-spine', 'tail2', True, None),
}
for s in ('L', 'R'):
    BONES.update({
        f'shoulder_{s}': (f'DEF-shoulder.{s}', 'chest', False, None),
        f'upperArm_{s}': (f'DEF-front_thigh.{s}', f'shoulder_{s}', False, f'DEF-front_shin.{s}'),
        f'forearm_{s}': (f'DEF-front_shin.{s}', f'upperArm_{s}', False, f'DEF-front_foot.{s}'),
        f'pastern_{s}': (f'DEF-front_foot.{s}', f'forearm_{s}', False, f'DEF-front_toe.{s}'),
        f'paw_{s}': (f'DEF-front_toe.{s}', f'pastern_{s}', False, None),
        f'thigh_{s}': (f'DEF-thigh.{s}', 'hips', False, f'DEF-shin.{s}'),
        f'shin_{s}': (f'DEF-shin.{s}', f'thigh_{s}', False, f'DEF-foot.{s}'),
        f'hock_{s}': (f'DEF-foot.{s}', f'shin_{s}', False, f'DEF-toe.{s}'),
        f'hindPaw_{s}': (f'DEF-toe.{s}', f'hock_{s}', False, None),
    })
# (three.js drops dots from node names, so the sides are _L and _R.)
# Vertex groups → bones. Anything weighted to a group not listed is an error.
GROUPS = {src: name for name, (src, *_rest) in BONES.items() if src}
GROUPS['root'] = 'hips'

scene = bpy.context.scene
rig, mesh = bpy.data.objects[RIG], bpy.data.objects[MESH]
assert rig.matrix_world.is_identity, 'The rig is expected at the origin, unrotated'
if rig.animation_data:
    rig.animation_data.action = None
src = rig.data.bones

# ---- Skeleton ----
arm_data = bpy.data.armatures.new('Dog')
arm = bpy.data.objects.new('Dog', arm_data)
scene.collection.objects.link(arm)
for o in bpy.context.view_layer.objects:
    o.select_set(False)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, (source, parent, flip, joint) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    if source is None:  # the root, on the ground under the hips, pointing forward (-Y)
        eb.head, eb.tail = Vector((0, 0, 0)), Vector((0, -0.2, 0))
    else:
        b = src[source]
        head, tail = (b.tail_local, b.head_local) if flip else (b.head_local, b.tail_local)
        eb.head, eb.tail = head.copy(), (src[joint].head_local.copy() if joint else tail.copy())
        eb.align_roll(b.matrix_local.to_3x3().col[2])
    eb.use_deform = True
for name, (_s, parent, _f, _j) in BONES.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# ---- Weights ----
me = mesh.data
old = {g.index: g.name for g in mesh.vertex_groups}
unknown = {old[g.group] for v in me.vertices for g in v.groups if g.weight > 0 and old[g.group] not in GROUPS}
assert not unknown, f'Weighted to groups with no bone: {sorted(unknown)}'
weights = []
for v in me.vertices:
    w = {}
    for g in v.groups:
        if g.weight > 0:
            bone = GROUPS[old[g.group]]
            w[bone] = w.get(bone, 0) + g.weight
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    total = sum(x for _, x in top)
    weights.append([(b, x / total) for b, x in top])
mesh.vertex_groups.clear()
groups = {name: mesh.vertex_groups.new(name=name) for name in BONES}
for i, w in enumerate(weights):
    for bone, x in w:
        groups[bone].add([i], x, 'REPLACE')
for m in list(mesh.modifiers):
    if m.type == 'ARMATURE':
        mesh.modifiers.remove(m)
mw = mesh.matrix_world.copy()
mesh.parent = arm
mesh.matrix_world = mw
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
mesh.name = 'Dog_Mesh'

# ---- Texture ----
mat = me.materials[0]
for n in list(mat.node_tree.nodes):
    if n.type == 'NORMAL_MAP':  # no image behind it
        mat.node_tree.nodes.remove(n)
tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
small = tex.image.copy()
small.name = 'old-english-sheepdog-basecolor'
small.scale(TEXTURE, TEXTURE)
tex.image = small
mat.name = 'Dog'

# ---- Export ----
for o in bpy.context.view_layer.objects:
    o.select_set(o in (arm, mesh))
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=bpy.path.abspath(OUT), export_format='GLB', use_selection=True,
    export_skins=True, export_influence_nb=4, export_animations=False, export_morph=False,
    export_yup=True, export_apply=False, export_image_format='JPEG', export_jpeg_quality=88,
    export_image_quality=88, export_materials='EXPORT', export_normals=True, export_tangents=False,
    export_cameras=False, export_lights=False, export_extras=False,
)
print(f'Exported {len(BONES)} bones, {len(me.vertices)} vertices to {OUT}')
