# 压缩素材开发包 · 给同事

这个包包含最新代码、Q90运行素材、手绘UI、开发文档、测试和配置模板。制作原稿、output目录、中间成品和历史压缩包不包含在内，不需要再解压或合并其他包。

## 启动

1. 安装Node.js 20.12或更新版本，无需安装npm依赖。
2. 进入解压后的 `roam-atelier` 文件夹，执行 `npm start`。
3. 打开终端打印的网址，默认 `http://127.0.0.1:4173/`。开发者时间控制台在 `/?developer=1`，手绘组件预览在 `/ui/painted/components.html`。

没有API配置也能运行。需要连接模型时，把 `.env.example` 复制为 `.env`，填写自己的密钥并重启服务。本包不含原作者的真实密钥或浏览器存档。

## 当前内容

20个场景、10套装扮、10种家具、400张交互动作帧、100件携带物品、20种照片风格预览，以及3张可拉伸手绘UI组件。游戏画面使用Q90压缩资源，尺寸和透明通道保持。少量旧PNG只用于兼容测试，安装图标和标准地图对照原件也保留；不包含整套制作原稿。

## 继续开发

`dist/` 是实际源文件和静态运行目录，不是可删除的临时构建目录。页面和交互在 `dist/app/main.js`、`views.js`，核心规则在 `dist/app/core/`，模型适配在 `dist/app/ai.js`，可选本地代理在 `server/dev.mjs`。

素材配置为 `dist/packs/reading-room/pack.json`；UI皮肤为 `dist/ui-skin.css` 与 `dist/ui/painted/`。先读 `docs/ARCHITECTURE.md`、`docs/ASSET-PACK-SPEC.md`、`docs/UI-SKIN.md` 和 `docs/Q90-RELEASE.md`。

```bash
npm test
npm run check
npm run package
```

现有测试和资源检查可直接运行。Python脚本用于可选的素材制作，需要另外准备原稿；文档中的output或旧机器绝对路径是原制作记录，不是启动依赖。不要拿Q90成品反复有损压缩。

继续保持现有约定：家具等比缩放，装扮为整套，动作帧完整合成人物与家具，A/B逐张生成；地图与现有布局不擅自重做。国家/省份专属默认旅行图库、公共云存档和UI素材包导入协议尚未扩展。当前交接用于继续开发，上架和公共部署另行决定。
