export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const date = (value) =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(
    new Date(value),
  );
export const timeLeft = (ms) => {
  if (ms <= 0) return "即将到家";
  const m = Math.ceil(ms / 60000);
  return m >= 60
    ? `${Math.floor(m / 60)}小时${m % 60 ? ` ${m % 60}分钟` : ""}`
    : `${m}分钟`;
};
export const dayKey = () => new Date().toISOString().slice(0, 10);
export const icons = {
  coin: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9",
  shop: "M3 9l2-6h14l2 6M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9H3M5 15v6h14v-6M10 21v-5h4v5",
  home: "M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  bag: "M7 7V5a5 5 0 0 1 10 0v2M4 7h16l1 14H3zM8 11v2m8-2v2",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18z",
  photo: "M3 4h18v16H3zM3 16l6-6 4 4 3-3 5 5M16 7h.01",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  edit: "M15 4l5 5M4 20l4-1L20 7a2 2 0 0 0-5-3L3 16z",
  leaf: "M20 3C9 1 2 7 4 15c3 7 16 7 16-12zM4 20L16 8",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  close: "M6 6l12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  play: "M8 4l12 8-12 8z",
  pause: "M8 4v16m8-16v16",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 6v6l4 2",
  spark: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  check: "M5 12l4 4L19 6",
  box: "M3 7l9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10",
  reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  pin: "M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  book: "M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1zM12 5v15",
  folder: "M3 5h7l2 3h9v12H3z",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 10v7m0-10h.01",
  coffee:
    "M4 8h12v8a5 5 0 0 1-10 0V8M16 8h2a3 3 0 0 1 0 6h-2M3 21h16M7 3v2m5-2v2",
  wind: "M3 8h13a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6",
  move: "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4",
  shield: "M12 2l9 4v6c0 6-9 10-9 10S3 18 3 12V6zM8 12l3 3 5-6",
  heart: "M12 20S2 14 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 7-10 13-10 13z",
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.leaf}"/></svg>`;
export const button = (action, label, ico = "", cls = "", extra = "") =>
  `<button type="button" data-action="${esc(action)}" class="btn ${cls}" ${extra}>${ico ? icon(ico) : ""}<span>${esc(label)}</span></button>`;
export function toast(message, error = false) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.className = `visible ${error ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (node.className = ""), 5000);
}
export const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));
export async function fileToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
