import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const FONT_FILES = ["ChakraPetch-Bold.ttf", "JetBrainsMono-Bold.ttf", "JetBrainsMono-Medium.ttf"];

// resvg-js wants font paths, but bundled server assets are only reachable as
// buffers. Write them next to the runtime state once and reuse the paths.
export async function ogFontFiles(): Promise<string[]> {
  const dir = join(process.cwd(), ".data", "fonts");
  await mkdir(dir, { recursive: true });
  const assets = useStorage("assets:server");
  return Promise.all(
    FONT_FILES.map(async (name) => {
      const path = join(dir, name);
      const exists = await access(path).then(
        () => true,
        () => false,
      );
      if (!exists) {
        const buf = await assets.getItemRaw<Buffer>(`fonts/${name}`);
        if (!buf) throw new Error(`OG font missing: ${name}`);
        await writeFile(path, buf);
      }
      return path;
    }),
  );
}
