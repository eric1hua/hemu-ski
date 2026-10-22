# 云霄峰山顶站位资料

**最新施工依据：[`v04/CLAUDE-CODE-v04.md`](v04/CLAUDE-CODE-v04.md)。**
用户在v03两张图上补充了6号的明确箭头，v04只据此修正6号；其余类别沿用v03。

定位资料背景：[`v03/README.md`](v03/README.md)。用户指出v02 AI总览布局错误后，
v03改用原照片、39个原箭头端点和四视角校核；6号以用户指定的夏季俯拍为准。
v02 AI总览保留为历史输出，停止用作位置或地形施工依据。

造型参考见 [`v02/README.md`](v02/README.md)：四视角标注、九类物体，新增项目风格
山顶总览与九格造型板，以及更新后的 Claude Code 施工说明。下述七物体资料为历史 v01。

给 Claude Code 的游戏地形与占位模型施工包，来源为项目 Cowart
「吉克普林云霄峰地形重建」页面的两张照片及用户原编号。

- `summit-layout-v01.png`：站位、地形关系、占位体块及两视角编号对照。
- `CLAUDE-CODE-v01.md`：可直接交给 Claude Code 的任务与验收说明。
- `layout-v01.json`：七个物体的稳定 ID、建议体块、未校准关系坐标和游戏锚点。
- `reference-pins-v01.json`：原图坐标与 Cowart 标注来源记录。
- `build-board.py`：本地 Pillow 绘图，无生成 API；默认拒绝覆盖已有版本。

此包仅为施工草案，尚未改游戏、改地形或生成正式 3D 模型。
照片投影坐标、体块尺寸和高差不代表实测数据，见施工说明的事实边界。

重新绘制时使用包含 Pillow 的 Python：

```sh
python3 tools/summit-layout/build-board.py --version v02
```

原参考图仍留在 Cowart 的 `canvas/pages/<page-id>/assets/`，脚本只读取。
该目录属于 production，不加入 Vite build 入口，不供游戏运行时导入。

画布后来补充的 object 7 夏季建筑近照已记入施工说明，未改动该原图。
