import {gameNow} from "./core/clock.js";
import { frameInfo } from "./core/pack.js";
import { clamp, movePlacement, furnitureFrame } from "./core/engine.js";
import { esc, toast } from "./util.js";
import { FrameBuffer } from "./core/frame-buffer.js";
import { loadDecodedImage } from "./images.js";
import { sceneCameraLayout, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from "./core/camera.js";

export function spriteStyle(pack, frame, resolve) {
  const f = frameInfo(pack, frame);
  return `background-image:url('${resolve(f.asset.src)}');background-size:${(f.width / f.w) * 100}% ${(f.height / f.h) * 100}%;background-position:${f.width === f.w ? 0 : (f.x / (f.width - f.w)) * 100}% ${f.height === f.h ? 0 : (f.y / (f.height - f.h)) * 100}%;aspect-ratio:${f.w}/${f.h}`;
}
export function spriteHtml(pack, frame, resolve, className = "", label = "") {
  const f = frameInfo(pack, frame);
  return `<svg class="sprite ${esc(className)}" viewBox="${f.x} ${f.y} ${f.w} ${f.h}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${f.w}/${f.h};overflow:hidden" role="img" aria-label="${esc(label)}"><image href="${esc(resolve(f.asset.src))}" x="0" y="0" width="${f.width}" height="${f.height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

export class SceneView {
  constructor(
    node,
    {
      pack,
      state,
      resolve,
      edit = false,
      selected = null,
      onSelect = () => {},
      onChange = () => {},
      onCamera = () => {},
    },
  ) {
    Object.assign(this, {
      node,
      pack,
      state,
      resolve,
      edit,
      selected,
      onSelect,
      onChange,
      onCamera,
    });
    this.scene =
      pack.scenes.find((s) => s.id === state.viewSceneId) || pack.scenes[0];
    this.camera = { zoom: 1, x: 0, y: 0, ...state.camera[this.scene.id] };
    this.pointers = new Map();
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.render();
    this.bind();
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(node);
    this.layout();
    this.animate();
  }
  render() {
    const scene = this.scene;
    this.node.innerHTML = `<div class="scene-plane" style="width:${scene.width}px;height:${scene.height}px"><img class="scene-background" src="${this.resolve(this.pack.assets[scene.background].src)}" alt="${esc(scene.name)}" draggable="false"><div class="furniture-layer"></div></div>`;
    this.plane = this.node.querySelector(".scene-plane");
    this.drawFurniture();
  }
  drawFurniture() {
    const placements = this.state.layouts[this.scene.id] || [];
    const sceneWidth = this.scene.width;
    if (
      this.entityNodes?.size === placements.length &&
      placements.every(
        (p) => this.entityNodes.get(p.id)?.furnitureId === p.furnitureId,
      )
    ) {
      for (const p of placements) {
        const node = this.entityNodes.get(p.id).node;
        const f = this.pack.furniture.find((f) => f.id === p.furnitureId);
        Object.assign(node.style, {
          left: `${p.x * 100}%`,
          top: `${p.y * 100}%`,
          width: `${p.width * this.scene.width}px`,
          height: `${p.width * this.scene.width * f.canvas.height / f.canvas.width}px`,
          zIndex: String(p.z ?? 10),
          transform: `translate(${-f.pivot[0] * 100}%,${-f.pivot[1] * 100}%) scaleX(${p.flip ? -1 : 1})`,
        });
      }
      this.setEditing(this.edit, this.selected);
      this.updateFrames();
      return;
    }
    for (const entry of this.entityNodes?.values() || [])
      entry.buffer.dispose();
    this.entityNodes = new Map();
    const layer = this.node.querySelector(".furniture-layer");
    layer.innerHTML = (this.state.layouts[this.scene.id] || [])
      .map((p) => {
        const f = this.pack.furniture.find((f) => f.id === p.furnitureId);
        if (!f) return "";
        return `<div class="entity furniture ${this.selected === p.id ? "selected" : ""} ${this.edit ? "editable" : ""}" data-entity="${esc(p.id)}" style="left:${p.x * 100}%;top:${p.y * 100}%;width:${p.width * sceneWidth}px;height:${p.width * sceneWidth * f.canvas.height / f.canvas.width}px;aspect-ratio:${f.canvas.width}/${f.canvas.height};z-index:${p.z ?? 10};transform:translate(${-f.pivot[0] * 100}%,${-f.pivot[1] * 100}%) scaleX(${p.flip ? -1 : 1})" ${this.edit ? `tabindex="0" role="button" aria-label="移动${esc(f.name)}"` : ""}>${f.shadow ? `<span class="ground-shadow" style="left:${f.shadow.x * 100}%;top:${f.shadow.y * 100}%;width:${f.shadow.width * 100}%;height:${f.shadow.height * 100}%;opacity:${f.shadow.opacity}"></span>` : ""}<div class="composite-frame"></div></div>`;
      })
      .join("");
    for (const node of layer.querySelectorAll("[data-entity]")) {
      const entry = {
        node,
        frameNode: node.querySelector(".composite-frame"),
        clip: null,
        furnitureId: placements.find((p) => p.id === node.dataset.entity)
          ?.furnitureId,
      };
      entry.buffer = new FrameBuffer({
        load: async (resolved) => {
          const info = frameInfo(this.pack, resolved.frame);
          const decoded = await loadDecodedImage(this.resolve(info.asset.src));
          const img = decoded.cloneNode();
          img.alt = "";
          img.draggable = false;
          img.style.cssText = `position:absolute;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;max-width:none;width:${(info.width / info.w) * 100}%;height:${(info.height / info.h) * 100}%;left:${(-info.x / info.w) * 100}%;top:${(-info.y / info.h) * 100}%;`;
          // Decode this DOM image as well before it replaces the visible image.
          if (img.decode) await img.decode();
          return img;
        },
        commit: (image, resolved) => {
          const r = resolved.frame.registration || {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          };
          entry.frameNode.style.cssText = `position:absolute;overflow:hidden;left:${r.x * 100}%;top:${r.y * 100}%;width:${r.width * 100}%;height:${r.height * 100}%;`;
          entry.frameNode.replaceChildren(image);
          entry.frameNode.setAttribute("role", "img");
          entry.frameNode.setAttribute(
            "aria-label",
            resolved.occupied
              ? `${this.state.companionName} · ${resolved.action.name}`
              : resolved.furniture.name,
          );
          node.dataset.occupied = String(resolved.occupied);
          node.dataset.outfit = resolved.outfitId || "";
          node.dataset.frame = String(resolved.index);
          node.dataset.frameReady = "true";
          delete node.dataset.frameError;
        },
        onError: (error) => {
          node.dataset.frameError = "true";
          toast(`${error.message}，暂时保留上一帧。`, true);
        },
      });
      this.entityNodes.set(node.dataset.entity, entry);
    }
    this.updateFrames();
  }
  setEditing(edit, selected) {
    this.edit = edit;
    this.selected = selected;
    for (const [id, entry] of this.entityNodes) {
      entry.node.classList.toggle("editable", edit);
      entry.node.classList.toggle("selected", selected === id);
      if (edit) {
        entry.node.tabIndex = 0;
        entry.node.setAttribute("role", "button");
        const p = this.state.layouts[this.scene.id].find((p) => p.id === id);
        const f = this.pack.furniture.find((f) => f.id === p?.furnitureId);
        entry.node.setAttribute("aria-label", `移动${f?.name || "家具"}`);
      } else {
        entry.node.removeAttribute("tabindex");
        entry.node.removeAttribute("role");
        entry.node.removeAttribute("aria-label");
      }
    }
  }
  updateFrames() {
    const now = gameNow(this.state);
    for (const placement of this.state.layouts[this.scene.id] || []) {
      const entry = this.entityNodes.get(placement.id);
      const resolved = furnitureFrame(
        this.pack,
        this.state,
        this.scene.id,
        placement,
        now,
      );
      if (!entry || !resolved) continue;
      if (entry.clip !== resolved.clip) {
        entry.clip = resolved.clip;
        for (const frame of resolved.clip?.frames || [])
          loadDecodedImage(
            this.resolve(this.pack.assets[frame.asset].src),
          ).catch(() => {});
      }
      const key = JSON.stringify([
        resolved.occupied,
        resolved.outfitId,
        resolved.frame,
        resolved.index,
      ]);
      entry.buffer.present(key, resolved);
    }
  }
  layout() {
    const rect = this.node.getBoundingClientRect();
    const layout = sceneCameraLayout(this.scene, rect, this.camera);
    if (!layout) return;
    this.fit = layout.fit;
    this.scale = layout.scale;
    Object.assign(this.camera, layout.camera);
    this.plane.style.transform = `translate(${layout.x}px,${layout.y}px) scale(${this.scale})`;
    const percentage = `${Math.round(this.camera.zoom * 100)}%`;
    this.node.dataset.zoom = percentage;
    const display = this.node.parentElement.querySelector("[data-zoom-label]");
    if (display) display.textContent = percentage;
    const zoomOut = this.node.parentElement.querySelector('[data-action="zoom-out"]');
    const zoomIn = this.node.parentElement.querySelector('[data-action="zoom-in"]');
    if (zoomOut) zoomOut.disabled = this.camera.zoom <= MIN_CAMERA_ZOOM;
    if (zoomIn) zoomIn.disabled = this.camera.zoom >= MAX_CAMERA_ZOOM;
  }
  zoom(factor) {
    this.camera.zoom = clamp(this.camera.zoom * factor, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    this.layout();
    this.onCamera(this.camera);
  }
  fitView() {
    this.camera = { zoom: MIN_CAMERA_ZOOM, x: 0, y: 0 };
    this.layout();
    this.onCamera(this.camera);
  }
  bind() {
    this.node.addEventListener('dragstart', event => event.preventDefault(), {signal:this.signal});
    this.node.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY < 0 ? 1.08 : 1 / 1.08);
      },
      { passive: false, signal: this.signal },
    );
    this.node.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button && event.button !== 0) return;
        event.preventDefault();
        this.node.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          this.pinch = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            zoom: this.camera.zoom,
          };
          this.drag = null;
          return;
        }
        const entity = this.edit ? event.target.closest("[data-entity]") : null;
        const id = entity?.dataset?.entity;
        if (id) {
          const type = "furniture";
          const value = this.state.layouts[this.scene.id].find(
            (p) => p.id === id,
          );
          this.drag = {
            type,
            id,
            x: event.clientX,
            y: event.clientY,
            originX: value.x,
            originY: value.y,
            width: value.width,
          };
          this.selected = id;
          this.node
            .querySelectorAll(".selected")
            .forEach((n) => n.classList.remove("selected"));
          entity.classList.add("selected");
          this.onSelect(id, type);
        } else
          this.drag = {
            type: "camera",
            x: event.clientX,
            y: event.clientY,
            originX: this.camera.x,
            originY: this.camera.y,
          };
        this.node.classList.add("dragging");
      },
      { signal: this.signal },
    );
    this.node.addEventListener(
      "pointermove",
      (event) => {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (this.pointers.size === 2 && this.pinch) {
          const [a, b] = [...this.pointers.values()];
          this.camera.zoom = clamp(
            (this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, this.pinch.distance),
            MIN_CAMERA_ZOOM,
            MAX_CAMERA_ZOOM,
          );
          this.layout();
          return;
        }
        if (!this.drag) return;
        const dx = (event.clientX - this.drag.x) / this.scale,
          dy = (event.clientY - this.drag.y) / this.scale;
        if (this.drag.type === "camera") {
          this.camera.x = this.drag.originX + dx;
          this.camera.y = this.drag.originY + dy;
          this.layout();
        } else {
          const move = movePlacement;
          const p = move(
            this.state,
            this.scene.id,
            this.drag.id,
            this.drag.originX + dx / this.scene.width,
            this.drag.originY + dy / this.scene.height,
          );
          p.width = this.drag.width;
          const node = this.node.querySelector(`[data-entity="${p.id}"]`);
          node.style.left = `${p.x * 100}%`;
          node.style.top = `${p.y * 100}%`;
        }
      },
      { signal: this.signal },
    );
    const end = (event) => {
      const hadPinch = Boolean(this.pinch);
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (hadPinch || this.drag?.type === "camera") this.onCamera(this.camera);
      else if (this.drag) this.onChange(this.drag.id, this.drag.type);
      this.drag = null;
      this.node.classList.remove("dragging");
    };
    this.node.addEventListener("pointerup", end, { signal: this.signal });
    this.node.addEventListener("pointercancel", end, { signal: this.signal });
    this.node.addEventListener(
      "keydown",
      (event) => {
        const target = event.target.closest("[data-entity]");
        if (!target || !this.edit) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.selected = target.dataset.entity;
          this.setEditing(this.edit, this.selected);
          this.onSelect(this.selected, "furniture");
          return;
        }
        const directions = {
          ArrowLeft: [-0.01, 0],
          ArrowRight: [0.01, 0],
          ArrowUp: [0, -0.01],
          ArrowDown: [0, 0.01],
        };
        if (!directions[event.key]) return;
        event.preventDefault();
        const type = "furniture",
          id = target.dataset.entity;
        const value = this.state.layouts[this.scene.id].find(
          (p) => p.id === id,
        );
        movePlacement(
          this.state,
          this.scene.id,
          id,
          value.x + directions[event.key][0] * (event.shiftKey ? 5 : 1),
          value.y + directions[event.key][1] * (event.shiftKey ? 5 : 1),
        );
        this.onChange(id, type);
        this.drawFurniture();
        this.node.querySelector(`[data-entity="${id}"]`)?.focus();
      },
      { signal: this.signal },
    );
  }
  animate() {
    this.updateFrames();
    this.animationTimer = setTimeout(() => this.animate(), 100);
  }
  destroy() {
    clearTimeout(this.animationTimer);
    for (const entry of this.entityNodes.values()) entry.buffer.dispose();
    this.controller.abort();
    this.observer.disconnect();
  }
}
