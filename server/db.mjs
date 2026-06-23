import { join, resolve } from "node:path";

const root = resolve(".");

export const dataDir = join(root, "data");
export const uploadDir = join(dataDir, "uploads");
