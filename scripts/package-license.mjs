import { copyFile } from "node:fs/promises";

await copyFile(new URL("../LICENSE", import.meta.url), new URL("../packages/ra-steward/LICENSE", import.meta.url));
