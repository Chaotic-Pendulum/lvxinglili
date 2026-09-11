import { gameNow, clockOffset, nextGameEvent } from "./core/clock.js";
import {
  PHOTO_STYLES,
  PACK_STYLE_ID,
  photoStyleSnapshot,
} from "./core/photo-styles.js";
import { PHOTO_STYLE_PREVIEWS } from "./photo-style-previews.js";
import {
  COUNTRIES,
  PROVINCES,
  destinationName,
  countryName,
  destinationById,
} from "./core/catalog.js";
import { icon, button, esc, date, timeLeft } from "./util.js";
import {
  directedTripPrice,
  apiAvailability,
  travelApiPolicy,
} from "./core/travel.js";
import { findJourneyNode } from "./core/itinerary.js";
import { resolveActivity } from "./core/engine.js";
import { owns, furnitureAvailable, priceOf } from "./core/economy.js";
import { spriteHtml } from "./scene.js";
import { visitCount, photosForRegion } from "./core/atlas.js";

export function destinationOptions(selected = "", includeAuto = true) {
  return `${includeAuto ? '<option value="">交给旅途的灵感</option>' : ""}<optgroup label="中国 · 省级地区">${PROVINCES.map((d) => `<option value="${d.id}" ${selected === d.id ? "selected" : ""}>${d.name}</option>`).join("")}</optgroup><optgroup label="世界各地">${COUNTRIES.filter(
    (c) => c.id !== "CN",
  )
    .map(
      (d) =>
        `<option value="${d.id}" ${selected === d.id ? "selected" : ""}>${d.name}</option>`,
    )
    .join("")}</optgroup>`;
}
export function shell(app, content) {
  const active = app.tab === "atlas" ? "gallery" : app.tab;
  const tabs = [
    ["bag", "装备", "bag"],
    ["travel", "出发", "arrow"],
    ["gallery", "相册", "photo"],
    ["studio", "家装", "home"],
    ["shop", "商店", "shop"],
    ["settings", "设置", "settings"],
  ];
  return `<div class="world-shell ${app.tab === "studio" ? "is-editing" : ""}">${sceneCard(app, app.tab === "studio")}<header class="world-header"><button class="brand world-brand" data-tab="home" aria-label="回到生活画面"><span class="brand-mark">${icon("leaf", 24)}</span><span class="brand-title">漫游工坊</span></button><div class="world-status"><button class="coin-balance" data-action="coin-mail" aria-label="金币来信，${app.state.economy.coins} 金币">${icon("coin", 18)} <b data-coins>${app.state.economy.coins.toLocaleString("zh-CN")}</b></button><span data-save-label class="save-status">本地保存</span></div></header><nav class="game-dock" aria-label="主导航">${tabs.map(([id, label, ico]) => `<button class="dock-item ${id === active ? "active" : ""}" data-tab="${id}" aria-current="${id === active ? "page" : "false"}"><span>${icon(ico, 23)}</span><small>${label}</small></button>`).join("")}</nav>${app.tab === "home" || app.tab === "studio" ? content : `<section class="workspace-overlay" aria-label="${esc(tabs.find((t) => t[0] === active)?.[1] || "相册")}"><button class="overlay-close" data-tab="home" aria-label="收起面板">${icon("close", 22)}</button><div class="overlay-content">${content}</div></section>`}</div><dialog id="modal" class="modal"></dialog>`;
}
const heading = (eye, title, sub = "", tools = "") =>
  `<div class="page-top"><div><div class="eyebrow">${eye}</div><h1>${title}</h1>${sub ? `<div class="page-subline">${sub}</div>` : ""}</div><div class="page-tools">${tools}</div></div>`;
export function sceneCard(app, editing = false) {
  return `<div class="scene-card ${editing ? "editing" : ""}"><div class="scene-viewport" id="scene" aria-label="可拖动和缩放的场景"></div>${app.state.currentTrip && !editing ? `<div class="trip-away"><h3>${esc(app.state.companionName)}出门啦</h3><p>正在去${esc(app.state.currentTrip.destinationName)}的路上</p></div>` : ""}<div class="scene-footer"><div class="camera-tools"><button class="btn" data-action="zoom-out" aria-label="缩小画面">${icon("minus", 16)}</button><span data-zoom-label>100%</span><button class="btn" data-action="zoom-in" aria-label="放大画面">${icon("plus", 16)}</button><button class="btn" data-action="fit" aria-label="填充画面" title="恢复铺满画面">${icon("expand", 16)}</button></div></div></div>`;
}
export function activityName(app) {
  if (app.state.currentTrip) return "正在旅行";
  const active = resolveActivity(app.pack, app.state);
  if (!active) return "等待一个舒服的角落";
  const scene = app.pack.scenes.find(
    (s) => s.id === app.state.activity.sceneId,
  );
  return `${scene?.name || ""} · ${active.action.name}`;
}
export function card(app, photo) {
  const src = photo.demo
    ? app.resolve(app.pack.assets[photo.sprite.asset].src)
    : app.mediaUrls[photo.imageId] ||
      (photo.sampleAsset
        ? app.resolve(app.pack.assets[photo.sampleAsset].src)
        : photo.remoteUrl);
  return `<button class="postcard" data-photo="${esc(photo.id)}" data-demo="${photo.demo ? "1" : ""}">${src ? `<img src="${esc(src)}" alt="${esc(photo.title || "一段回忆")}" loading="lazy">` : `<div class="postcard-pending">${icon("photo", 28)}<span>等待一张来信</span></div>`}<div class="postcard-meta"><span>${esc(photo.title || photo.destinationName || "一段回忆")}</span><small>${photo.demo ? "示例插画" : photo.sampleAsset && !photo.imageId ? "默认照片 · " + date(photo.completedAt || Date.now()) : date(photo.completedAt || photo.createdAt || Date.now())}</small></div>${photo.nodeId ? `<p class="letter-caption">${esc(photo.reason || "")}</p>` : ""}</button>`;
}
export function homeView(app) {
  const s = app.state,
    t = s.currentTrip;
  const letters =
    t?.itinerary?.nodes.filter((n) => n.deliveredAt != null) || [];
  const message = letters[letters.length - 1]?.message;
  return `<div class="companion-note"><div class="companion-name">${icon(t ? "globe" : "coffee", 18)}<strong>${esc(s.companionName)}</strong><span data-activity>${esc(activityName(app))}</span></div>${t ? `<p>${esc(message || "它会自己安排旅程，等一封远方的来信。")}</p><p data-mail-progress>已寄回 ${t.coinsReceived || 0} 金币${letters.length ? ` · ${letters.length}封来信` : ""}</p>` : `<p>${s.settings.autoTravel ? "休息一会儿，还会自己出门看看。" : "正在家里安静休息。"}</p>`}</div>`;
}
export function bagView(app) {
  const state = app.state,
    outfits = app.pack.outfits.filter((o) => owns(state, "outfits", o.id)),
    items = app.pack.items.filter((i) => owns(state, "items", i.id));
  const itemCard = (item) => {
    const selected = state.backpack.includes(item.id);
    return `<button class="item-card ${selected ? "chosen" : ""}" data-carry="${item.id}" aria-pressed="${selected}"><div class="item-art">${spriteHtml(app.pack, item.sprite, app.resolve, "", item.name)}</div><strong>${esc(item.name)}</strong><p>${esc(item.description || "")}</p><span class="item-choice">${icon(selected ? "check" : "plus", 14)} ${selected ? "已携带" : "带上它"}</span></button>`;
  };
  return (
    heading("", "装备", "选一套装扮，带上喜欢的东西。") +
    `<section class="section-block"><div class="section-heading"><h2>整套装扮</h2><small>一次穿一套</small></div><div class="items-grid equipment-grid">${outfits.map((o) => `<button class="item-card ${state.selectedOutfitId === o.id ? "chosen" : ""}" data-outfit="${o.id}" aria-pressed="${state.selectedOutfitId === o.id}"><div class="item-art outfit-art">${spriteHtml(app.pack, o.preview, app.resolve, "", o.name)}</div><strong>${esc(o.name)}</strong><p>${esc(o.description || "")}</p><span class="item-choice">${icon(state.selectedOutfitId === o.id ? "check" : "plus", 14)} ${state.selectedOutfitId === o.id ? "正在穿" : "换上这套"}</span></button>`).join("")}</div></section><section class="section-block"><div class="section-heading"><h2>随身物品</h2><small>已携带 ${state.backpack.length} / 8</small></div>${items.length ? `<div class="items-grid equipment-grid">${items.map(itemCard).join("")}</div>` : '<div class="small-empty">还没有随身物品，去商店挑一件喜欢的吧。</div>'}</section>`
  );
}
export function travelView(app) {
  return atlasView(app);
}
export function departureFormView(app) {
  const s = app.state,
    destination = destinationById(
      app.selectedDestination || app.selectedRegion,
    );
  const directed = app.departureChoice === "directed" && Boolean(destination),
    fee = directedTripPrice(s.settings);
  const api = travelApiPolicy(s, app.secrets, app.runtime);
  return `<form id="travel-form"><input type="hidden" name="destinationId" value="${destination?.id || ""}"><fieldset class="departure-options"><legend>这次怎么出发</legend><label><input type="radio" name="destinationMode" value="random" ${!directed ? "checked" : ""}><span><strong>随机目的地 <em>免费</em></strong><small>随机选择一个国家或中国省份</small></span></label>${destination ? `<label><input type="radio" name="destinationMode" value="directed" ${directed ? "checked" : ""}><span><strong>指定${esc(destination.name)} <em>${fee} 金币</em></strong><small>成功出发时扣除金币</small></span></label>` : '<p class="field-help">想指定地点，可以先在地图上选中它。</p>'}</fieldset><label class="field">给旅途的一句话<textarea name="instruction" rows="2" maxlength="1000" placeholder="记得喝点热茶，拍一张喜欢的风景。">${esc(app.instruction)}</textarea></label><p class="trip-photo-mode">它会自己决定旅行多久、沿途停在哪里。${api.image ? "沿途会寄来同一段行程里的话语和新照片。" : "沿途使用本地来信与地点默认照片。"}</p><p class="field-help">旅途中定期寄回金币。平时不用操作，它也会自动出门。</p><button class="btn primary full" type="submit" ${s.currentTrip || app.busy || (directed && s.economy.coins < fee) ? "disabled" : ""}>${icon("arrow", 18)} ${directed ? `花费 ${fee} 金币出发` : "免费随机出发"}</button></form>`;
}
export function journeyNodeView(app, trip, node) {
  const pending = ["queued", "generating", "scheduled"].includes(
    node.imageStatus,
  );
  const source =
    app.mediaUrls[node.imageId] ||
    (!pending && node.sampleAsset && app.pack.assets[node.sampleAsset]
      ? app.resolve(app.pack.assets[node.sampleAsset].src)
      : "");
  return `${source ? `<img class="detail-photo" src="${esc(source)}" alt="${esc(node.place)}">` : '<div class="detail-placeholder"><p>照片还在路上。</p></div>'}<div class="detail-meta"><span class="tag">${esc(trip.destinationName)}</span><small>${date(node.deliveredAt || Date.now())}</small></div><p class="journey-letter-message">${esc(node.message)}</p>${!node.imageId && !pending ? '<p class="field-help">地区默认照片</p>' : ""}${!node.imageId && !pending && apiAvailability(app.state.settings, app.secrets, app.runtime).image ? button("generate-node-photo", "生成这一张新照片（API）", "spark", "small", `data-id="${node.id}"`) : ""}`;
}
export function journeyDiaryView(app, trip) {
  const nodes = trip.itinerary.nodes.filter((n) => n.deliveredAt != null),
    active = app.state.currentTrip?.id === trip.id;
  return `<p class="subtle">${active ? "它正在自己的旅程里，新的来信会慢慢寄到。" : "这一程已经结束，来信都收在这里。"}</p><p class="field-help">本程寄回 ${trip.coinsReceived || 0} 金币</p>${nodes.length ? `<div class="journey-diary">${nodes.map((node) => `<article>${journeyNodeView(app, trip, node)}</article>`).join("")}</div>` : '<p class="small-empty">刚刚出门，还没有来信。去忙自己的事吧。</p>'}`;
}
export function coinMailView(app) {
  const letters = app.state.coinLetters || [];
  return `<p class="mail-balance">当前金币 <strong>${app.state.economy.coins.toLocaleString("zh-CN")}</strong></p><p class="field-help">旅行途中定期寄回，离线时应收到的来信会在回来后补上。</p>${letters.length ? `<div class="coin-letters">${letters.map((letter) => `<article><div><strong>${esc(letter.destinationName)}的来信</strong><small>${date(letter.receivedAt)} ${new Date(letter.receivedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}${letter.count > 1 ? ` · ${letter.count}封合并` : ""}</small></div><b>+${letter.coins}</b></article>`).join("")}</div>` : '<p class="small-empty">还没有金币来信。去旅行吧，等一封远方的问候。</p>'}`;
}
export function shopView(app) {
  const labels = {
      outfits: "装扮",
      items: "随身物品",
      furniture: "家具",
      scenes: "地点",
    },
    category = app.shopCategory || "outfits";
  return (
    heading(
      "",
      "商店",
      "添一点喜欢的东西。",
      `<span class="shop-wallet">${icon("coin", 22)} <b>${app.state.economy.coins.toLocaleString("zh-CN")}</b> 金币</span>`,
    ) +
    `<div class="segmented shop-tabs" aria-label="商品分类">${Object.entries(
      labels,
    )
      .map(
        ([id, name]) =>
          `<button data-shop-category="${id}" class="${category === id ? "active" : ""}" aria-pressed="${category === id}">${name}</button>`,
      )
      .join("")}</div><div class="shop-grid">${app.pack[category]
      .map((product) => {
        const price = priceOf(app.pack, category, product.id),
          owned = owns(app.state, category, product.id),
          sold = category !== "furniture" && owned,
          poor = app.state.economy.coins < price;
        const frame =
          category === "outfits"
            ? product.preview
            : category === "items"
              ? product.sprite
              : category === "furniture"
                ? product.empty
                : { asset: product.background };
        const background = category === "scenes" ? app.pack.assets[product.background] : null;
        const art = background
          ? `<img class="scene-preview" src="${esc(app.resolve(background.src))}" alt="${esc(product.name)}" width="${background.width}" height="${background.height}" loading="lazy" decoding="async" draggable="false">`
          : spriteHtml(app.pack, frame, app.resolve, "", product.name);
        return `<article class="shop-card ${category === "scenes" ? "shop-location" : ""}"><div class="shop-art">${art}</div><div class="shop-copy"><h2>${esc(product.name)}</h2><p>${esc(product.description || { furniture: "把喜欢的角落，慢慢布置好。", scenes: "换一处风景，继续慢慢生活。" }[category] || "")}</p>${category === "furniture" ? `<small>已拥有 ${app.state.economy.owned.furniture[product.id] || 0} 件 · 仓库 ${furnitureAvailable(app.state, product.id)} 件</small>` : ""}<button class="btn ${sold ? "quiet" : "primary"} full" data-buy-category="${category}" data-buy-id="${product.id}" ${sold || poor || app.busy ? "disabled" : ""} aria-label="${sold ? "已拥有" : poor ? "金币不足，无法购买" : "购买"}${esc(product.name)}${sold ? "" : `，${price} 金币`}">${sold ? icon("check", 17) : icon("coin", 17)} ${sold ? "已拥有" : poor ? "金币不足" : `${price} 金币 · 购买${category === "furniture" ? "一件" : ""}`}</button></div></article>`;
      })
      .join("")}</div>`
  );
}

export function atlasView(app) {
  const china = app.atlasMode === "china";
  const entries = china ? PROVINCES : COUNTRIES;
  const count = (id) => visitCount(app.state.visits, id);
  const filtered = entries.filter(
    (d) =>
      (!app.atlasSearch ||
        d.name.toLowerCase().includes(app.atlasSearch.toLowerCase()) ||
        d.id.toLowerCase().includes(app.atlasSearch.toLowerCase())) &&
      (!app.visitedOnly || count(d.id) > 0),
  );
  const sorted = [...filtered].sort((a, b) => count(b.id) - count(a.id));
  const selected = app.selectedRegion;
  const photos = photosForRegion(app.photos(), selected);
  const selectedName =
    selected === "CN" ? "中国" : selected ? destinationName(selected) : "";
  const visited = entries.filter((entry) => count(entry.id) > 0).length;
  return (
    '<div class="atlas-page">' +
    heading(
      "A WORLD OF LITTLE MEMORIES",
      app.tab === "travel" ? "下一程，去哪里？" : "走过的地方，会记得。",
      `${Object.keys(app.state.visits).length} 个目的地 · ${app.state.trips.length} 段已完成旅程`,
      button(
        "prepare",
        app.tab === "travel"
          ? app.state.currentTrip
            ? "查看当前旅程"
            : "免费随机出发"
          : "计划下一程",
        "bag",
        "primary",
      ),
    ) +
    `<div class="atlas-layout">
      <main class="atlas-main">
        <div class="atlas-map-header">
          <div class="segmented" role="group" aria-label="地图范围"><button data-atlas-mode="world" aria-pressed="${!china}" class="${china ? "" : "active"}">${icon("globe", 15)} 世界</button><button data-atlas-mode="china" aria-pressed="${china}" class="${china ? "active" : ""}">中国 · 省级地区</button></div>
          <span class="atlas-progress"><strong>${visited}</strong> / ${entries.length} ${china ? "个省级地区" : "个目的地"}</span>
        </div>
        <div class="native-map ${china ? "is-china" : "is-world"}" data-native-map aria-busy="true"><div class="atlas-load-state" role="status">${icon("globe", 30)}<p>展开旅行地图…</p></div></div>
        <div class="atlas-map-footer"><div class="atlas-legend" aria-label="地图图例"><span><i></i>未到访</span><span><i class="visited"></i>已到访</span><span><i class="selected"></i>当前选择</span></div><button class="tiny-link atlas-source" data-action="map-source">${icon("info", 13)} 地图资料</button></div>
        <p class="atlas-map-hint">${icon("move", 13)} 拖动探索 · 滚轮或双指缩放 · 点击地点查看来信</p>
        <section class="atlas-memories"><div class="section-heading"><h2>${selected ? esc(selectedName) + "的来信" : "地图上的来信"}</h2>${selected ? button("clear-region", "全部地点", "reset", "quiet small") : `<small>${photos.length} 封回忆</small>`}</div>${photos.length ? `<div class="postcard-row">${photos.map((p) => card(app, p)).join("")}</div>` : `<div class="atlas-empty-memory">${icon("photo", 25)}<div><strong>${selected ? "这个地方的故事，还等你去写。" : "第一封来信，会从哪里寄来？"}</strong><span>${selected ? "完成旅程后，回忆会出现在这里。" : "在地图上选一个地方，准备下一段旅程。"}</span></div></div>`}</section>
      </main>
      <aside class="region-panel atlas-sidebar">
        <div class="atlas-selection ${selected ? "has-selection" : ""}"><span class="atlas-selection-icon">${icon("pin", 20)}</span><div><small>${selected ? "地图上的一站" : "下一程的灵感"}</small><h2>${selected ? esc(selectedName) : "想去哪里走走？"}</h2><p>${selected ? `${count(selected)} 次到访 · ${photos.length} 封来信` : "点选地图，或在下面寻找。"}</p></div>${selected && selected !== "CN" ? `<button class="btn small primary" data-action="atlas-prepare">指定此地 · ${directedTripPrice(app.state.settings)} 金币 ${icon("arrow", 15)}</button>` : selected === "CN" ? (china ? '<span class="atlas-select-province">继续选一个省级地区</span>' : '<button class="btn small" data-region="CN">查看省级地区</button>') : ""}</div>
        <div class="panel-heading"><h2>${china ? "省级地区" : "世界目的地"}</h2><label class="check-label"><input type="checkbox" id="visited-only" ${app.visitedOnly ? "checked" : ""}> 已到访</label></div>
        <div class="atlas-search">${icon("pin", 15)}<input type="search" id="region-search" class="search-input" placeholder="寻找${china ? "省级地区" : "国家"}…" value="${esc(app.atlasSearch)}" aria-label="搜索目的地"></div>
        <div class="region-list">${sorted.map((d) => `<button class="region-row ${selected === d.id ? "active" : ""}" data-region="${d.id}" aria-pressed="${selected === d.id}"><span><i class="region-dot ${count(d.id) ? "is-visited" : ""}"></i>${esc(d.name)}</span><span class="visit-count ${count(d.id) ? "has-visits" : ""}">${count(d.id) || "—"}</span>${d.id === "CN" ? icon("arrow", 13) : ""}</button>`).join("") || '<p class="atlas-list-empty">没有符合条件的地点</p>'}</div>
      </aside>
    </div></div>`
  );
}

export function galleryView(app) {
  const photos = app.photos();
  return (
    heading(
      "KEEP THE MOMENTS",
      "回忆，慢慢装满。",
      `${photos.length} 条记录 · 旧照片与新来信，都有自己的位置。`,
      button("import-memory", "导入旧回忆", "upload", "primary"),
    ) +
    `<div class="gallery-grid">${photos.map((p) => card(app, p)).join("")}</div>${!photos.length ? '<div class="empty-gallery">' + icon("photo", 42) + "<h2>第一张回忆，从这里开始</h2><p>导入一张旧照片，或者等伙伴带回第一封旅行来信。</p>" + button("import-memory", "选择照片", "upload", "primary") + "</div>" : ""}${app.pack.postcards?.length ? `<section class="recent-section"><div class="section-heading"><h2>素材包里的小风景</h2><small>原创示例 · 不计入到访次数</small></div><div class="postcard-row">${app.pack.postcards.map((p) => card(app, { ...p, demo: true })).join("")}</div></section>` : ""}`
  );
}

export function furnitureToolbar(app) {
  const placement = app.state.layouts[app.state.viewSceneId]?.find(p => p.id === app.selection?.id);
  if (!placement) return "";
  const name = app.pack.furniture.find(f => f.id === placement.furnitureId)?.name || "家具";
  return `<strong>${esc(name)}</strong><button type="button" class="btn painted-button" data-action="shrink-selection" aria-label="缩小选中家具">${icon("minus", 16)}</button><input type="range" data-furniture-width aria-label="选中家具大小百分比" min="2" max="100" step="0.1" value="${placement.width * 100}"><button type="button" class="btn painted-button" data-action="enlarge-selection" aria-label="放大选中家具">${icon("plus", 16)}</button><output data-size-label>${Number((placement.width * 100).toFixed(1))}%</output>`;
}
export function selectionPanel(app) {
  const list = app.state.layouts[app.state.viewSceneId] || [],
    entity = list.find((p) => p.id === app.selection?.id);
  const picker = `<div class="placed-selection-list">${list.map((p, index) => `<button class="btn small ${p.id === entity?.id ? "primary" : ""}" data-select-placement="${p.id}">${esc(app.pack.furniture.find((f) => f.id === p.furnitureId)?.name || "家具")} ${index + 1}</button>`).join("")}</div>`;
  if (!entity)
    return `<p class="field-help">点击画面中的家具，或从这里选择。</p>${picker}`;
  const furniture = app.pack.furniture.find((f) => f.id === entity.furnitureId);
  const last = list.length <= 1;
  return `${picker}<form id="inspector-form"><input type="hidden" name="id" value="${entity.id}"><input type="hidden" name="furnitureId" value="${entity.furnitureId}"><label class="field scale-control">家具大小 <output data-size-label>${Number((entity.width * 100).toFixed(1))}%</output><input name="width" type="range" min="2" max="100" step="0.1" value="${entity.width * 100}"></label><details class="precise-layout"><summary>精确调整</summary><p class="field-help">坐标与图层修改即生效，水平翻转勾选后立即应用。</p><div class="field-row"><label class="field">横向位置 %<input name="x" type="number" min="0" max="100" step=".1" required value="${(entity.x * 100).toFixed(1)}"></label><label class="field">纵向位置 %<input name="y" type="number" min="0" max="100" step=".1" required value="${(entity.y * 100).toFixed(1)}"></label></div><label class="field">图层顺序<input name="z" type="number" min="0" max="100" value="${entity.z ?? 20}"></label><label class="check-label"><input name="flip" type="checkbox" ${entity.flip ? "checked" : ""}> 水平翻转</label><button type="submit" class="btn small full">应用位置</button></details><button type="button" class="btn quiet full" data-action="delete-selection" ${last ? "disabled" : ""}>${icon("box", 16)} ${last ? "至少保留一件家具" : "收回仓库"}</button></form>${
    app.developerPreview
      ? `<div class="interaction-preview"><h3>动作调试</h3><label class="field">整套装扮<select id="outfit-select">${app.pack.outfits
          .filter((o) => owns(app.state, "outfits", o.id))
          .map(
            (o) =>
              `<option value="${o.id}" ${o.id === app.state.selectedOutfitId ? "selected" : ""}>${esc(o.name)}</option>`,
          )
          .join(
            "",
          )}</select></label><div class="action-buttons">${Object.entries(
          furniture.actions,
        )
          .map(
            ([id, a]) =>
              `<button class="btn small" data-preview-action="${id}" ${app.state.currentTrip ? "disabled" : ""}>${esc(a.name)}</button>`,
          )
          .join("")}</div></div>`
      : ""
  }`;
}
export function studioView(app) {
  const scenes = app.pack.scenes.filter((s) => owns(app.state, "scenes", s.id));
  const stock = app.pack.furniture.filter(
    (f) => furnitureAvailable(app.state, f.id) > 0,
  );
  return `<div id="furniture-tools" class="furniture-tools" role="group" aria-label="选中家具缩放">${furnitureToolbar(app)}</div><button class="btn painted-button housing-restore" data-action="toggle-housing" aria-label="展开家装面板" aria-expanded="false" ${app.housingCollapsed ? "" : "hidden"}>${icon("edit", 17)} 展开家装</button><aside class="housing-panel" ${app.housingCollapsed ? "hidden" : ""}><header class="panel-heading"><h2>家装</h2><div class="housing-panel-actions"><button type="button" class="btn small" data-action="toggle-housing" aria-label="收起家装面板" aria-expanded="true">收起</button><button class="btn primary small" data-tab="home">完成</button></div></header><details class="housing-controls" open><summary>地点与家具</summary><section><h3>显示的地点</h3><div class="home-locations">${scenes.map((s) => `<button data-scene="${s.id}" class="${s.id === app.state.viewSceneId ? "active" : ""}" aria-pressed="${s.id === app.state.viewSceneId}"><img src="${app.resolve(app.pack.assets[s.background].src)}" alt="" draggable="false"><span>${esc(s.name)}</span></button>`).join("")}</div></section><section><div class="section-heading"><h3>家具仓库</h3><button class="tiny-link" data-shop-open="furniture">去商店</button></div>${stock.length ? `<div class="furniture-stock">${stock.map((f) => `<button class="stock-item" data-add-furniture="${f.id}" aria-label="摆放${esc(f.name)}"><span>${spriteHtml(app.pack, f.empty, app.resolve, "", f.name)}</span><strong>${esc(f.name)}</strong><small>可放 ${furnitureAvailable(app.state, f.id)} 件</small></button>`).join("")}</div>` : '<p class="field-help">家具都已摆好。想再添一件，可以去商店购买。</p>'}</section><section id="inspector">${selectionPanel(app)}</section></details><p class="housing-tip">${app.state.currentTrip ? esc(app.state.companionName) + "正在旅行，仍可继续布置小屋。<br>" : ""}拖动家具调整位置 · 拖动空白处移动视角</p></aside>`;
}
export function photoStyleSelectionView(app) {
  const style = photoStyleSnapshot(app.pack, app.state.settings),
    preview = PHOTO_STYLE_PREVIEWS[style.id];
  return `<span class="photo-style-current-art">${preview ? `<img src="${esc(preview.src)}" alt="${esc(style.name)}风格预览" width="${preview.width}" height="${preview.height}" decoding="async">` : icon("photo", 26)}</span><span><strong>${esc(style.name)}</strong><small>选择照片风格 · 20 种</small></span>`;
}
export function photoStylePickerView(app) {
  const selected = photoStyleSnapshot(app.pack, app.state.settings);
  return `<section class="photo-style-panel" id="photo-style-panel"><h2>旅行照片风格</h2><p class="field-help">从下一次旅行起用于生成新照片，当前旅程与默认照片保持原样。</p><details class="photo-style-picker"><summary><span data-selected-photo-style>${photoStyleSelectionView(app)}</span><span class="photo-style-expand">选择</span></summary><button type="button" class="btn small photo-style-default" data-photo-style="${PACK_STYLE_ID}" aria-pressed="${selected.id === PACK_STYLE_ID}">${icon("leaf", 16)} 素材包默认</button><div class="photo-style-grid">${PHOTO_STYLES.map(
    (style, index) => {
      const preview = PHOTO_STYLE_PREVIEWS[style.id];
      return `<button type="button" class="photo-style-card ${selected.id === style.id ? "is-selected" : ""}" data-photo-style="${style.id}" aria-pressed="${selected.id === style.id}" aria-label="${esc(style.name)}"><img src="${esc(preview.src)}" alt="${esc(style.name)}风格示例" width="${preview.width}" height="${preview.height}" loading="lazy" decoding="async" draggable="false"><span><small>${String(index + 1).padStart(2, "0")}</small><strong>${esc(style.name)}</strong>${icon("check", 15)}</span></button>`;
    },
  ).join(
    "",
  )}</div><p class="field-help">这些风景图只供挑选画风；生成时继续使用角色穿搭图作为参考。</p></details></section>`;
}
export function settingsView(app) {
  return (
    heading("", "设置", "让这里更像你的家。") +
    `<div class="simple-settings"><form id="profile-form" class="panel"><label class="field">伙伴的名字<input name="companionName" maxlength="40" value="${esc(app.state.companionName)}" required></label><button class="btn primary" type="submit">保存名字</button></form>${photoStylePickerView(app)}<details class="developer-settings" ${app.developerOpen ? "open" : ""}><summary>${icon("settings", 18)} 开发者设置</summary><p class="field-help">素材导入、动作调试与模型连接。</p>${developerClockView(app)}<section class="panel developer-assets"><h2>素材管理</h2><div class="developer-tool-grid">${[
      ["import-outfit", "导入装扮"],
      ["import-item", "导入随身物品"],
      ["import-furniture", "导入空家具"],
      ["import-action", "导入互动帧"],
      ["add-scene", "导入地点底图"],
      ["import-pack", "导入素材包"],
      ["export-pack", "导出素材包"],
      ["edit-config", "编辑素材配置"],
      ["preview-console", "动作调试"],
      ["update-example", "更新内置示例"],
      ["restore-previous-pack", "撤销示例更新"],
    ]
      .map(([id, name]) => button(id, name, "", "small"))
      .join("")}</div></section>${developerSettingsView(app)}</details></div>`
  );
}

function developerClockView(app) {
  const event = nextGameEvent(app.state);
  return `<section class="panel developer-clock"><div class="panel-heading"><h2>推进时间</h2>${icon("clock", 20)}</div><p class="field-help">按真实流程模拟自动出发、旅途来信、金币和归来。配置 API 后，这些事件会正常调用模型并消耗额度；推进时间不会清除当天调用记录。</p><div class="clock-facts"><span>游戏时间<strong data-clock-now>${new Date(gameNow(app.state)).toLocaleString("zh-CN")}</strong></span><span>累计推进<strong data-clock-offset>${Math.round(clockOffset(app.state) / 60000)} 分钟</strong></span><span>下一事件<strong data-clock-next>${event ? `${esc(event.label)} · ${timeLeft(event.at - gameNow(app.state))}后` : "自动出发已关闭"}</strong></span></div><div class="developer-tool-grid">${[1, 5, 30, 60].map(n => button("advance-time", `＋${n} 分钟`, "", "small", `data-minutes="${n}" ${app.busy ? "disabled" : ""}`)).join("")}${button("advance-event", "推进到下一事件", "clock", "primary small", app.busy ? "disabled" : "")}</div><form id="clock-form" class="clock-form"><label class="field">自定义分钟<input name="minutes" type="number" min="1" max="43200" value="10" required></label><button type="submit" class="btn small" ${app.busy ? "disabled" : ""}>推进</button></form><p class="field-help" data-clock-status>${app.busy ? "正在规划行程…" : app.imageBusy?.size ? "正在生成旅途照片…" : "可以推进时间"}</p></section>`;
}

function developerSettingsView(app) {
  const s = app.state.settings;
  return (
    heading("", "开发者配置", "") +
    `<form id="settings-form" class="settings-layout"><div class="settings-main"><section class="panel"><div class="panel-heading"><h2>生活与旅行</h2>${icon("clock", 20)}</div><label class="field">伙伴的名字<input name="companionName" maxlength="40" value="${esc(app.state.companionName)}" required></label><div class="field-row"><label class="field">旅行最短（分钟）<input name="travelMinMinutes" type="number" min="1" max="43200" value="${s.travelMinMinutes}" required></label><label class="field">旅行最长（分钟）<input name="travelMaxMinutes" type="number" min="1" max="43200" value="${s.travelMaxMinutes}" required></label></div><div class="field-row"><label class="field">休息最短（分钟）<input name="restMinMinutes" type="number" min="1" max="43200" value="${s.restMinMinutes}" required></label><label class="field">休息最长（分钟）<input name="restMaxMinutes" type="number" min="1" max="43200" value="${s.restMaxMinutes}" required></label></div><div class="field-row"><label class="field">行程最少节点<input name="journeyMinNodes" type="number" min="1" max="3" value="${s.journeyMinNodes}" required></label><label class="field">行程最多节点<input name="journeyMaxNodes" type="number" min="1" max="3" value="${s.journeyMaxNodes}" required></label></div><p class="field-help">旅行时长保存后从下一程生效；已经出发的旅程保持原定归期。</p><p class="developer-schedule">${app.state.currentTrip ? `预计归来：<strong data-dev-return>${new Date(app.state.currentTrip.returnAt).toLocaleString("zh-CN")}</strong>` : `预计下次出发：${new Date(app.state.nextTripAt).toLocaleString("zh-CN")}`}</p><div class="toggle-row"><div><strong>自动出发</strong><p>页面打开时，休息结束后自动开始下一程。关闭页面时不发起新的 API 调用。</p></div><label class="switch"><input name="autoTravel" type="checkbox" ${s.autoTravel ? "checked" : ""}><span></span></label></div><div class="field-row"><label class="field">每个动作最少停留（分钟）<input name="activityMinMinutes" type="number" min=".1" max="1440" step=".1" value="${s.activityMinMinutes}" required></label><label class="field">最多停留（分钟）<input name="activityMaxMinutes" type="number" min=".1" max="1440" step=".1" value="${s.activityMaxMinutes}" required></label></div><div class="toggle-row"><div><strong>偶尔换个场景活动</strong><p>一段活动结束后，可能去另一个场景歇歇脚。</p></div><label class="switch"><input name="wanderBetweenScenes" type="checkbox" ${s.wanderBetweenScenes ? "checked" : ""}><span></span></label></div><p class="field-help">日常动作随机切换，始终不使用文字或图片 API。旅行按真实时间结算，离线回来也能看到已完成的旅程。</p></section><section class="panel"><div class="panel-heading"><h2>旅行灵感</h2>${icon("spark", 20)}</div><p class="field-help">出发前一次规划整段行程、1–3个节点、每个节点的话语和照片提示词。到节点才投递，图片串行生成，并沿用出发时的服装参考图。AI失败静默回退本地文案和默认照片。目的地始终随机，只有花金币才指定。</p><div class="field-row"><label class="field">指定地点费用（金币）<input name="directedTripCost" type="number" min="0" max="99999999" value="${s.directedTripCost}" required></label><label class="field">金币来信间隔（分钟）<input name="coinMailMinutes" type="number" min="1" max="43200" value="${s.coinMailMinutes}" required></label><label class="field">每封来信的金币<input name="coinMailAmount" type="number" min="0" max="10000" value="${s.coinMailAmount}" required></label></div><p class="field-help">配置可用的 API Key 后，游戏不设每日照片张数或文字规划次数上限；供应商余额和速率限制仍然适用。</p><p class="field-help">只为出发时已配置生图 API 的旅程生成节点照片；失败后，本程尚未寄出的节点改为本地方案，不重试。</p><div class="usage-line">今天已请求 ${app.state.aiUsage[new Date().toISOString().slice(0, 10)] || 0} 次文字规划</div></section><section class="panel"><div class="panel-heading"><h2>API 连接</h2>${icon("settings", 20)}</div><label class="field">连接方式<select name="connectionMode"><option value="proxy" ${s.connectionMode === "proxy" ? "selected" : ""}>附带的本地 / 自部署代理</option><option value="direct" ${s.connectionMode === "direct" ? "selected" : ""}>浏览器直连（供应商需允许 CORS）</option></select></label><label class="field">代理访问令牌（仅自部署公网服务）<input name="proxyToken" type="password" autocomplete="off" value="${esc(app.secrets.proxyToken || "")}" placeholder="本地运行时自动连接"></label><div class="api-columns"><div><h3>文字 API</h3><label class="field">协议<select name="textProtocol"><option value="responses" ${s.textProtocol === "responses" ? "selected" : ""}>Responses</option><option value="chat" ${s.textProtocol !== "responses" ? "selected" : ""}>Chat Completions 兼容接口</option></select></label><label class="field">Base URL<input name="textBaseUrl" type="url" value="${esc(s.textBaseUrl)}" required></label><label class="field">模型名称<input name="textModel" value="${esc(s.textModel)}" placeholder="填写供应商提供的模型 ID"></label><label class="field">API Key<input name="textKey" type="password" autocomplete="off" value="${esc(app.secrets.textKey || "")}" placeholder="仅保留在当前页面会话"></label></div><div><h3>图片 API</h3><label class="field">协议<select name="imageProtocol"><option value="auto" ${s.imageProtocol !== "openrouter" ? "selected" : ""}>OpenAI Images 兼容接口 / 自动识别</option><option value="openrouter" ${s.imageProtocol === "openrouter" ? "selected" : ""}>OpenRouter Images</option></select></label><label class="field">生成方式<select name="imageMode"><option value="edit" ${s.imageMode === "edit" ? "selected" : ""}>参考角色图片生成</option><option value="generate" ${s.imageMode === "generate" ? "selected" : ""}>仅使用提示词</option></select></label><label class="field">Base URL<input name="imageBaseUrl" type="url" value="${esc(s.imageBaseUrl)}" required></label><label class="field">模型名称<input name="imageModel" value="${esc(s.imageModel)}" placeholder="填写供应商提供的模型 ID"></label><label class="field">API Key<input name="imageKey" type="password" autocomplete="off" value="${esc(app.secrets.imageKey || "")}" placeholder="也可在本地 .env 配置"></label></div></div><div class="field-row"><label class="field">图片尺寸<select name="imageSize">${["1536x1024", "1024x1024", "1024x1536", "auto"].map((v) => `<option ${s.imageSize === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field">图片质量<select name="imageQuality">${[
      ["low", "较低"],
      ["medium", "标准"],
      ["high", "较高"],
      ["auto", "由模型决定"],
      ["omit", "不发送质量参数"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${s.imageQuality === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label></div>${app.runtime?.openrouterConfigured ? '<p class="field-help">OpenRouter 已从本地服务配置密钥。</p>' : ""}<p class="field-help">密钥不会写入存档、资源包或本地偏好设置。配置保存不会自动发起付费测试。不同供应商支持的参数可能不同。</p></section></div><aside class="settings-aside"><section class="panel"><h2>留下自己的节奏</h2><p class="subtle">保存后立即应用。所有配置都可以再次调整。</p><button type="submit" class="btn primary full">${icon("check", 18)} 保存设置</button></section><section class="panel"><div class="panel-heading"><h2>存档与备份</h2>${icon("shield", 19)}</div><p class="subtle">浏览器存储可能被清理。完整备份包含素材、进度和照片，可以带到另一台设备。</p>${button("export-save", "导出完整存档", "download", "full")}${button("import-save", "导入存档", "upload", "full")}${button("set-pack-defaults", "设为资源包默认", "check", "full")}${button("export-defaults", "导出默认配置", "download", "quiet full")}<p class="field-help">当前版本以本地存档为准，不提供公共云账号服务。</p></section><section class="panel"><h2>素材与布置</h2><p class="subtle">导入大家制作的素材包，调整家具位置和大小，预览不同装扮的互动。</p>${button("edit", "打开素材与布置", "edit", "full")}${button("change-activity", "立即切换日常动作", "leaf", "full")}${button("deliver-next-node", "投递下一行程节点", "book", "full", app.state.currentTrip?.itinerary ? "" : "disabled")}${app.state.currentTrip?.itinerary ? `<details class="itinerary-details" ${app.itineraryOpen ? "open" : ""}><summary>查看完整行程计划</summary><pre class="itinerary-json">${esc(JSON.stringify(app.state.currentTrip.itinerary, null, 2))}</pre><p class="field-help" data-dev-fallback ${app.state.currentTrip.planningError || app.state.currentTrip.fallbackReason ? "" : "hidden"}>${app.state.currentTrip.planningError || app.state.currentTrip.fallbackReason ? `本地回退原因：${esc(app.state.currentTrip.planningError || app.state.currentTrip.fallbackReason)}` : ""}</p></details>` : ""}${button("return-now", "让当前旅程现在归来", "clock", "full", app.state.currentTrip ? "" : "disabled")}${button("reset-state", "重新开始本地生活", "reset", "quiet full danger")}</section></aside></form>`
  );
}
