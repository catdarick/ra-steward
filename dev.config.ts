// Shared by the demo and its browser tests; the backend may run in another checkout or host.
export const backendUrl = (process.env.STEWARD_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8080}`)
  .replace(/\/+$/, "");
export const uiPort = Number(process.env.UI_PORT ?? 5174);
