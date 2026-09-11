import { esc, icon } from "./util.js";
import { visitCount } from "./core/atlas.js";

const cache = new Map();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function loadMap(mode) {
  if (!cache.has(mode)) cache.set(mode, fetch(`./maps/${mode}-atlas.json`).then((response) => {
    if (!response.ok) throw new Error("地图暂时没有载入");
    return response.json();
  }).catch((error) => { cache.delete(mode); throw error; }));
  return cache.get(mode);
}

export class AtlasMap {
  constructor(node, options) {
    this.node = node;
    this.options = options;
    this.camera = { x: 0, y: 0, k: 1, ...options.camera };
    this.abort = new AbortController();
    this.pointers = new Map();
    this.load();
  }

  async load() {
    try {
      this.data = await loadMap(this.options.mode);
      if (this.abort.signal.aborted) return;
      this.draw();
      this.node.setAttribute("aria-busy", "false");
      this.bind();
      const selected = this.data.regions.find((region) => region.destinationId === this.options.selected);
      if (selected) {
        const x = selected.center[0] * this.camera.k + this.camera.x;
        const y = selected.center[1] * this.camera.k + this.camera.y;
        if (x < 24 || x > this.data.width - 24 || y < 24 || y > this.data.height - 24) {
          this.camera.x = this.data.width / 2 - selected.center[0] * this.camera.k;
          this.camera.y = this.data.height / 2 - selected.center[1] * this.camera.k;
        }
      }
      this.updateCamera();
    } catch {
      this.node.setAttribute("aria-busy", "false");
      if (!this.abort.signal.aborted) this.node.innerHTML = `<div class="atlas-load-state" role="status">${icon("globe", 32)}<p>地图暂时没有载入</p><button class="btn small" data-action="map-retry">重新载入</button><small>地点列表和相册仍可使用。</small></div>`;
    }
  }

  regionClass(region) {
    const visited = visitCount(this.options.visits, region.destinationId) > 0;
    return `atlas-region ${region.destinationId ? "is-place" : "is-context"} ${visited ? "is-visited" : ""} ${region.destinationId === this.options.selected ? "is-selected" : ""}`;
  }

  draw() {
    const { data } = this;
    const china = this.options.mode === "china";
    const first = data.regions.find((region) => region.destinationId === this.options.selected)
      || data.regions.find((region) => region.destinationId === (china ? "CN-11" : "CN"));
    this.node.innerHTML = `<div class="atlas-canvas" tabindex="0" aria-label="${china ? "中国省级" : "世界"}足迹地图。拖动平移，滚轮或双指缩放；加减键缩放，方向键移动，Home 键复位。">
      <svg class="atlas-svg" viewBox="0 0 ${data.width} ${data.height}" role="group" aria-label="${china ? "中国34个省级地区" : "世界目的地"}">
        <g class="atlas-map-layer">
          <path class="atlas-graticule" d="${esc(data.graticule)}"/>
          ${data.regions.map((region) => `<g class="${this.regionClass(region)}" ${region.destinationId ? `data-map-region="${region.destinationId}" role="button" tabindex="${region === first ? "0" : "-1"}" aria-label="${esc(region.name)}，已到访 ${visitCount(this.options.visits, region.destinationId)} 次${region.destinationId === "CN" ? "，查看省级地区" : ""}" aria-pressed="${region.destinationId === this.options.selected}"` : `aria-label="${esc(region.name)}"`}>
            <path class="atlas-land" d="${esc(region.d || "")}"/>
            ${region.destinationId && region.small ? `<circle class="atlas-place-hit" cx="${region.center[0]}" cy="${region.center[1]}" r="8"/><circle class="atlas-small-place" cx="${region.center[0]}" cy="${region.center[1]}" r="2.5"/>` : ""}
          </g>`).join("")}
          ${data.lines.map((d) => `<path class="atlas-boundary" d="${esc(d)}"/>`).join("")}
          <g class="atlas-labels" aria-hidden="true">${data.regions.filter((region) => region.destinationId).map((region) => {
            const visited = visitCount(this.options.visits, region.destinationId);
            const selected = region.destinationId === this.options.selected;
            if (!visited && !selected) return "";
            return `<g class="atlas-place-label ${selected ? "is-selected" : ""}" transform="translate(${region.center.join(" ")})">${visited ? `<circle class="atlas-visit-dot" cy="${selected ? -14 : 0}" r="3"/>` : ""}${selected ? `<text>${esc(region.name)}</text>` : ""}</g>`;
          }).join("")}${data.labels.map((label) => `<text class="atlas-water-label" x="${label.point[0]}" y="${label.point[1]}">${label.text}</text>`).join("")}</g>
        </g>
      </svg>
    </div>
    ${data.inset ? `<div class="atlas-inset" aria-label="南海诸岛及相关界线"><span>南海诸岛</span><svg viewBox="0 0 158 232" role="img" aria-label="南海诸岛与南海断续线，台湾及东海相关界线"><g>${data.inset.regions.map((region) => `<path class="atlas-inset-land ${visitCount(this.options.visits, region.id) ? "is-visited" : ""}" d="${esc(region.d)}"/>`).join("")}${data.inset.lines.map((d) => `<path class="atlas-boundary" d="${esc(d)}"/>`).join("")}</g><text x="77" y="103">南海</text><text x="77" y="213" class="atlas-inset-south">曾母暗沙</text></svg></div>` : ""}
    <div class="atlas-zoom" aria-label="地图视角"><button type="button" data-map-zoom="in" aria-label="放大地图">${icon("plus", 17)}</button><span class="atlas-zoom-value">100%</span><button type="button" data-map-zoom="out" aria-label="缩小地图">${icon("minus", 17)}</button><i></i><button type="button" data-map-zoom="reset" aria-label="显示完整地图">${icon("expand", 17)}</button></div>`;
    this.canvas = this.node.querySelector(".atlas-canvas");
    this.svg = this.node.querySelector(".atlas-svg");
    this.layer = this.node.querySelector(".atlas-map-layer");
  }

  point(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
  }

  updateCamera() {
    const camera = this.camera;
    camera.k = clamp(camera.k, 1, 5);
    camera.x = clamp(camera.x, this.data.width * (1 - camera.k), 0);
    camera.y = clamp(camera.y, this.data.height * (1 - camera.k), 0);
    this.layer.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.k})`);
    this.svg.style.setProperty("--map-zoom", camera.k);
    this.node.querySelector(".atlas-zoom-value").textContent = `${Math.round(camera.k * 100)}%`;
    this.node.querySelector('[data-map-zoom="out"]').disabled = camera.k <= 1;
    this.node.querySelector('[data-map-zoom="in"]').disabled = camera.k >= 5;
    this.options.onCamera({ ...camera });
  }

  zoom(factor, point = { x: this.data.width / 2, y: this.data.height / 2 }) {
    const old = this.camera.k;
    const next = clamp(old * factor, 1, 5);
    this.camera.x = point.x - (point.x - this.camera.x) * next / old;
    this.camera.y = point.y - (point.y - this.camera.y) * next / old;
    this.camera.k = next;
    this.updateCamera();
  }

  bind() {
    const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { signal: this.abort.signal, ...options });
    listen(this.node, "click", (event) => {
      const control = event.target.closest("[data-map-zoom]");
      if (control) {
        if (control.dataset.mapZoom === "reset") { this.camera = { x: 0, y: 0, k: 1 }; this.updateCamera(); }
        else this.zoom(control.dataset.mapZoom === "in" ? 1.3 : 1 / 1.3);
        return;
      }
      if (this.dragged) { this.dragged = false; return; }
      const group = event.target.closest("[data-map-region]");
      if (group) this.options.onSelect(group.dataset.mapRegion);
    });
    listen(this.canvas, "wheel", (event) => {
      event.preventDefault();
      this.zoom(Math.exp(clamp(-event.deltaY * 0.002, -0.3, 0.3)), this.point(event));
    }, { passive: false });
    listen(this.canvas, "pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragged = false;
      this.pointers.set(event.pointerId, this.point(event));
      this.pointerStart = this.point(event);
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add("is-dragging");
      this.downRegion = event.target.closest("[data-map-region]")?.dataset.mapRegion;
    });
    listen(this.canvas, "pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const point = this.point(event);
      const previous = this.pointers.get(event.pointerId);
      const others = [...this.pointers.entries()].filter(([id]) => id !== event.pointerId);
      if (others.length) {
        const other = others[0][1];
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(point.x - other.x, point.y - other.y);
        if (before > 1) this.zoom(after / before, { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 });
        this.dragged = true;
      } else {
        this.camera.x += point.x - previous.x;
        this.camera.y += point.y - previous.y;
        if (Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) > 4) this.dragged = true;
        this.updateCamera();
      }
      this.pointers.set(event.pointerId, point);
    });
    const release = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (!this.pointers.size) this.canvas.classList.remove("is-dragging");
    };
    listen(this.canvas, "pointerup", (event) => {
      // Pointer capture retargets click to the canvas; preserve a tap's region.
      const tapped = !this.dragged && this.pointers.size === 1 && this.downRegion;
      release(event);
      if (tapped) { this.dragged = true; this.options.onSelect(tapped); }
    });
    listen(this.canvas, "pointercancel", (event) => { this.dragged = true; release(event); });
    listen(this.canvas, "keydown", (event) => {
      const group = event.target.closest("[data-map-region]");
      if (group && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        this.options.onSelect(group.dataset.mapRegion, true);
      } else if (group && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const groups = [...this.canvas.querySelectorAll("[data-map-region]")];
        const index = groups.indexOf(group);
        const next = groups[(index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + groups.length) % groups.length];
        group.setAttribute("tabindex", "-1"); next.setAttribute("tabindex", "0"); next.focus();
      } else if (["+", "=", "-", "Home", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        if (["+", "="].includes(event.key)) this.zoom(1.3);
        else if (event.key === "-") this.zoom(1 / 1.3);
        else if (["Home", "0"].includes(event.key)) { this.camera = { x: 0, y: 0, k: 1 }; this.updateCamera(); }
        else {
          this.camera.x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
          this.camera.y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
          this.updateCamera();
        }
      }
    });
  }

  destroy() { this.abort.abort(); }
}
