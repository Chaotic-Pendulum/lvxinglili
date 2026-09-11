import { gameNow, clockOffset, nextGameEvent, advanceGameClock, advanceToNextEvent } from "./core/clock.js";
import { applyProviderDefaults } from "./core/provider.js";
import {
  PHOTO_STYLES,
  PACK_STYLE_ID,
  normalizePhotoStyleId,
} from "./core/photo-styles.js";
import {
  randomTripMinutes,
  nextAutoDeparture,
  createItinerary,
  deliverJourneyNodes,
  journeyPhotos,
  findJourneyNode,
  fallbackJourney,
} from "./core/itinerary.js";
import {
  createState,
  chooseActivity,
  beginTrip,
  commitDeparture,
  settleTrip,
  planLocally,
  restoreState,
  normalizeSettings,
  clamp,
  uid,
  movePlacement,
  resolveActivity,
  previewActivity,
  migrateLegacyState,
  placeFurniture,
  storeFurniture,
  selectHomeScene,
} from "./core/engine.js";
import { validatePack, frameInfo } from "./core/pack.js";
import { upgradeReadingRoom } from "./core/pack-upgrade.js";
import {
  purchase,
  owns,
  grantImportedAsset,
  restoreEconomy,
} from "./core/economy.js";
import { destinationById, destinationName } from "./core/catalog.js";
import { SceneView, spriteHtml } from "./scene.js";
import { icon, button, esc, date, timeLeft, toast, nextFrame } from "./util.js";
import * as storage from "./storage.js";
import * as views from "./views.js";
import { planWithAI, planJourneyWithAI, createPostcard } from "./ai.js";
import { registerAgentTools } from "./webmcp.js";
import {
  selectTravelDestination,
  directedTripPrice,
  apiAvailability,
  travelApiPolicy,
  defaultPhotoFor,
  refreshDefaultPhotos,
  collectTravelCoins,
} from "./core/travel.js";
import { AtlasMap } from "./atlas.js";
import { atlasSelectionForMode } from "./core/atlas.js";

export class Atelier {
  constructor() {
    this.tab = new URLSearchParams(location.search).has("developer") ? "settings" : "home";
    this.developerOpen = this.tab === "settings";
    this.simulationActive = false;
    this.itineraryOpen = false;
    this.shopCategory = "outfits";
    this.developerPreview = false;
    this.atlasMode = "world";
    this.atlasSearch = "";
    this.visitedOnly = false;
    this.selectedRegion = "";
    this.atlasCameras = {};
    this.selectedDestination = "";
    this.instruction = "";
    this.departureChoice = "random";
    this.selection = null;
    this.housingCollapsed = false;
    this.busy = false;
    this.imageBusy = new Set();
    this.secrets = { textKey: "", imageKey: "", proxyToken: "" };
    this.mediaUrls = {};
    this.assetUrls = {};
    this.assetBlobs = {};
    this.base = "./packs/reading-room/";
    this.resolve = (src) =>
      this.assetUrls[src] || new URL(this.base + src, location.href).href;
  }
  async init() {
    const root = document.querySelector("#app");
    root.innerHTML =
      '<div class="loading-screen"><h1>漫游工坊</h1><p>把阳光放进小屋里…</p></div>';
    this.bundled = await fetch("./packs/reading-room/pack.json").then((r) => {
      if (!r.ok) throw new Error("示例资源包加载失败");
      return r.json();
    });
    this.maps = await fetch("./maps/maps.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    this.runtime = await fetch("./api/runtime")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let saved, record;
    try {
      [saved, record] = await Promise.all([
        storage.read("state"),
        storage.read("pack"),
      ]);
    } catch (error) {
      this.storageWarning = error.message;
    }
    if (record && validatePack(record.pack).length === 0) {
      const upgraded = upgradeReadingRoom(record, this.bundled);
      if (upgraded.changed && validatePack(upgraded.record.pack).length === 0) {
        try {
          await storage.write("reading-room-upgrade-backup", {
            record,
            state: saved,
            date: Date.now(),
          });
          await storage.write("pack", upgraded.record);
          record = upgraded.record;
          this.storageWarning =
            "旧示例素材已自动升级，装扮选择、布置和照片已保留。";
        } catch {
          this.storageWarning =
            "素材升级未能保存，暂时使用兼容素材；请检查设备剩余空间。";
        }
      }
    }
    if (record && validatePack(record.pack).length === 0) {
      this.pack = record.pack;
      this.assetBlobs = record.blobs || {};
      this.base = record.base || this.base;
    } else this.pack = structuredClone(this.bundled);
    this.refreshAssetUrls();
    try {
      if (saved?.version === 1) {
        await storage.write("v1-migration-backup", {
          state: saved,
          pack: record,
          date: Date.now(),
        });
        this.state = migrateLegacyState(saved, this.pack);
        this.storageWarning =
          "已升级到家具互动版：照片和旅行记录已保留，旧版布置已备份。";
        await this.savePack();
      } else
        this.state = saved
          ? restoreState(saved, this.pack)
          : createState(this.pack);
    } catch (error) {
      this.state = createState(this.pack);
      try {
        await storage.write("unreadable-state-backup", {
          state: saved,
          pack: record,
          date: Date.now(),
        });
      } catch {}
      this.storageWarning = "旧存档无法自动恢复，原始数据已保留备份。";
    }
    if (applyProviderDefaults(this.state, this.runtime)) {
      this.tab = "settings";
      this.developerOpen = true;
      await this.saveNow();
    }
    for (const trip of [this.state.currentTrip, ...this.state.trips].filter(
      Boolean,
    )) {
      if (trip.itinerary?.nodes.some((n) => n.imageStatus === "generating")) {
        for (const n of trip.itinerary.nodes)
          if (n.imageStatus === "generating" && n.deliveredAt != null)
            n.imageStatus = "default";
        this.fallbackJourneyPhotos(trip, "上次图片请求被中断");
      }
      if (trip.imageStatus === "generating") {
        trip.imageStatus = "default";
        trip.fallbackReason = "上次图片请求被中断";
        const photo = defaultPhotoFor(this.pack, trip.destinationId);
        trip.sampleAsset = photo.asset;
      }
    }
    if (refreshDefaultPhotos(this.pack, [this.state.currentTrip, ...this.state.trips]))
      await this.saveNow();
    if (!this.runtime?.proxy) this.state.settings.connectionMode = "direct";
    await this.refreshMediaUrls();
    this.bind();
    this.tick(false);
    this.render();
    this.timer = setInterval(() => this.tick(), 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.saveNow();
      else this.tick();
    });
    window.addEventListener("pagehide", () => this.saveNow());
    registerAgentTools(this);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    if (this.storageWarning) toast(this.storageWarning, true);
  }
  character() {
    return this.pack.character;
  }
  outfit(id = this.state.selectedOutfitId) {
    return (
      this.pack.outfits.find((o) => o.id === id) ||
      this.pack.outfits.find((o) => o.id === this.pack.baseOutfitId)
    );
  }
  photos() {
    return [...journeyPhotos(this.state), ...this.state.memories].sort(
      (a, b) =>
        (b.completedAt || b.createdAt || 0) -
        (a.completedAt || a.createdAt || 0),
    );
  }
  refreshAssetUrls() {
    for (const url of Object.values(this.assetUrls)) URL.revokeObjectURL(url);
    this.assetUrls = Object.fromEntries(
      Object.entries(this.assetBlobs).map(([path, blob]) => [
        path,
        URL.createObjectURL(blob),
      ]),
    );
  }
  async refreshMediaUrls() {
    const ids = [
      ...new Set(
        this.photos()
          .map((p) => p.imageId)
          .filter(Boolean),
      ),
    ];
    for (const id of ids)
      if (!this.mediaUrls[id]) {
        const blob = await storage.read(`media:${id}`).catch(() => null);
        if (blob) this.mediaUrls[id] = URL.createObjectURL(blob);
      }
  }
  async getBlob(src) {
    if (this.assetBlobs[src]) return this.assetBlobs[src];
    const r = await fetch(this.resolve(src), { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`无法读取素材 ${src}`);
    return r.blob();
  }
  save() {
    clearTimeout(this.saveTimer);
    const label = document.querySelector("[data-save-label]");
    if (label) label.textContent = "保存中…";
    this.saveTimer = setTimeout(() => this.saveNow(), 600);
  }
  async saveNow() {
    if (!this.state) return;
    clearTimeout(this.saveTimer);
    this.state.updatedAt = Date.now();
    try {
      await storage.write("state", this.state);
      const n = document.querySelector("[data-save-label]");
      if (n) n.textContent = "已保存";
    } catch {
      toast("本地保存失败，请导出备份并检查设备剩余空间", true);
    }
  }
  async savePack() {
    await storage.write("pack", {
      pack: this.pack,
      blobs: this.assetBlobs,
      base: this.base,
    });
    await this.saveNow();
  }
  render() {
    const viewKey = this.tab === "shop" ? `shop:${this.shopCategory}` : this.tab;
    const sameView = this.renderedViewKey === viewKey;
    const overlayScroll = sameView ? document.querySelector(".overlay-content")?.scrollTop || 0 : 0;
    const regionScroll = sameView ? document.querySelector(".region-list")?.scrollTop || 0 : 0;
    const housingScroll = sameView ? document.querySelector(".housing-panel")?.scrollTop || 0 : 0;
    const preciseOpen = sameView && Boolean(document.querySelector(".precise-layout")?.open);
    const developerPanel = document.querySelector(".developer-settings");
    if (developerPanel) this.developerOpen = developerPanel.open;
    const itineraryPanel = document.querySelector(".itinerary-details");
    if (itineraryPanel) this.itineraryOpen = itineraryPanel.open;
    this.atlasMap?.destroy();
    const keepScene =
      this.scene &&
      this.scene.pack === this.pack &&
      this.scene.state === this.state &&
      this.scene.scene.id === this.state.viewSceneId;
    const previousNode = keepScene ? this.scene.node : null;
    if (!keepScene) this.scene?.destroy();
    const view =
      {
        home: views.homeView,
        bag: views.bagView,
        travel: views.travelView,
        shop: views.shopView,
        atlas: views.atlasView,
        gallery: views.galleryView,
        studio: views.studioView,
        settings: views.settingsView,
      }[this.tab] || views.homeView;
    document.querySelector("#app").innerHTML = views.shell(this, view(this));
    const node = document.querySelector("#scene");
    if (keepScene) {
      node.replaceWith(previousNode);
      this.scene.setEditing(this.tab === "studio", this.selection?.id);
      this.scene.drawFurniture();
      this.scene.layout();
      this.scene.updateFrames();
    } else
      this.scene = new SceneView(node, {
        pack: this.pack,
        state: this.state,
        resolve: this.resolve,
        edit: this.tab === "studio",
        selected: this.selection?.id,
        onSelect: (id, type) => {
          this.selection = { id, type };
          this.updateInspector();
        },
        onChange: (id, type) => {
          this.selection = { id, type };
          this.updateInspector();
          this.saveNow();
        },
        onCamera: (camera) => {
          this.state.camera[this.state.viewSceneId] = { ...camera };
          this.save();
        },
      });
    if (this.tab !== "studio" && this.tab !== "home")
      document.querySelector(".workspace-overlay")?.focus({ preventScroll: true });
    if (this.tab === "atlas" || this.tab === "travel") {
      this.atlasMap = new AtlasMap(
        document.querySelector("[data-native-map]"),
        {
          mode: this.atlasMode,
          selected: this.selectedRegion,
          visits: this.state.visits,
          camera: this.atlasCameras[this.atlasMode],
          onCamera: (camera) => {
            this.atlasCameras[this.atlasMode] = camera;
          },
          onSelect: (id, keyboard) => {
            this.selectAtlasRegion(id);
            if (keyboard)
              (
                document.querySelector(`.region-row[data-region="${id}"]`) ||
                document.querySelector("#region-search")
              )?.focus();
          },
        },
      );
      document.querySelector(".region-list").scrollTop = regionScroll;
    }
    const content = document.querySelector(".overlay-content");
    if (content) content.scrollTop = overlayScroll;
    const precise = document.querySelector(".precise-layout");
    if (precise) precise.open = preciseOpen;
    const housing = document.querySelector(".housing-panel");
    if (housing) housing.scrollTop = housingScroll;
    this.renderedViewKey = viewKey;
  }
  selectAtlasRegion(id) {
    if (id !== "CN" && !destinationById(id)) return;
    this.selectedRegion = id;
    if (id === "CN") {
      this.atlasMode = "china";
      this.atlasSearch = "";
    } else this.selectedDestination = id;
    this.render();
  }
  updateInspector() {
    const tools = document.querySelector("#furniture-tools");
    if (tools) tools.innerHTML = views.furnitureToolbar(this);
    const n = document.querySelector("#inspector");
    if (!n) return;
    const open = Boolean(n.querySelector(".precise-layout")?.open);
    const panel = document.querySelector(".housing-panel");
    const scroll = panel?.scrollTop || 0;
    n.innerHTML = views.selectionPanel(this);
    const precise = n.querySelector(".precise-layout");
    if (precise) precise.open = open;
    if (panel) panel.scrollTop = scroll;
  }
  navigate(tab, { toggle = false } = {}) {
    if (tab === "studio" && this.tab === "studio") return;
    if (
      ![
        "home",
        "bag",
        "travel",
        "atlas",
        "gallery",
        "studio",
        "shop",
        "settings",
      ].includes(tab)
    )
      return;
    this.captureTravelForm();
    this.tab = toggle && tab === this.tab && !["home", "studio"].includes(tab) ? "home" : tab;
    if (this.tab !== "studio") this.developerPreview = false;
    this.selection = null;
    this.render();
  }
  captureTravelForm() {
    const f = document.querySelector("#travel-form");
    if (f) {
      this.selectedDestination = f.elements.destinationId.value;
      this.instruction = f.elements.instruction.value;
    }
  }
  switchScene(id) {
    selectHomeScene(this.pack, this.state, id);
    this.selection = null;
    this.save();
    this.render();
  }
  tick(render = true, { forceAuto = false } = {}) {
    if (!this.state) return;
    const now = gameNow(this.state);
    const letter = collectTravelCoins(this.state, now);
    if (letter) {
      this.saveNow();
      const balance = document.querySelector("[data-coins]");
      if (balance) {
        balance.textContent = this.state.economy.coins.toLocaleString("zh-CN");
        balance
          .closest(".coin-balance")
          ?.setAttribute(
            "aria-label",
            `金币来信，${this.state.economy.coins} 金币`,
          );
      }
      const progress = document.querySelector("[data-mail-progress]");
      if (progress)
        progress.textContent = `已寄回 ${this.state.currentTrip.coinsReceived} 金币`;
      toast(
        `${this.state.companionName}寄回了 ${letter.coins} 金币${letter.count > 1 ? `（${letter.count}封来信）` : ""}。`,
      );
      if (render && this.tab === "shop" && !this.modal()?.open) this.render();
    }
    const delivered = deliverJourneyNodes(this.state, now);
    if (delivered.length) {
      for (const { trip, node } of delivered) {
        const photo = defaultPhotoFor(this.pack, trip.destinationId);
        node.sampleAsset = photo.asset;
        node.defaultPhotoPlaceholder = photo.placeholder;
      }
      this.saveNow();
      const published = delivered.filter(
        ({ node }) => node.deliveredAt != null,
      );
      if (published.length)
        toast(
          `${this.state.companionName}来信：${published[published.length - 1].node.message}`,
        );
      if (render && !this.modal()?.open) this.render();
    }
    const returned = settleTrip(this.state, now);
    if (returned?.itinerary) {
      this.saveNow();
      toast(`${this.state.companionName}回家啦，旅途来信已经收好。`);
      if (render && !this.modal()?.open) this.render();
    }
    if (returned && !returned.itinerary) {
      const photo = defaultPhotoFor(this.pack, returned.destinationId);
      returned.sampleAsset = photo.asset;
      returned.defaultPhotoPlaceholder = photo.placeholder;
      returned.imageStatus = "default";
      this.saveNow();
      toast(
        `${this.state.companionName}回来啦，${returned.destinationName}的照片已经收好。`,
      );
      if (render && !this.modal()?.open) this.render();
      if (returned.photoMode === "generated") {
        if (
          apiAvailability(this.state.settings, this.secrets, this.runtime).image
        )
          this.generateTripImage(returned.id, true).catch((error) => {
            returned.fallbackReason = error.message;
            this.saveNow();
          });
        else {
          returned.fallbackReason = "生图 API 配置当前不可用";
          this.saveNow();
        }
      }
    }
    if (
      !this.state.currentTrip &&
      (!this.state.activity || now >= this.state.activity.until) &&
      this.tab !== "studio"
    ) {
      this.state.activity = chooseActivity(this.pack, this.state, now);
      this.save();
      const label = document.querySelector("[data-activity]");
      if (label) label.textContent = views.activityName(this);
    }
    this.updateClockPanel();
    this.pumpJourneyPhotos();
    if (this.state.currentTrip) {
      const t = this.state.currentTrip;
      const n = document.querySelector("[data-dev-return]");
      if (n)
        n.textContent = `${new Date(t.returnAt).toLocaleString("zh-CN")}（${timeLeft(t.returnAt - now)}后）`;
      const p = document.querySelector("[data-trip-progress]");
      if (p)
        p.style.width = `${clamp(((now - t.startedAt) / (t.returnAt - t.startedAt)) * 100, 0, 100)}%`;
    }
    if (
      render &&
      !document.hidden &&
      !this.busy &&
      !this.imageBusy.size &&
      !this.modal()?.open &&
      !this.state.currentTrip &&
      (forceAuto || (this.tab !== "studio" && (this.simulationActive || this.tab !== "settings"))) &&
      this.state.settings.autoTravel &&
      now >= this.state.nextTripAt
    ) {
      this.startTrip("", "", true).catch((error) => {
        this.state.settings.autoTravel = false;
        this.saveNow();
        toast(`自动旅行已暂停：${error.message}`, true);
        this.render();
      });
    }
  }
  updateClockPanel() {
    const now = gameNow(this.state), event = nextGameEvent(this.state);
    const values = {
      "clock-now": new Date(now).toLocaleString("zh-CN"),
      "clock-offset": `${Math.round(clockOffset(this.state) / 60000)} 分钟`,
      "clock-next": event ? `${event.label} · ${timeLeft(event.at - now)}后` : "自动出发已关闭",
      "clock-status": this.busy ? "正在规划行程…" : this.imageBusy.size ? "正在生成旅途照片…" : "可以推进时间",
    };
    for (const [id, text] of Object.entries(values)) {
      const element = document.querySelector(`[data-${id}]`);
      if (element) element.textContent = text;
    }
    for (const button of document.querySelectorAll(".developer-clock button")) button.disabled = this.busy;
    const trip = this.state.currentTrip;
    const plan = document.querySelector(".itinerary-json");
    if (plan && trip?.itinerary) {
      const text = JSON.stringify(trip.itinerary, null, 2);
      if (plan.textContent !== text) plan.textContent = text;
    }
    const fallback = document.querySelector("[data-dev-fallback]");
    if (fallback) {
      const reason = trip?.planningError || trip?.fallbackReason || "";
      fallback.hidden = !reason;
      fallback.textContent = reason ? `本地回退原因：${reason}` : "";
    }
  }
  async advanceTime(minutes) {
    if (this.busy) throw new Error("请等本次行程规划结束后再推进时间");
    if (minutes === "next") advanceToNextEvent(this.state);
    else advanceGameClock(this.state, minutes);
    this.simulationActive = true;
    this.developerOpen = true;
    await this.saveNow();
    this.tick(true, { forceAuto: true });
    this.render();
    this.updateClockPanel();
  }
  modal() {
    return document.querySelector("#modal");
  }
  showModal(title, html, wide = false) {
    this.openJourneyNode = null;
    const modal = this.modal();
    if (modal.open) modal.close();
    modal.className = `modal ${wide ? "wide" : ""}`;
    modal.innerHTML = `<header class="modal-header"><h2>${esc(title)}</h2><button class="btn icon-only quiet" data-action="close-modal" aria-label="关闭">${icon("close", 20)}</button></header><div class="modal-body">${html}</div>`;
    modal.showModal();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        const r = modal.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          modal.close();
      }
    });
  }
  async startTrip(destinationId = "", instruction = "", automatic = false) {
    if (this.busy || this.state.currentTrip)
      throw new Error("伙伴已经在准备或进行一段旅程");
    const directed = Boolean(destinationId),
      destination = selectTravelDestination(destinationId);
    const fee = directed ? directedTripPrice(this.state.settings) : 0;
    if (this.state.economy.coins < fee)
      throw new Error("金币不足，可以等待免费随机旅行");
    this.captureTravelForm();
    const minutes = randomTripMinutes(this.state.settings);
    const snapshot = {
      ...this.state,
      settings: { ...this.state.settings, travelMinutes: minutes },
      backpack: [...this.state.backpack],
    };
    const credentials = { ...this.secrets },
      api = travelApiPolicy(snapshot, credentials, this.runtime);
    let itinerary = createItinerary(
      this.pack,
      snapshot,
      destination,
      minutes,
      Math.random,
      3,
      instruction,
    );
    let planningError = "",
      reference = null;
    const keepDeveloper = this.tab === "settings" && this.simulationActive;
    this.busy = true;
    this.updateClockPanel();
    if (!automatic) {
      this.tab = "travel";
      this.render();
    }
    try {
      const fallbackItinerary = structuredClone(itinerary);
      if (api.text) {
        try {
          itinerary = await planJourneyWithAI(
            this.pack,
            snapshot,
            credentials,
            this.runtime,
            itinerary,
            instruction,
          );
        } catch (error) {
          planningError = error.message;
          api.image = false;
          itinerary = fallbackItinerary;
        }
      }
      if (api.image) {
        try {
          reference = await this.referenceImage({
            outfitId: snapshot.selectedOutfitId,
          });
        } catch (error) {
          planningError ||= error.message;
          api.image = false;
          itinerary = fallbackItinerary;
        }
      }
      const plan = {
        destinationId: destination.id,
        countryId: destination.countryId,
        destinationName: destination.name,
        title: itinerary.title,
        reason: itinerary.reason,
        prompt: itinerary.nodes[0].prompt,
        planner: itinerary.planner,
      };
      const trip = commitDeparture(this.state, plan, {
        directed,
        photoMode: api.image ? "generated" : "default",
        snapshot,
        itinerary,
      });
      trip.fallbackItinerary = {
        ...fallbackItinerary,
        nodes: fallbackItinerary.nodes.map(({ prompt, ...node }) => node),
      };
      if (planningError) trip.planningError = planningError;
      if (reference) {
        try {
          const id = uid("reference");
          await storage.write(
            `media:${id}`,
            await fetch(reference).then((r) => r.blob()),
          );
          trip.referenceImageId = id;
        } catch (error) {
          fallbackJourney(trip, error.message, gameNow(this.state));
        }
      }
      await this.saveNow();
      this.tab = keepDeveloper ? "settings" : "home";
      this.render();
      toast(
        `${this.state.companionName}出门去${trip.destinationName}了，等它的来信吧。`,
      );
      return {
        tripId: trip.id,
        destinationId: trip.destinationId,
        returnAt: trip.returnAt,
      };
    } finally {
      this.busy = false;
      await this.saveNow();
      if (["travel", "settings"].includes(this.tab)) this.render();
    }
  }
  async pumpJourneyPhotos() {
    if (this.photoPump || this.busy || this.imageBusy.size) return;
    const trips = [...this.state.trips].reverse();
    if (this.state.currentTrip) trips.push(this.state.currentTrip);
    let next = null;
    for (const trip of trips) {
      const node = trip.itinerary?.nodes.find(
        (n) => n.triggeredAt != null && n.imageStatus === "queued",
      );
      if (node) {
        next = { trip, node };
        break;
      }
    }
    if (!next) return;
    this.photoPump = true;
    try {
      await this.generateJourneyPhoto(next.node.id, true);
    } catch {
    } finally {
      this.photoPump = false;
    }
  }
  async generateJourneyPhoto(id, automatic = false) {
    const found = findJourneyNode(this.state, id);
    if (
      !found ||
      (found.node.triggeredAt == null && found.node.deliveredAt == null)
    )
      return;
    const { trip, node } = found;
    if (node.imageId) return;
    if (this.imageBusy.size) throw new Error("另一张照片正在生成，请稍候");
    const day = new Date().toISOString().slice(0, 10),
      used = this.state.imageUsage[day] || 0;
    if (
      !apiAvailability(this.state.settings, this.secrets, this.runtime).image
    ) {
      this.fallbackJourneyPhotos(trip, "生图配置不可用");
      await this.saveNow();
      return;
    }
    this.imageBusy.add(id);
    node.imageStatus = "generating";
    await this.saveNow();
    try {
      const reference =
        this.state.settings.imageMode === "edit"
          ? await this.referenceImage(trip)
          : null;
      this.state.imageUsage[day] = used + 1;
      await this.saveNow();
      const blob = await createPostcard(
        this.state.settings,
        this.secrets,
        this.runtime,
        node.prompt,
        reference,
      );
      const info = await storage.inspectImage(blob),
        imageId = uid("image");
      await storage.write(
        `media:${imageId}`,
        new Blob([blob], { type: info.type }),
      );
      node.imageId = imageId;
      node.imageStatus = "ready";
      node.deliveredAt ??= gameNow(this.state);
      delete node.imageError;
      this.mediaUrls[imageId] = URL.createObjectURL(blob);
      await this.saveNow();
      toast(`${this.state.companionName}来信：${node.message}`);
    } catch (error) {
      if (node.deliveredAt != null) {
        node.imageStatus = "default";
        node.fallbackReason = error.message;
      }
      this.fallbackJourneyPhotos(trip, error.message);
      await this.saveNow();
    } finally {
      this.imageBusy.delete(id);
      this.updateClockPanel();
      if (this.modal()?.open && this.openJourneyNode === id)
        this.showJourneyNode(id);
      else if (
        !this.modal()?.open &&
        ["home", "gallery", "travel"].includes(this.tab)
      )
        this.render();
    }
  }
  fallbackJourneyPhotos(trip, reason) {
    const nodes = fallbackJourney(trip, reason, gameNow(this.state));
    for (const node of nodes) {
      const photo = defaultPhotoFor(this.pack, trip.destinationId);
      node.sampleAsset = photo.asset;
      node.defaultPhotoPlaceholder = photo.placeholder;
    }
    if (nodes.length) {
      toast(
        `${this.state.companionName}来信：${nodes[nodes.length - 1].message}`,
      );
      if (
        this.scene &&
        !this.modal()?.open &&
        ["home", "gallery", "travel"].includes(this.tab)
      )
        this.render();
    }
  }
  showJourneyNode(id) {
    const found = findJourneyNode(this.state, id);
    if (!found || found.node.deliveredAt == null) return;
    this.openJourneyNode = id;
    this.showModal(
      `${found.trip.destinationName}的来信`,
      views.journeyNodeView(this, found.trip, found.node),
      true,
    );
    this.openJourneyNode = id;
  }
  async referenceImage(trip) {
    if (trip.referenceImageId) {
      const blob = await storage.read(`media:${trip.referenceImageId}`);
      if (blob)
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
    }
    const frame = this.outfit(trip.outfitId).preview,
      f = frameInfo(this.pack, frame);
    const image = await this.loadImage(this.resolve(f.asset.src));
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f9f6ed";
    ctx.fillRect(0, 0, 1024, 1024);
    const scale = Math.min(800 / f.w, 850 / f.h),
      w = f.w * scale,
      h = f.h * scale,
      x = (1024 - w) / 2,
      y = (1024 - h) / 2;
    ctx.drawImage(image, f.x, f.y, f.w, f.h, x, y, w, h);
    return canvas.toDataURL("image/png");
  }
  loadImage(url) {
    return new Promise((res, rej) => {
      const image = new Image();
      image.onload = () => res(image);
      image.onerror = () => rej(new Error("角色参考图加载失败"));
      image.src = url;
    });
  }
  async generateTripImage(id, automatic = false) {
    const trip = this.state.trips.find((t) => t.id === id);
    if (!trip) throw new Error("先等这段旅程结束");
    if (this.imageBusy.size || trip.imageStatus === "generating")
      throw new Error("这张来信正在生成，请稍候");
    if (trip.imageId) return;
    if (!apiAvailability(this.state.settings, this.secrets, this.runtime).image)
      return;
    const today = new Date().toISOString().slice(0, 10),
      used = this.state.imageUsage[today] || 0;
    this.state.imageUsage[today] = used + 1;
    this.imageBusy.add(id);
    trip.imageStatus = "generating";
    await this.saveNow();
    if (!automatic) this.showTrip(id);
    try {
      const reference =
        this.state.settings.imageMode === "edit"
          ? await this.referenceImage(trip)
          : null;
      const blob = await createPostcard(
        this.state.settings,
        this.secrets,
        this.runtime,
        trip.prompt,
        reference,
      );
      const info = await storage.inspectImage(blob),
        imageId = uid("image");
      await storage.write(
        `media:${imageId}`,
        new Blob([blob], { type: info.type }),
      );
      trip.imageId = imageId;
      trip.imageStatus = "ready";
      delete trip.imageError;
      delete trip.sampleAsset;
      this.mediaUrls[imageId] = URL.createObjectURL(blob);
      await this.saveNow();
      toast("新的旅行照片，已经收进相册。");
    } catch (error) {
      trip.imageStatus = "default";
      trip.fallbackReason = error.message;
      delete trip.imageError;
      const photo = defaultPhotoFor(this.pack, trip.destinationId);
      trip.sampleAsset = photo.asset;
      trip.defaultPhotoPlaceholder = photo.placeholder;
      await this.saveNow();
    } finally {
      this.imageBusy.delete(id);
      if (this.modal()?.open && !automatic) this.showTrip(id);
      else if (["gallery", "atlas", "travel"].includes(this.tab)) this.render();
    }
  }
  showTrip(id) {
    const trip =
      this.state.currentTrip?.id === id
        ? this.state.currentTrip
        : this.state.trips.find((t) => t.id === id);
    if (!trip) return;
    if (trip.itinerary) {
      this.openJourneyNode = null;
      return this.showModal(
        `${trip.destinationName}的旅途来信`,
        views.journeyDiaryView(this, trip),
        true,
      );
    }
    const active = this.state.currentTrip?.id === id,
      src =
        this.mediaUrls[trip.imageId] ||
        (trip.sampleAsset
          ? this.resolve(this.pack.assets[trip.sampleAsset].src)
          : "");
    this.showModal(
      trip.title || `${trip.destinationName}的来信`,
      `${src ? `<img class="detail-photo" src="${esc(src)}" alt="${esc(trip.title)}">` : `<div class="detail-placeholder">${icon(active ? "globe" : "photo", 40)}<h3>${active ? "还在旅途中" : "这段旅程，等一张照片"}</h3><p>${active ? `它会自己安排回家的时间` : "旅程已记录，生图可以等你准备好再开始。"}</p></div>`}<div class="detail-meta"><span class="tag">${esc(trip.destinationName)}</span><small>${date(trip.startedAt)} · ${trip.destinationMode === "directed" ? `指定地点 · ${trip.destinationFee || 0}金币` : "免费随机旅行"}</small></div><p class="detail-reason">${esc(trip.reason)}</p><p class="field-help">本程已寄回 ${trip.coinsReceived || 0} 金币</p><details class="prompt-details"><summary>这段旅程的生图提示词</summary><textarea id="trip-prompt" rows="7" ${active ? "readonly" : ""}>${esc(trip.prompt)}</textarea>${!active ? button("save-trip-prompt", "保存提示词", "check", "small", `data-id="${id}"`) : ""}${button("copy-prompt", "复制提示词", "book", "small", `data-id="${id}"`)}</details>${trip.sampleAsset && !trip.imageId ? `<p class="field-help">${trip.defaultPhotoPlaceholder ? "该地点的专属默认图尚未补齐，暂用通用示例图。" : "这是该地点的内置照片。"}${trip.photoMode === "generated" ? "新照片生成后会替换此图。" : "没有调用生图 API。"}</p>` : ""}<div class="modal-actions">${trip.imageId ? button("download-photo", "保存图片", "download", "primary", `data-image-id="${trip.imageId}"`) : !active && apiAvailability(this.state.settings, this.secrets, this.runtime).image ? button("generate-photo", trip.imageStatus === "generating" ? "正在生成…" : "调用图片 API 生成一张", "spark", "primary", `data-id="${id}" ${trip.imageStatus === "generating" ? "disabled" : ""}`) : ""}${button("close-modal", "先收好", "", "quiet")}</div>`,
      true,
    );
  }
  showPhoto(id, demo = false) {
    if (findJourneyNode(this.state, id)) return this.showJourneyNode(id);
    if (demo) {
      const p = this.pack.postcards.find((p) => p.id === id);
      if (p)
        this.showModal(
          p.title,
          `<img class="detail-photo" src="${this.resolve(this.pack.assets[p.sprite.asset].src)}" alt="${esc(p.title)}"><p class="subtle">原创示例插画，未计入你的旅行足迹。</p>`,
          true,
        );
      return;
    }
    if (this.state.trips.some((t) => t.id === id)) {
      this.showTrip(id);
      return;
    }
    const m = this.state.memories.find((m) => m.id === id);
    if (!m) return;
    this.showModal(
      "一张旧回忆",
      `<img class="detail-photo" src="${esc(this.mediaUrls[m.imageId] || "")}" alt="${esc(m.title)}"><form id="memory-form"><input type="hidden" name="id" value="${m.id}"><label class="field">标题<input name="title" maxlength="100" value="${esc(m.title)}" required></label><label class="field">记得发生在哪里<select name="destinationId"><option value="">暂不标记地点</option>${views.destinationOptions(m.destinationId, false)}</select></label><label class="field">想留下的话<textarea name="note" rows="3" maxlength="2000">${esc(m.note || "")}</textarea></label><div class="modal-actions"><button class="btn primary" type="submit">保存回忆</button>${button("download-photo", "导出原图", "download", "", `data-image-id="${m.imageId}"`)}${button("delete-memory", "删除", "trash", "quiet danger", `data-id="${m.id}"`)}</div></form>`,
      true,
    );
  }
  async chooseFiles(accept, callback, multiple = false) {
    let input = document.querySelector("#file-picker");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "file-picker";
      input.hidden = true;
      document.body.append(input);
    }
    input.value = "";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => {
      const files = [...input.files];
      if (files.length)
        Promise.resolve().then(() => callback(files)).catch((error) =>
          toast(error.message, true),
        );
    };
    input.click();
  }
  async importMemories(files) {
    if (files.length > 30) throw new Error("每次最多导入30张照片");
    let count = 0;
    for (const file of files) {
      const info = await storage.inspectImage(file);
      const id = uid("memory"),
        imageId = uid("image");
      await storage.write(
        `media:${imageId}`,
        new Blob([file], { type: info.type }),
      );
      this.mediaUrls[imageId] = URL.createObjectURL(file);
      this.state.memories.unshift({
        id,
        imageId,
        title: file.name.replace(/\.[^.]+$/, ""),
        note: "",
        createdAt: Date.now(),
        originalName: file.name,
      });
      count++;
    }
    await this.saveNow();
    this.navigate("gallery");
    toast(`已留住 ${count} 张旧回忆，图片只保存在这台设备。`);
  }
  async importAsset(kind) {
    this.chooseFiles(
      "image/png,image/jpeg,image/webp,image/gif",
      async (files) => {
        if (!files.length || files.length > 100)
          throw new Error("一次选择 1–100 张图片");
        if (files.reduce((n, f) => n + f.size, 0) > 180 * 1024 * 1024)
          throw new Error("图片合计不能超过180MB");
        files.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
        const imageInfo = [];
        for (const file of files)
          imageInfo.push(await storage.inspectImage(file));
        const file = files[0],
          dimensions = imageInfo[0];
        this.pendingAsset = { file, files, dimensions, imageInfo, kind };
        const names = {
          furniture: "新家具",
          item: "新物品",
          scene: "新场景",
          outfit: "新装扮",
          action: "家具互动",
        };
        const extra =
          kind === "action"
            ? `<label class="field">家具<select name="furnitureId">${this.pack.furniture.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></label><label class="field">整套装扮<select name="outfitId">${this.pack.outfits.map((o) => `<option value="${o.id}" ${o.id === this.state.selectedOutfitId ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label><label class="field">动作 ID<input name="actionId" pattern="[a-zA-Z0-9_-]+" value="read" required></label><label class="field">每张停留（毫秒）<input name="duration" type="number" min="100" max="60000" value="3000" required></label><p class="field-help">每张图片就是一帧，按文件名排序播放。空家具和所有帧保持相同画布与位置。新动作先导入默认装扮。</p><ol class="frame-file-list">${files.map((f) => `<li>${esc(f.name)}</li>`).join("")}</ol>`
            : kind === "item"
              ? '<label class="field">旅行灵感标签<input name="tags" placeholder="forest, lake, snow"></label>'
              : "";
        this.showModal(
          `导入${names[kind]}`,
          `<form id="asset-form"><p class="subtle">${esc(file.name)} · ${dimensions.width} × ${dimensions.height}</p><label class="field">名称<input name="name" maxlength="60" value="${names[kind]}" required></label>${["item", "outfit"].includes(kind) ? '<label class="field">外观或物品描述<textarea name="description" rows="3"></textarea></label>' : ""}${extra}<p class="field-help">${kind === "outfit" ? "这是整套装扮的预览图。尚未适配的家具动作会使用默认装扮素材。" : kind === "furniture" ? "先加入空家具，再为它导入互动图，或直接导入完整素材包。" : "保留原始图片，可调整显示比例。"}</p><button class="btn primary full" type="submit">导入并使用</button></form>`,
        );
      },
      kind === "action",
    );
  }
  async commitAsset(form) {
    const pending = this.pendingAsset;
    if (!pending) return;
    const nextState = structuredClone(this.state),
      pack = structuredClone(this.pack),
      d = new FormData(form);
    const name = String(d.get("name") || "").trim();
    if (!name) throw new Error("请填写名称");
    const id = uid("asset"),
      ext = pending.dimensions.type.split("/")[1].replace("jpeg", "jpg"),
      src = `assets/${id}.${ext}`;
    const asset = {
      src,
      width: pending.dimensions.width,
      height: pending.dimensions.height,
    };
    pack.assets[id] = asset;
    const frame = { asset: id };
    const additions = {
      [src]: new Blob([pending.file], { type: pending.dimensions.type }),
    };
    if (pending.kind === "furniture") {
      pack.furniture.push({
        id,
        name,
        empty: frame,
        canvas: { width: asset.width, height: asset.height },
        pivot: [0.5, 1],
        defaultWidth: 0.22,
        actions: {},
      });
      nextState.layouts[nextState.viewSceneId].push({
        id: uid("placed"),
        furnitureId: id,
        x: 0.5,
        y: 0.8,
        width: 0.22,
        z: 25,
      });
    }
    if (pending.kind === "item")
      pack.items.push({
        id,
        name,
        sprite: frame,
        tags: String(d.get("tags") || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
        description: String(d.get("description") || "").slice(0, 1000),
      });
    if (pending.kind === "scene") {
      pack.scenes.push({
        id,
        name,
        background: id,
        width: asset.width,
        height: asset.height,
        placements: [],
      });
      nextState.layouts[id] = [];
    }
    if (pending.kind === "outfit") {
      pack.outfits.push({
        id,
        name,
        description: String(d.get("description") || name).slice(0, 1000),
        preview: frame,
      });
      nextState.selectedOutfitId = id;
    }
    if (pending.kind === "action") {
      const furniture = pack.furniture.find(
          (f) => f.id === d.get("furnitureId"),
        ),
        outfitId = d.get("outfitId"),
        actionId = String(d.get("actionId"));
      const duration = Number(d.get("duration"));
      if (!furniture || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(actionId))
        throw new Error("家具或动作 ID 无效");
      if (!furniture.actions[actionId] && outfitId !== pack.baseOutfitId)
        throw new Error("新动作请先导入默认装扮，再补充其他装扮");
      if (
        pending.imageInfo.some(
          (info) => info.width !== asset.width || info.height !== asset.height,
        )
      )
        throw new Error("同一组动作的每张图片需要相同的像素尺寸");
      if (
        Math.abs(
          asset.width / asset.height -
            furniture.canvas.width / furniture.canvas.height,
        ) > 0.01
      )
        throw new Error("动作图片的宽高比需要与空家具画布一致");
      const frames = pending.files.map((file, index) => {
        if (index === 0) return { asset: id, duration };
        const meta = pending.imageInfo[index],
          assetId = uid("frame"),
          path = `assets/${assetId}.${meta.type.split("/")[1].replace("jpeg", "jpg")}`;
        pack.assets[assetId] = {
          src: path,
          width: meta.width,
          height: meta.height,
        };
        additions[path] = new Blob([file], { type: meta.type });
        return { asset: assetId, duration };
      });
      furniture.actions[actionId] ||= { name, variants: {} };
      furniture.actions[actionId].variants[outfitId] = { frames };
    }
    const errors = validatePack(pack);
    if (errors.length) throw new Error(errors.slice(0, 4).join("；"));
    const category = {
      outfit: "outfits",
      item: "items",
      furniture: "furniture",
      scene: "scenes",
    }[pending.kind];
    if (category) grantImportedAsset(nextState, category, id);
    this.pack = pack;
    this.state = nextState;
    Object.assign(this.assetBlobs, additions);
    this.refreshAssetUrls();
    this.pendingAsset = null;
    await this.savePack();
    this.modal().close();
    this.tab = pending.kind === "item" ? "bag" : "studio";
    if (pending.kind === "scene") this.switchScene(id);
    else this.render();
    toast(`${name}已经加入素材包。`);
  }
  async replacePack(record) {
    if (this.busy || this.imageBusy.size)
      throw new Error("请等当前规划或生图结束后再切换资源包");
    this.pack = record.pack;
    this.assetBlobs = record.blobs;
    this.base = "./packs/reading-room/";
    this.refreshAssetUrls();
    this.state = createState(this.pack);
    this.selectedDestination = "";
    this.selection = null;
    await this.savePack();
    this.tab = "home";
    this.render();
    toast("新素材包已经铺好，开始一段新的生活。");
  }
  async updateExample() {
    if (this.busy || this.imageBusy.size) throw new Error("请等当前请求完成");
    const pack = await fetch("./packs/reading-room/pack.json").then((r) => {
      if (!r.ok) throw new Error("示例包加载失败");
      return r.json();
    });
    const errors = validatePack(pack);
    if (errors.length) throw new Error(errors.join("；"));
    const blobs = {};
    for (const asset of Object.values(this.pack.assets))
      blobs[asset.src] = await this.getBlob(asset.src);
    await storage.write("previous-pack", {
      pack: this.pack,
      state: this.state,
      blobs,
      base: this.base,
    });
    const fresh = createState(pack);
    this.state = restoreState(
      {
        ...this.state,
        packId: pack.id,
        layouts:
          this.state.packId === pack.id ? this.state.layouts : fresh.layouts,
      },
      pack,
    );
    this.pack = pack;
    this.bundled = structuredClone(pack);
    this.assetBlobs = {};
    this.base = "./packs/reading-room/";
    this.refreshAssetUrls();
    this.selection = null;
    await this.savePack();
    this.render();
    toast("示例素材已更新，旅行和照片已保留；可撤销这次更新。");
  }
  async restorePreviousPack() {
    const record = await storage.read("previous-pack");
    if (!record) throw new Error("还没有可恢复的素材快照");
    this.pack = record.pack;
    this.state = restoreState(record.state, record.pack);
    this.assetBlobs = record.blobs;
    this.base = record.base;
    this.refreshAssetUrls();
    await this.refreshMediaUrls();
    await this.savePack();
    this.selection = null;
    this.render();
    toast("已恢复更新前的素材和布置。");
  }
  async loadSave(file) {
    if (this.busy || this.imageBusy.size)
      throw new Error("请等当前规划或生图结束后再恢复存档");
    const data = await storage.parseSaveFile(file, { allowLegacy: true });
    const restoredPack = data.legacy
      ? structuredClone(this.bundled)
      : data.pack;
    const state = data.legacy
      ? migrateLegacyState(data.state, restoredPack)
      : restoreState(data.state, restoredPack);
    for (const key of [
      "planningMode",
      "connectionMode",
      "textProtocol",
      "textBaseUrl",
      "textModel",
      "imageBaseUrl",
      "imageModel",
      "imageMode",
      "imageProtocol",
      "imageSize",
      "imageQuality",
    ])
      state.settings[key] = this.state.settings[key];
    state.appliedProviderConfig = this.state.appliedProviderConfig;
    state.settings.autoTravel = false;
    state.settings.autoGenerate = false;
    for (const trip of [state.currentTrip, ...state.trips].filter(Boolean)) {
      trip.photoMode = "default";
      if (!trip.itinerary) continue;
      fallbackJourney(trip, "导入存档后先使用本地方案", gameNow(state));
      for (const node of trip.itinerary.nodes)
        if (!node.imageId && node.imageStatus === "queued")
          node.imageStatus = "default";
    }
    for (const [id, blob] of Object.entries(data.media))
      await storage.write(`media:${id}`, blob);
    this.pack = restoredPack;
    this.assetBlobs = data.legacy ? {} : data.blobs;
    this.base = "./packs/reading-room/";
    this.refreshAssetUrls();
    this.state = state;
    for (const t of this.state.trips)
      if (t.imageStatus === "generating") t.imageStatus = "failed";
    await this.refreshMediaUrls();
    await this.savePack();
    this.tab = "home";
    this.selection = null;
    this.tick(false);
    this.render();
    toast("存档已恢复。保留本机 API 配置，自动旅行与自动生图已暂停。");
  }
  async saveSettings(form) {
    const d = new FormData(form),
      next = { ...this.state.settings };
    for (const [key, value] of d.entries())
      if (!["textKey", "imageKey", "proxyToken", "companionName"].includes(key))
        next[key] = value;
    for (const key of ["autoTravel", "autoGenerate", "wanderBetweenScenes"])
      next[key] = d.has(key);
    for (const key of [
      "travelMinutes",
      "frequencyMinutes",
      "activityMinMinutes",
      "activityMaxMinutes",
      "directedTripCost",
      "coinMailMinutes",
      "coinMailAmount",
      "travelMinMinutes",
      "travelMaxMinutes",
      "restMinMinutes",
      "restMaxMinutes",
      "journeyMinNodes",
      "journeyMaxNodes",
    ])
      next[key] = Number(next[key]);

    const frequencyChanged =
      next.restMinMinutes !== this.state.settings.restMinMinutes ||
      next.restMaxMinutes !== this.state.settings.restMaxMinutes;
    this.state.settings = normalizeSettings(next);
    this.state.companionName = String(
      d.get("companionName") || this.character().name,
    ).slice(0, 40);
    this.secrets = {
      textKey: String(d.get("textKey") || ""),
      imageKey: String(d.get("imageKey") || ""),
      proxyToken: String(d.get("proxyToken") || ""),
    };
    if (frequencyChanged)
      this.state.nextTripAt = nextAutoDeparture(this.state.settings, gameNow(this.state));
    await this.saveNow();
    toast("设置已保存。日常生活依然不调用 API。");
  }
  async applyInspector(form) {
    const d = new FormData(form),
      id = d.get("id");
    const entity = this.state.layouts[this.state.viewSceneId].find(
      (p) => p.id === id,
    );
    if (!entity) return;
    const furnitureId = d.get("furnitureId");
    if (furnitureId !== entity.furnitureId)
      throw new Error("替换家具请先收回，再从仓库摆放");
    if (!this.pack.furniture.some((f) => f.id === furnitureId))
      throw new Error("家具不存在");
    entity.width = clamp(Number(d.get("width")) / 100, 0.02, 1);
    entity.z = clamp(Number(d.get("z")), 0, 100);
    entity.flip = d.has("flip");
    entity.furnitureId = furnitureId;
    movePlacement(
      this.state,
      this.state.viewSceneId,
      id,
      Number(d.get("x")) / 100,
      Number(d.get("y")) / 100,
    );
    if (!resolveActivity(this.pack, this.state))
      this.state.activity = chooseActivity(this.pack, this.state);
    this.scene.drawFurniture();
    this.updateInspector();
    await this.saveNow();
    toast("布置已更新。");
  }
  addFurniture(id) {
    const placement = placeFurniture(this.pack, this.state, id);
    this.selection = { id: placement.id, type: "furniture" };
    this.save();
    this.render();
    return placement;
  }
  resizeSelection(width) {
    const placement = this.state.layouts[this.state.viewSceneId].find(p => p.id === this.selection?.id);
    if (!placement) return;
    placement.width = clamp(width, 0.02, 1);
    for (const input of document.querySelectorAll('#inspector-form input[name="width"], [data-furniture-width]'))
      input.value = String(placement.width * 100);
    for (const label of document.querySelectorAll("[data-size-label]"))
      label.textContent = `${Number((placement.width * 100).toFixed(1))}%`;
    this.scene.drawFurniture();
    this.save();
  }
  updatePlacementField(input) {
    const placement = this.state.layouts[this.state.viewSceneId].find(p => p.id === this.selection?.id);
    if (!placement || !["x", "y", "z", "flip"].includes(input.name)) return false;
    if (input.name === "flip") placement.flip = input.checked;
    else {
      if (input.value === "" || !input.validity.valid || !Number.isFinite(Number(input.value))) return false;
      placement[input.name] = Number(input.value) / (input.name === "z" ? 1 : 100);
    }
    this.scene.drawFurniture();
    this.save();
    return true;
  }
  async prepareExport(kind, pack = this.pack) {
    if (this.exporting) { toast("正在准备文件，请稍候。"); return; }
    this.exporting = true;
    const title = kind === "save" ? "导出完整存档" : "导出素材包";
    this.showModal(title, '<p>正在收集素材和照片，首次准备可能需要一些时间。</p><progress data-export-progress max="1" value="0" style="width:100%" aria-label="导出准备进度"></progress><p data-export-status role="status">开始准备…</p>');
    const modal = this.modal();
    modal.dataset.exportKind = kind;
    try {
      const onProgress = ({ completed, total }) => {
        if (modal.dataset.exportKind !== kind) return;
        const progress = modal.querySelector("[data-export-progress]"), status = modal.querySelector("[data-export-status]");
        if (progress) { progress.max = Math.max(1, total); progress.value = completed; }
        if (status) status.textContent = completed === total ? "素材已收齐，正在完成 ZIP…" : `已收集 ${completed} / ${total} 项素材`;
      };
      const result = kind === "save"
        ? await storage.exportSave(this.state, this.pack, src => this.getBlob(src), { onProgress })
        : await storage.exportPack(pack, src => this.getBlob(src), { onProgress });
      const previous = this.exportUrl;
      this.exportUrl = URL.createObjectURL(result.blob);
      if (previous) setTimeout(() => URL.revokeObjectURL(previous), 60000);
      this.showModal(title, `<p>文件已准备好（${(result.blob.size / 1024 / 1024).toFixed(1)} MB）。点击下面的按钮保存到设备。</p><p><a class="btn primary full" href="${esc(this.exportUrl)}" download="${esc(result.filename)}">${icon("download", 18)} 保存 ZIP 文件</a></p><p class="field-help">文件名：${esc(result.filename)}。${kind === "save" ? "下载后可通过“导入存档”恢复进度、素材和照片。" : "下载后可通过“导入素材包”使用。"}</p>`);
    } catch (error) {
      this.showModal(title, `<p role="alert">${esc(error.name === "TimeoutError" ? "读取素材超时，请检查网络后重试。" : error.message || "文件准备失败，请重试。")}</p>${button(kind === "save" ? "export-save" : "export-pack", "重新准备", "reset", "primary")}`);
    } finally { this.exporting = false; }
  }
  preview(actionId) {
    const placement = this.state.layouts[this.state.viewSceneId].find(
      (p) => p.id === this.selection?.id,
    );
    if (!placement) throw new Error("先点选一件家具");
    previewActivity(
      this.pack,
      this.state,
      this.state.viewSceneId,
      placement.id,
      actionId,
    );
    this.save();
    this.updateInspector();
  }
  async action(action, target) {
    if (action === "toggle-housing") {
      const panel = document.querySelector(".housing-panel"), restore = document.querySelector(".housing-restore");
      this.housingCollapsed = !this.housingCollapsed;
      if (panel) {
        if (this.housingCollapsed) this.housingScroll = panel.scrollTop;
        panel.hidden = this.housingCollapsed;
        if (!this.housingCollapsed) panel.scrollTop = this.housingScroll || 0;
      }
      if (restore) restore.hidden = !this.housingCollapsed;
      (this.housingCollapsed ? restore : panel?.querySelector('[data-action="toggle-housing"]'))?.focus({ preventScroll: true });
      return;
    }
    if (["shrink-selection", "enlarge-selection"].includes(action)) {
      const placement = this.state.layouts[this.state.viewSceneId].find(p => p.id === this.selection?.id);
      if (placement) {
        this.resizeSelection(placement.width + (action === "shrink-selection" ? -0.01 : 0.01));
        await this.saveNow();
      }
      return;
    }
    if (action === "zoom-in") return this.scene.zoom(1.15);
    if (action === "zoom-out") return this.scene.zoom(1 / 1.15);
    if (action === "fit") return this.scene.fitView();
    if (action === "close-modal") return this.modal().close();
    if (action === "coin-mail")
      return this.showModal("金币来信", views.coinMailView(this));
    if (action === "prepare") {
      this.departureChoice = "random";
      if (this.tab !== "travel") return this.navigate("travel");
      if (this.state.currentTrip)
        return this.showTrip(this.state.currentTrip.id);
      return this.showModal("准备出发", views.departureFormView(this));
    }
    if (action === "atlas-prepare") {
      this.departureChoice = "directed";
      if (destinationById(this.selectedRegion))
        this.selectedDestination = this.selectedRegion;
      if (this.state.currentTrip)
        return this.showTrip(this.state.currentTrip.id);
      return this.showModal("准备出发", views.departureFormView(this));
    }
    if (action === "gallery") return this.navigate("gallery");
    if (action === "edit") return this.navigate("studio");
    if (action === "preview-console") {
      this.navigate("studio");
      this.developerPreview = true;
      this.render();
      return;
    }
    if (action === "change-activity") {
      if (this.state.currentTrip) {
        toast("伙伴正在旅行，回来后再换个地方坐坐。");
        return;
      }
      this.state.activity = chooseActivity(this.pack, this.state);
      this.save();
      document
        .querySelector("[data-activity]")
        ?.replaceChildren(document.createTextNode(views.activityName(this)));
      return;
    }
    if (action === "trip-detail")
      return this.showTrip(this.state.currentTrip?.id);
    if (action === "generate-node-photo")
      return this.generateJourneyPhoto(target.dataset.id);
    if (action === "generate-photo")
      return this.generateTripImage(target.dataset.id);
    if (action === "copy-prompt") {
      const t =
        this.state.trips.find((t) => t.id === target.dataset.id) ||
        this.state.currentTrip;
      const text =
        document.querySelector("#trip-prompt")?.value || t?.prompt || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("提示词已复制。");
      } catch {
        document.querySelector("#trip-prompt")?.select();
        toast("请从选中的文本复制提示词。");
      }
      return;
    }
    if (action === "save-trip-prompt") {
      const t = this.state.trips.find((t) => t.id === target.dataset.id);
      t.prompt = document.querySelector("#trip-prompt").value.slice(0, 6000);
      await this.saveNow();
      toast("提示词已保存。");
      return;
    }
    if (action === "download-photo") {
      const blob = await storage.read(`media:${target.dataset.imageId}`);
      if (blob)
        storage.download(
          blob,
          `回忆-${target.dataset.imageId}.${blob.type === "image/jpeg" ? "jpg" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "png"}`,
        );
      return;
    }
    if (action === "import-memory")
      return this.chooseFiles(
        "image/png,image/jpeg,image/webp,image/gif",
        (files) => this.importMemories(files),
        true,
      );
    if (action === "import-furniture") return this.importAsset("furniture");
    if (action === "import-item") return this.importAsset("item");
    if (action === "update-example") return this.updateExample();
    if (action === "restore-previous-pack") return this.restorePreviousPack();
    if (action === "import-outfit") return this.importAsset("outfit");
    if (action === "import-action") return this.importAsset("action");
    if (action === "add-scene") return this.importAsset("scene");
    if (action === "delete-selection") {
      storeFurniture(this.pack, this.state, this.selection?.id);
      this.selection = null;
      this.save();
      this.render();
      toast("家具已收回仓库。");
      return;
    }
    if (action === "export-pack") {
      const pack = structuredClone(this.pack);
      for (const scene of pack.scenes) {
        scene.placements = structuredClone(this.state.layouts[scene.id]);
      }
      pack.defaults = {
        ...pack.defaults,
        travelMinutes: this.state.settings.travelMinutes,
        frequencyMinutes: this.state.settings.frequencyMinutes,
        activityMinMinutes: this.state.settings.activityMinMinutes,
        activityMaxMinutes: this.state.settings.activityMaxMinutes,
      };
      await this.prepareExport("pack", pack);
      return;
    }
    if (action === "import-pack")
      return this.chooseFiles(".zip", async ([file]) => {
        const record = await storage.parsePackFile(file);
        this.pendingPack = record;
        this.showModal(
          "使用新的素材包",
          `<p>即将载入「${esc(record.pack.name)}」：${record.pack.scenes.length} 个场景、${record.pack.outfits.length} 套装扮、${record.pack.furniture.length} 种家具。</p><p class="field-help">这会开启新的本地存档。请先导出当前进度，需要时可以完整恢复。</p><div class="modal-actions">${button("export-save", "先备份当前存档", "download")}${button("confirm-pack", "载入新资源包", "check", "primary")}</div>`,
        );
      });
    if (action === "confirm-pack") {
      this.modal().close();
      return this.replacePack(this.pendingPack);
    }
    if (action === "export-save") {
      await this.prepareExport("save");
      return;
    }
    if (action === "import-save")
      return this.chooseFiles(".zip", async ([file]) => {
        this.pendingSave = file;
        this.showModal(
          "恢复存档",
          '<p>恢复会替换当前设备里的进度。建议先保留一份当前备份。</p><div class="modal-actions">' +
            button("export-save", "先导出当前存档", "download") +
            button("confirm-save", "恢复所选存档", "check", "primary") +
            "</div>",
        );
      });
    if (action === "confirm-save") {
      this.modal().close();
      return this.loadSave(this.pendingSave);
    }
    if (action === "export-defaults") {
      const { textBaseUrl, textModel, imageBaseUrl, imageModel, ...defaults } =
        this.state.settings;
      storage.downloadJson(defaults, "roam-defaults.json");
      return;
    }
    if (action === "set-pack-defaults") {
      const form = document.querySelector("#settings-form");
      if (form) await this.saveSettings(form);
      this.pack.defaults = {
        ...this.pack.defaults,
        travelMinutes: this.state.settings.travelMinutes,
        frequencyMinutes: this.state.settings.frequencyMinutes,
        activityMinMinutes: this.state.settings.activityMinMinutes,
        activityMaxMinutes: this.state.settings.activityMaxMinutes,
        wanderBetweenScenes: this.state.settings.wanderBetweenScenes,
        directedTripCost: this.state.settings.directedTripCost,
        coinMailMinutes: this.state.settings.coinMailMinutes,
        coinMailAmount: this.state.settings.coinMailAmount,
        journeyMaxNodes: this.state.settings.journeyMaxNodes,
        journeyMinNodes: this.state.settings.journeyMinNodes,
        photoStyleId: this.state.settings.photoStyleId,
        restMaxMinutes: this.state.settings.restMaxMinutes,
        restMinMinutes: this.state.settings.restMinMinutes,
        travelMaxMinutes: this.state.settings.travelMaxMinutes,
        travelMinMinutes: this.state.settings.travelMinMinutes,
      };
      await this.savePack();
      toast("已设为资源包默认值，导出资源包后新用户会使用这些节奏。");
      return;
    }
    if (action === "advance-time") return this.advanceTime(Number(target.dataset.minutes));
    if (action === "advance-event") return this.advanceTime("next");
    if (action === "deliver-next-node") {
      const next = this.state.currentTrip?.itinerary?.nodes.find(
        (n) => n.deliveredAt == null,
      );
      if (!next) throw new Error("没有尚未寄出的节点");
      next.deliverAt = gameNow(this.state);
      this.tick();
      await this.saveNow();
      this.render();
      return;
    }
    if (action === "return-now") {
      if (!this.state.currentTrip) throw new Error("目前没有进行中的旅程");
      this.state.currentTrip.returnAt = gameNow(this.state);
      this.tick();
      await this.saveNow();
      this.render();
      return;
    }
    if (action === "reset-state") {
      this.showModal(
        "重新开始",
        `<p>重新开始会清空当前进度和相册列表。已导出的备份仍可恢复。</p><div class="modal-actions">${button("export-save", "先导出备份", "download")}${button("confirm-reset", "重新开始", "reset", "danger")}</div>`,
      );
      return;
    }
    if (action === "confirm-reset") {
      if (this.busy || this.imageBusy.size)
        throw new Error("请等当前任务结束后再重新开始");
      this.state = createState(this.pack);
      await this.saveNow();
      this.tab = "home";
      this.render();
      toast("新的一天，慢慢开始。");
      return;
    }
    if (action === "delete-memory") {
      this.pendingDeleteMemory = target.dataset.id;
      this.showModal(
        "删除这张回忆",
        `<p>这会从当前本地相册中移除图片。已导出的备份不会改变。</p><div class="modal-actions">${button("confirm-delete-memory", "删除这张回忆", "trash", "danger")}${button("close-modal", "保留", "", "quiet")}</div>`,
      );
      return;
    }
    if (action === "confirm-delete-memory") {
      const m = this.state.memories.find(
        (m) => m.id === this.pendingDeleteMemory,
      );
      this.state.memories = this.state.memories.filter((x) => x.id !== m.id);
      await storage.remove(`media:${m.imageId}`);
      URL.revokeObjectURL(this.mediaUrls[m.imageId]);
      delete this.mediaUrls[m.imageId];
      await this.saveNow();
      this.render();
      return;
    }
    if (action === "clear-region") {
      this.selectedRegion = "";
      this.render();
      return;
    }
    if (action === "map-full") {
      const map = this.maps?.[this.atlasMode === "china" ? "china" : "world"];
      if (map)
        window.open(new URL(map.file, location.href), "_blank", "noopener");
      return;
    }
    if (action === "map-retry") return this.render();
    if (action === "map-source") {
      const map = this.maps?.[this.atlasMode];
      return this.showModal(
        "地图资料",
        `<div class="atlas-source-notes"><p>交互地图采用中国版图口径的矢量资料，台湾、香港、澳门归入中国，保留藏南、阿克赛钦、钓鱼岛及南海诸岛和相关界线。</p><p>中国省级数据由开源资料库转存自天地图；世界数据来自同库收录的 Surbowl 中文地理资料。原始坐标保存在项目内，未手工改画边界。</p><p><a href="https://github.com/JayMuShui/chinese-global-compliant-geodata/tree/3cf3485789876c37be6193bf2848cf9aaa40f758" target="_blank" rel="noopener noreferrer">查看矢量资料来源</a> · <a href="./maps/MAP-ASSETS.md" target="_blank" rel="noopener noreferrer">版本与核对说明</a></p>${map ? `<hr><h3>标准地图对照原图</h3><p>${esc(map.title)}<br>${esc(map.reviewNumber)} · ${esc(map.sourceLabel)}</p><div class="modal-actions">${button("map-full", "打开标准地图原图", "expand", "small")}<a href="${esc(map.sourceUrl)}" target="_blank" rel="noopener noreferrer">原图发布页</a></div>` : ""}<p class="field-help">原图审图号仅属于对照原图，不代表本交互地图已取得新的地图审核。公开使用前需完成适用的地图审核。</p></div>`,
      );
    }
    if (action === "edit-config") {
      const pack = structuredClone(this.pack);
      for (const scene of pack.scenes) {
        scene.placements = this.state.layouts[scene.id];
      }
      this.showModal(
        "完整素材包配置",
        `<form id="config-form"><p class="field-help">可以调整家具互动帧、整套装扮、画布对齐、场景与默认参数。资源文件需已存在于本素材包。</p><textarea name="json" class="code-editor" rows="20" spellcheck="false">${esc(JSON.stringify(pack, null, 2))}</textarea><button type="submit" class="btn primary full">校验并应用配置</button></form>`,
        true,
      );
      return;
    }
    if (action === "help")
      return this.showModal(
        "在自己的节奏里漫游",
        `<div class="help-grid"><article>${icon("home", 24)}<h3>日常生活</h3><p>伙伴会在一件家具上停留，过一阵再换个活动。拖动画面或双指缩放，找到舒服的视角。</p></article><article>${icon("bag", 24)}<h3>带上行囊</h3><p>整套装扮改变外观，随身物品影响旅行灵感。可以自己选目的地，也可以交给本地规则或文字 AI。</p></article><article>${icon("edit", 24)}<h3>自由布置</h3><p>拖动家具。点击家具替换样式、调整大小和遮挡。支持任意尺寸底图、透明 PNG、GIF 与图集。</p></article><article>${icon("shield", 24)}<h3>留住回忆</h3><p>旧照片和旅途图片默认只在本地保存。请定期导出完整存档，换设备时也可以导入。</p></article></div><div class="doc-links"><a href="./docs/ASSET-PACK-SPEC.md" target="_blank">素材包规范</a><a href="./docs/AI-ASSET-AUTHORING.md" target="_blank">AI 素材制作指南</a><a href="./docs/README.md" target="_blank">框架使用说明</a><a href="./maps/MAP-ASSETS.md" target="_blank">地图来源说明</a></div>`,
        true,
      );
  }
  bind() {
    document.addEventListener("click", async (e) => {
      const target = e.target.closest("button,[data-tab],[data-photo]");
      if (!target || target.disabled) return;
      try {
        if (target.dataset.tab)
          return this.navigate(target.dataset.tab, {
            toggle: Boolean(target.closest(".game-dock")),
          });
        if (target.dataset.scene) return this.switchScene(target.dataset.scene);
        if (target.dataset.photo)
          return this.showPhoto(
            target.dataset.photo,
            target.dataset.demo === "1",
          );
        if (target.dataset.action)
          return await this.action(target.dataset.action, target);
        if (target.dataset.photoStyle) {
          const id = target.dataset.photoStyle;
          if (
            id !== PACK_STYLE_ID &&
            !PHOTO_STYLES.some((style) => style.id === id)
          )
            return;
          this.state.settings.photoStyleId = normalizePhotoStyleId(id);
          document.querySelectorAll("[data-photo-style]").forEach((node) => {
            const active = node.dataset.photoStyle === id;
            node.setAttribute("aria-pressed", String(active));
            node.classList.toggle("is-selected", active);
          });
          const selected = document.querySelector(
            "[data-selected-photo-style]",
          );
          if (selected)
            selected.innerHTML = views.photoStyleSelectionView(this);
          await this.saveNow();
          toast("照片风格已保存，从下一次旅行起生效。");
          return;
        }
        if (target.dataset.shopCategory) {
          this.shopCategory = target.dataset.shopCategory;
          this.render();
          return;
        }
        if (target.dataset.shopOpen) {
          this.shopCategory = target.dataset.shopOpen;
          this.navigate("shop");
          return;
        }
        if (target.dataset.buyId) {
          if (this.busy) throw new Error("伙伴正在准备出发，请稍后再购买");
          const category = target.dataset.buyCategory,
            id = target.dataset.buyId;
          purchase(this.pack, this.state, category, id);
          await this.saveNow();
          this.render();
          toast(`${this.pack[category].find((p) => p.id === id).name}已购入。`);
          return;
        }
        if (target.dataset.outfit) {
          if (!this.pack.outfits.some((o) => o.id === target.dataset.outfit))
            return;
          if (!owns(this.state, "outfits", target.dataset.outfit))
            throw new Error("先在商店购买这套装扮");
          this.state.selectedOutfitId = target.dataset.outfit;
          this.captureTravelForm();
          this.save();
          this.render();
        }
        if (target.dataset.carry) {
          if (!owns(this.state, "items", target.dataset.carry))
            throw new Error("先在商店购买这件物品");
          const id = target.dataset.carry,
            i = this.state.backpack.indexOf(id);
          if (i >= 0) this.state.backpack.splice(i, 1);
          else {
            if (this.state.backpack.length >= 8)
              throw new Error("行囊里最多放8件随身物品");
            this.state.backpack.push(id);
          }
          this.captureTravelForm();
          this.save();
          this.render();
        }
        if (target.dataset.selectPlacement) {
          const id = target.dataset.selectPlacement;
          if (
            !this.state.layouts[this.state.viewSceneId].some((p) => p.id === id)
          )
            return;
          this.selection = { id, type: "furniture" };
          this.scene.setEditing(this.tab === "studio", id);
          this.updateInspector();
        }
        if (target.dataset.addFurniture)
          return this.addFurniture(target.dataset.addFurniture);
        if (target.dataset.previewAction)
          this.preview(target.dataset.previewAction);
        if (target.dataset.atlasMode) {
          this.atlasMode = target.dataset.atlasMode;
          this.selectedRegion = atlasSelectionForMode(
            this.selectedRegion,
            this.atlasMode,
          );
          this.atlasSearch = "";
          this.render();
        }
        if (target.dataset.region) {
          this.selectAtlasRegion(target.dataset.region);
        }
      } catch (error) {
        toast(error.message || "操作未完成", true);
      }
    });
    document.addEventListener("submit", async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      // A field named "id" shadows HTMLFormElement.id (inspector and memories).
      const formId = form.getAttribute("id");
      e.preventDefault();
      try {
        if (formId === "travel-form") {
          const d = new FormData(form);
          await this.startTrip(
            d.get("destinationMode") === "directed"
              ? String(d.get("destinationId"))
              : "",
            String(d.get("instruction")),
          );
        }
        if (formId === "clock-form") return this.advanceTime(Number(new FormData(form).get("minutes")));
        if (formId === "profile-form") {
          const name = String(
            new FormData(form).get("companionName") || "",
          ).trim();
          if (!name) throw new Error("给伙伴起个名字吧");
          this.state.companionName = name.slice(0, 40);
          await this.saveNow();
          toast("名字已保存。");
        }
        if (formId === "settings-form") await this.saveSettings(form);
        if (formId === "inspector-form") await this.applyInspector(form);
        if (formId === "asset-form") await this.commitAsset(form);
        if (formId === "memory-form") {
          const d = new FormData(form),
            m = this.state.memories.find((m) => m.id === d.get("id"));
          m.title = String(d.get("title")).slice(0, 100);
          m.note = String(d.get("note")).slice(0, 2000);
          m.destinationId = String(d.get("destinationId"));
          await this.saveNow();
          this.modal().close();
          this.render();
          toast("这段回忆已保存。");
        }
        if (formId === "config-form") {
          const pack = JSON.parse(
            new FormData(form).get("json"),
            (key, value) => {
              if (["__proto__", "constructor", "prototype"].includes(key))
                throw new Error("配置包含不安全字段");
              return value;
            },
          );
          const errors = validatePack(pack);
          if (errors.length) throw new Error(errors.slice(0, 6).join("；"));
          for (const asset of Object.values(pack.assets))
            if (
              !Object.values(this.pack.assets).some((a) => a.src === asset.src)
            )
              throw new Error("新增图片请通过导入功能加入，不能引用包外文件");
          const oldState = {
            ...this.state,
            packId: pack.id,
            layouts: Object.fromEntries(
              pack.scenes.map((s) => [s.id, s.placements || []]),
            ),
          };
          this.pack = pack;
          this.state = restoreState(oldState, pack);
          await this.savePack();
          this.modal().close();
          this.render();
          toast("配置通过校验，已应用。");
        }
      } catch (error) {
        toast(error.message || "保存未完成", true);
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.matches('#inspector-form input[name="flip"], #inspector-form input[name="x"], #inspector-form input[name="y"], #inspector-form input[name="z"]') && this.updatePlacementField(e.target)) this.saveNow();
      if (e.target.matches('#inspector-form input[name="width"], [data-furniture-width]')) this.saveNow();
      if (e.target.name === "destinationMode") {
        const form = e.target.closest("form"),
          directed = form.elements.destinationMode.value === "directed";
        const button = form.querySelector('button[type="submit"]'),
          fee = directed ? directedTripPrice(this.state.settings) : 0;
        button.textContent = fee ? `花费 ${fee} 金币出发` : "免费随机出发";
        button.disabled = Boolean(
          this.busy || this.state.currentTrip || this.state.economy.coins < fee,
        );
      }
      if (e.target.id === "visited-only") {
        this.visitedOnly = e.target.checked;
        this.render();
      }
      if (e.target.id === "outfit-select") {
        if (!owns(this.state, "outfits", e.target.value)) return;
        this.state.selectedOutfitId = e.target.value;
        this.save();
        this.updateInspector();
      }
    });
    document.addEventListener("input", (e) => {
      if (e.target.matches('#inspector-form input[name="x"], #inspector-form input[name="y"], #inspector-form input[name="z"]')) this.updatePlacementField(e.target);
      if (e.target.matches('#inspector-form input[name="width"], [data-furniture-width]'))
        this.resizeSelection(Number(e.target.value) / 100);
      if (e.target.id === "region-search") {
        const value = e.target.value;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          this.atlasSearch = value;
          this.render();
          const input = document.querySelector("#region-search");
          input?.focus();
        }, 160);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal()?.open && this.tab !== "home")
        this.navigate("home");
    });
  }
}

if (typeof document !== "undefined") {
  const app = new Atelier();
  app.init().catch((error) => {
  document.querySelector("#app").innerHTML =
    `<div class="loading-screen"><h1>小屋还没准备好</h1><p>${esc(error.message)}</p><button class="btn" onclick="location.reload()">重新载入</button></div>`;
  console.error(error);
  });
}
