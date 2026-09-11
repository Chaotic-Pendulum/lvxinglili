import {gameNow,clockOffset} from "./core/clock.js";
import { movePlacement } from "./core/engine.js";

export function registerAgentTools(app) {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const controller = new AbortController();
  window.addEventListener("pagehide", () => controller.abort(), { once: true });
  const tools = [
    {
      name: "read_roam_state",
      title: "读取漫游状态",
      description:
        "Read the current scene, companion activity, furniture positions and travel history. Does not expose API keys or photo bytes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        viewSceneId: app.state.viewSceneId,
        gameTime: gameNow(app.state),
        simulationOffsetMs: clockOffset(app.state),
        selectedOutfitId: app.state.selectedOutfitId,
        companionName: app.state.companionName,
        coins: app.state.economy?.coins,
        owned: structuredClone(app.state.economy?.owned),
        activity: structuredClone(app.state.activity),
        placements: structuredClone(app.state.layouts[app.state.viewSceneId]),
        currentTrip: app.state.currentTrip
          ? {
              destinationId: app.state.currentTrip.destinationId,
              returnAt: app.state.currentTrip.returnAt,
            }
          : null,
        visits: { ...app.state.visits },
      }),
    },
    {
      name: "set_roam_furniture_positions",
      title: "调整家具位置",
      description:
        "Move existing furniture in the active scene using normalized coordinates. Saves locally and updates the visible scene. Does not call AI APIs.",
      inputSchema: {
        type: "object",
        properties: {
          placements: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                x: { type: "number", minimum: 0, maximum: 1 },
                y: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["id", "x", "y"],
              additionalProperties: false,
            },
          },
        },
        required: ["placements"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (
          !input ||
          !Array.isArray(input.placements) ||
          input.placements.length > 100
        )
          throw new Error("placements must be an array with at most 100 items");
        const array = app.state.layouts[app.state.viewSceneId];
        for (const p of input.placements)
          if (
            !p ||
            !array.some((x) => x.id === p.id) ||
            typeof p.x !== "number" ||
            typeof p.y !== "number" ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            p.x < 0 ||
            p.x > 1 ||
            p.y < 0 ||
            p.y > 1
          )
            throw new Error("Unknown furniture or invalid coordinates");
        for (const p of input.placements)
          movePlacement(app.state, app.state.viewSceneId, p.id, p.x, p.y);
        await app.saveNow();
        app.render();
        return {
          updated: input.placements.length,
          sceneId: app.state.viewSceneId,
        };
      },
    },
    {
      name: "configure_roam_travel",
      title: "配置旅行节奏",
      description:
        "Set trip duration and rest interval. This only changes configuration; it does not start a trip or call an AI API.",
      inputSchema: {
        type: "object",
        properties: {
          travelMinutes: { type: "number", minimum: 1, maximum: 43200 },
          frequencyMinutes: { type: "number", minimum: 1, maximum: 43200 },
        },
        required: ["travelMinutes", "frequencyMinutes"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (
          !input ||
          ![input.travelMinutes, input.frequencyMinutes].every(
            (n) =>
              typeof n === "number" &&
              Number.isFinite(n) &&
              n >= 1 &&
              n <= 43200,
          )
        )
          throw new Error("Durations must be between 1 and 43200 minutes");
        app.state.settings.travelMinutes = input.travelMinutes;
        app.state.settings.frequencyMinutes = input.frequencyMinutes;
        app.state.nextTripAt = gameNow(app.state) + input.frequencyMinutes * 60000;
        await app.saveNow();
        app.render();
        return {
          travelMinutes: input.travelMinutes,
          frequencyMinutes: input.frequencyMinutes,
        };
      },
    },
  ];
  for (const tool of tools)
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {}
}
