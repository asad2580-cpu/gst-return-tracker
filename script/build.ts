import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, readdir, copyFile, stat } from "fs/promises";
import path from "path";

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    entry.isDirectory() ? await copyDir(srcPath, destPath) : await copyFile(srcPath, destPath);
  }
}

async function buildAll() {
  const root = process.cwd();
  const distPath = path.join(root, "dist");
  const publicPath = path.join(distPath, "public");
  // VITE outputs relative to its ROOT (client folder)
  const viteOutPath = path.join(root, "client", "dist"); 

  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });

  console.log("Building client...");
  await viteBuild();

  console.log("Building server...");
  await esbuild({
    entryPoints: [path.join(root, "server", "index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(distPath, "index.cjs"),
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: ["express", "pg"], // Keep it simple
    logLevel: "info",
  });

  console.log("Moving files from client/dist to dist/public...");
  await mkdir(publicPath, { recursive: true });
  
  if (require('fs').existsSync(viteOutPath)) {
    await copyDir(viteOutPath, publicPath);
    console.log("✓ Successfully copied frontend to dist/public");
  } else {
    // Fallback: Check if they are in root dist (as a safety net)
    console.log("client/dist not found, checking root dist...");
    const files = await readdir(distPath);
    for (const file of files) {
      if (file !== "index.cjs" && file !== "public") {
        const src = path.join(distPath, file);
        const dest = path.join(publicPath, file);
        (await stat(src)).isDirectory() ? await copyDir(src, dest) : await copyFile(src, dest);
      }
    }
  }
  console.log("Build complete.");
}

buildAll().catch((err) => { console.error(err); process.exit(1); });