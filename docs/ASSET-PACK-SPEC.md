# 素材包规范 · version 2

本规范对应 `dist/app/core/pack.js` 和 `docs/pack.schema.json`。示例配置在 `dist/packs/reading-room/pack.json`。

## 三种不同的素材

- **装扮**：`outfits[]`，整套外观。`preview` 是只有人物的独立形象图，可用作衣橱缩略图和旅行生图参考。这里不包含家具。
- **家具**：`furniture[]`，独立家具定义。`empty` 是无人使用的家具图片，可以在任何场景放置、移动、缩放。
- **互动**：`furniture[].actions.<动作ID>.variants.<装扮ID>`，记录两者的关联。每帧是一张已经画好接触关系的“人物＋完整装扮＋家具＋道具”图片。

运行时，选中的家具实例在空家具图与完整互动图之间替换。装扮记录不因家具改变而变成另一套装扮。没有独立人物位移、骨骼挂点、帽子围巾叠图或行走动作。

## 包结构

ZIP 根目录放置 `pack.json`，以及它引用的图片文件。也可以附带 `PROMPTS.md`、`ASSET-METADATA.json`、`LICENSE.txt`。图片只能引用安全的包内相对路径，支持 PNG、JPG、WebP、GIF；不执行素材包里的脚本或 HTML。

推荐使用独立透明 PNG：**一张图片只放一帧，不把多种动作一起生成成网格图**。同一件家具的空图和所有互动帧保持相同画布尺寸、家具位置、视角与比例。

```json
{
  "version": 2,
  "id": "quiet-room",
  "name": "安静小屋",
  "character": {"id": "companion", "name": "小伴", "description": "原创形象描述"},
  "baseOutfitId": "base",
  "assets": {
    "room": {"src": "assets/room.png", "width": 1536, "height": 1024},
    "base": {"src": "assets/base-outfit.png", "width": 1024, "height": 1024},
    "chair": {"src": "assets/chair-empty.png", "width": 1024, "height": 1024},
    "readA": {"src": "assets/base-read-a.png", "width": 1024, "height": 1024},
    "readB": {"src": "assets/base-read-b.png", "width": 1024, "height": 1024}
  },
  "outfits": [{"id": "base", "name": "自在原色", "preview": {"asset": "base"}}],
  "furniture": [{
    "id": "chair", "name": "阅读椅",
    "empty": {"asset": "chair"},
    "canvas": {"width": 1024, "height": 1024},
    "pivot": [0.5, 0.94], "defaultWidth": 0.3,
    "actions": {
      "read": {"name": "轻轻翻书", "variants": {
        "base": {"frames": [
          {"asset": "readA", "duration": 4000},
          {"asset": "readB", "duration": 1200}
        ]}
      }}
    }
  }],
  "scenes": [{
    "id": "room", "name": "小屋", "background": "room",
    "width": 1536, "height": 1024,
    "placements": [{"id": "room-chair", "furnitureId": "chair", "x": 0.5, "y": 0.78, "width": 0.3, "z": 20}]
  }],
  "items": [], "postcards": [],
  "defaults": {"travelMinutes": 120, "frequencyMinutes": 360, "activityMinMinutes": 3, "activityMaxMinutes": 8}
}
```

这是结构示例，尺寸必须填写实际图片尺寸。

## 位置与播放

`placements[].x/y` 是场景宽高的比例；`width` 是家具统一画布占场景宽度的比例。`pivot` 是这块画布的定位点，空家具与互动图始终共用。`z` 控制整件物体的前后顺序；`flip` 可以水平翻转整件物体。任意宽高比的背景都支持平移、缩放与完整适配，固定 UI 不参与场景缩放。

每帧 `duration` 单位为毫秒，省略为 3000。动作可以只有一张静态图，也可以按指定时长循环数张图。建议长时间维持主姿态，再短暂翻一页书或抿一口茶。

`rect: [x,y,width,height]` 仍可读取作者已有的图集；`registration: {x,y,width,height}` 可将素材映射进统一画布，数值以画布比例计。这两项是兼容导入的高级字段，新动作逐张生成；整体画布偏移可通过 registration 统一地面锚点，宽高缩放比例必须一致。家具局部形变、缺失或裁切仍需修复对应原图。

家具可选 `shadow: {x,y,width,height,opacity}` 表示统一地面软阴影；数值均为 0–1，阴影不会随动作帧跳动。图中已经画好地面阴影时可省略。

## 回退与扩展

每个动作都必须提供 `baseOutfitId` 对应的基础版本。其他装扮可以逐步补齐。缺少“所选装扮 × 此家具动作”时，使用此动作的基础版本；`selectedOutfitId` 保持不变，素材面板会注明回退。

新增家具时，先提供空家具和基础装扮的互动。新增装扮时，先提供独立形象图，再补齐它在不同家具上的动作。`actions: {}` 是可布置但不能互动的装饰物。

完整适配时，互动组数为：`装扮数量 × Σ每件家具的实际动作数`。实际图片数为各互动组的帧数之和，另外加上独立装扮图、空家具图和背景。没有提供的可选组合不会凭空增加图片。

## 随身物品与旅行

`items[]` 只有随身物品，不使用穿戴 `slot`。每项有 `id/name/sprite`，可附带 `description/tags`。物品与装扮的文字描述影响旅行规划；物品不自动叠加到日常人物身上。

示例明信片使用 `postcards[].sprite`。素材包默认参数只能设置旅行时长、休息频率、活动停留区间与是否跨场景活动，不能带 API 密钥或替用户开启付费调用。

## 导入、校验和限制

「设置 → 开发者设置 → 素材管理」可导入整包，也可分别导入空家具、独立装扮、背景及一组互动帧。导入互动帧时可多选图片，按文件名自然排序；例如 `read-01.png`、`read-02.png`。同组图片须尺寸一致，并与家具画布宽高比相同。逐帧不同播放时长可在完整配置中修改。

最多 1024 个图片资源；每类最多 100 个定义；每场景最多 100 个家具实例；每家具最多 50 个动作；每个组合最多 100 帧。单张不超过 30MB，边长不超过 16384；ZIP 最多 1500 个文件、解压后合计 512MB。数量上限容纳完整互动素材、228 张旅行图及个人照片；实际导入会检查路径、尺寸、引用、基础回退和重复 ID。

第一版分层资源包不能直接作为第二版互动包使用，需要重新制作互动图。旧版完整存档可以迁移照片和旅行记录，旧人物位置与装备叠图配置不会继续执行。


## 商店与家装

`outfits[]`、`items[]`、`furniture[]`、`scenes[]` 都可以配置非负整数 `price`，单位为游戏金币。缺省价格依次为360、120、300、1200。示例首次进入有9999金币，默认外观、一个起始地点和场上的初始家具已经拥有。

装扮、随身物品和地点购买一次后解锁；家具按件购买，拥有数量分为场上数量和仓库数量。收回仓库不退金币，可以再次摆放。场上至少留一件家具，不能收走最后一件。

家装只显示已购买的地点。选择新地点会保留全部家具实例的位置、大小与当前互动，并更换背景；它不改变旅行目的地或到访次数。商店地点是生活场景，出发地图里的旅行目的地无需购买。

素材作者在开发者设置中直接导入的资源归作者拥有；发布素材包后，新玩家仍按包内价格购买。更新前已经穿戴、携带或摆放的内容会在旧存档升级时保留。金币和库存与完整存档一同导入导出，不连接真实支付服务。


## 默认旅行照片与金币来信

`destinationPhotos` 按国家或中国省级地区 ID 指向图片资源 ID；`defaultPhotoAsset` 是暂未补图时的共用示例图。没有配置生图 API 时，旅行按目的地读取默认照片。同一地点保持同一张默认图，不重新随机选图。

```json
{
  "defaultPhotoAsset": "postcard-lake",
  "destinationPhotos": {
    "NZ": "default-new-zealand",
    "CN-11": "default-beijing"
  },
  "defaults": {
    "directedTripCost": 100,
    "coinMailMinutes": 30,
    "coinMailAmount": 50
  }
}
```

上面两个目标素材需要另行在 `assets` 声明并提供文件。当前内置包已包含 228 张目的地专属旅行插画，对应地图全部目的地；文件和提示词记录在 `TRAVEL-PHOTOS.json`。ZIP 总大小仍受 512MB 限制，制作时应控制图片体积。

免费旅行在有效目的地中均匀随机。地图选点只用于浏览；选择付费指定并成功出发时才扣金币。文字与图片 API 不参与是否付费和目的地抽取。

旅行内每隔 `coinMailMinutes` 分钟寄回 `coinMailAmount` 金币。出发时固定该程寄送规则，途中改设置不影响已经开始的旅程。离线归来按实际旅行时长补发，每个旅程保存已寄出的次数，不重复发放。


## 自动行程默认值

可在 `defaults` 中设置 `travelMinMinutes/travelMaxMinutes`（默认60/180）、`restMinMinutes/restMaxMinutes`（默认5/15）、`journeyMinNodes/journeyMaxNodes`（默认1/3）。普通用户不填写旅行时长，开发者可查看当前旅程的实际归来时间和完整节点计划。

每个节点共享整趟旅行的角色、服装参考图、物品、故事和画面连续性；文字模型一次规划完整行程，图像按节点依次生成。失败使用本地节点文案与默认照片，正常页面不弹 AI 错误。地区默认图库仍未生成。


## 照片风格默认值

可用 `defaults.photoStyleId` 设置照片风格，缺省为 `pack-default`（使用本包的 `stylePrompt`）。20种可用ID见 `app/core/photo-styles.js`。该设置只影响之后出发的旅行生成图，不重绘默认照片或既有旅程。风格预览图属于前端程序资源，不要加入本包参考图或上传给模型。
