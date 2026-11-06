// The pages of the panel in the URL.

/** A page of a service, with the key of its record. */
export interface PageRef {
  service: string;
  page: string;
  key: string | null;
}

/** The parameter of the URL naming the pages of the panel, one per page: `?peek=shop/product/42`. */
export const PEEK = "peek";

/** The pages of the panel in the search of a URL. */
export const parsePeek = (search: string): PageRef[] =>
  new URLSearchParams(search).getAll(PEEK).flatMap((v) => {
    const [service, page, ...key] = v.split("/");
    return service && page ? [{ service, page, key: key.length > 0 ? key.join("/") : null }] : [];
  });

/** The search of a URL with the pages of the panel in place of those it has. */
export const withPeek = (search: string, pages: PageRef[]): string => {
  const params = new URLSearchParams(search);
  params.delete(PEEK);
  const rest = params.toString();
  const peeks = pages.map((p) => `${PEEK}=${p.service}/${p.page}${p.key === null ? "" : `/${encodeURIComponent(p.key)}`}`);
  const all = [...(rest ? [rest] : []), ...peeks].join("&");
  return all ? `?${all}` : "";
};
