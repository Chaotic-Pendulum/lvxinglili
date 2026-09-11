# 手绘UI皮肤

当前皮肤只改变视觉材质。导航位置、按钮尺寸/点击区域、面板布局、表单操作、家具布置与旅行逻辑沿用原实现。地图页面及地图内部控件明确排除在换肤规则外；地图文件和atlas.css未修改。

## 三个可复用组件

- paper-panel：暖象牙纸面板，用于窗口、卡片和HUD底板。
- button-neutral：浅木边框、奶油纸中心的次要按钮。
- button-primary：苔绿涂漆、浅木边框的主按钮。

三张均由内置image_gen单独生成，不含文字或图标。原始PNG为真实alpha；运行版仅裁去外围透明空白，保留主体及透明通道，按用户批准的Q90编码。原稿与完整提示词在output/ui-skin-20260911/originals，运行文件和切割参数在dist/ui/painted/manifest.json。当前三张共395464字节。

## 调节

打开 ui/painted/components.html 可试按钮宽度、面板宽度和边框厚度，设置只作用于预览，不改游戏存档。游戏使用dist/ui-skin.css；开头的变量集中定义贴图、九宫格切线和显示边框宽度。

`--ui-panel-edge` 控制大面板边框，`--ui-hud-edge` 控制首页小底板，`--ui-button-edge` 控制普通按钮，`--ui-dock-edge` 控制六个导航按钮。更换贴图时，在manifest中记录尺寸与slice，并同步相应CSS变量。角区保持固定大小，中间和边缘拉伸；不要把整张按钮图当作普通背景任意拉长。

目前皮肤是独立界面资源，未加入角色/家具素材包的导入协议。文字、原SVG图标和点击事件保持HTML控制。未新增普通玩家设置或改动布局。删除index.html最后的ui-skin.css引用即可恢复旧外观；原有样式文件保留。

## 验证

游戏包和源码包会包含三张UI运行图，制作原稿不进入玩家包。Service Worker缓存皮肤文件，scripts/check.mjs核对尺寸和哈希。UI换肤不会重新生成地图或使用用户API Key。
