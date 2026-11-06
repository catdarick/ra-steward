import type { FormErrors } from "./protocol.js";

export interface ClientOptions {
  /** The base path of the services: "/admin". */
  baseUrl: string;
  /** Headers of every request: the user's token, for one. */
  headers?: () => Record<string, string>;
  /** Called with the version every answer carries, to read describe again when it changes. */
  onVersion?: (service: string, version: string) => void;
}

/** An answer that is not a success: its status, its message and, for 422, the errors of fields. */
export class StewardError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: FormErrors,
  ) {
    super(message);
  }
}

export type Query = Record<string, string | number | undefined | null>;

/** Requests to the services. */
export class StewardClient {
  constructor(readonly options: ClientOptions) {}

  url(service: string | null, path: string[], query: Query = {}): string {
    const segments = [this.options.baseUrl.replace(/\/+$/, ""), ...(service ? [service] : []), ...path.map(encodeURIComponent)];
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    const qs = params.toString();
    return segments.join("/") + (qs ? `?${qs}` : "");
  }

  async request<T>(service: string | null, path: string[], init: { query?: Query; body?: unknown; method?: string } = {}): Promise<T> {
    const response = await this.fetch(this.url(service, path, init.query), {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new StewardError(response.status, json?.message ?? response.statusText, json?.errors);
    }
    return json as T;
  }

  /** A request with the headers of the options; the version of the answer is reported. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...this.options.headers?.(), ...init.headers },
    });
    const version = response.headers.get("Admin-Version");
    const service = this.serviceOf(url);
    if (version && service) this.options.onVersion?.(service, version);
    return response;
  }

  private serviceOf(url: string): string | null {
    const base = this.options.baseUrl.replace(/\/+$/, "");
    const rest = url.startsWith(base) ? url.slice(base.length) : url;
    const segment = rest.split("?")[0].split("/").filter(Boolean)[0];
    return segment ? decodeURIComponent(segment) : null;
  }

  /** Downloads a file an action produced and gives it to the user to save. */
  async download(url: string, filename: string): Promise<void> {
    const resolved = /^https?:\/\//i.test(this.options.baseUrl)
      ? new URL(url, this.options.baseUrl.replace(/\/+$/, "") + "/").href
      : url;
    const response = await this.fetch(resolved, { headers: { Accept: "*/*" } });
    if (!response.ok) throw new StewardError(response.status, "The file is no longer available.");
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
