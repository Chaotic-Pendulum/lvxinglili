# Q90游戏发布 · 2026-09-11

用户查看原尺寸对比后批准统一使用Q90。456张包内图片、20张照片风格预览及网页图标共477张已转换。保持原尺寸，不裁切、不重新抠图，完整alpha逐像素一致；RGB为有损压缩。原始PNG、无损母稿及转换前运行素材另行保留。

编码参数：WebP quality=90、lossless=False、method=6、alpha_quality=100、exact=True，ICC如有则保留。此次所有源图均无ICC。独立复核覆盖750105444像素，477张全部通过；总体积511879118→92513790字节。核心素材包图片443226097→81394250字节。

## 当前内容

20个生活场景、10套装扮、10种家具、400张互动帧、100件携带物品。包内保持asset ID、rect、registration及逻辑画布，只有图片src改为assets/q90路径。旧内置存档刷新后按已知原定义迁移；自定义资源路径、不同base、源或目标Blob均受保护，家具布局、选择和旅行进度不变。

20张风格图仍仅供前端显示，AI只收到风格文字。网页图标使用Q90；安装用PNG兼容图标、两张标准地图对照原件和矢量地图资料保留，不做再编码。

## 交付文件

- roam-atelier-game-q90.zip：完整可玩静态网站，只包含当前运行素材。用HTTP服务打开。
- reading-room.roampack.zip：可在设置中导入的Q90素材包。
- roam-atelier-source.zip：当前Q90网站、源码、可选API代理、测试及兼容检查需要的少量旧PNG。
- 制作原稿另存于output，原私密迁移ZIP是压缩前快照。本轮未重新打入制作原稿或真实.env。

## 再次制作

先生成原稿和无损透明母稿，发布时从原稿单次编码；禁止从Q90成品再次有损压缩。scripts/encode-q90-pack.py支持--project-root、--before-pack、--output-root、可选--source-root。本次清单在output/q90-release-20260911/before-pack.json，原资源根在同目录originals/pack。scripts/integrate-q90-release.py接入已验证输出。运行游戏与Node测试无需Python，只有素材制作脚本需要Pillow。

Q90-ASSETS.json是当前发布素材的哈希、尺寸和alpha验证记录；ASSET-METADATA.json、EXPANSION-ASSETS.json和SCENE-ASSETS.json保留制作阶段原稿/无损版本的出处，不能把这些历史记录误认为Q90仍是RGB无损。
