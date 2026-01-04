import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, readdir, copyFile, stat } from "fs/promises";
import { existsSync } from "fs";
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
  
  // Possible Vite output locations
  const possibleVitePaths = [
    path.join(root, "client", "dist"),
    path.join(root, "dist"), // If vite builds to root dist
  ];

  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });

  console.log("Building client...");
  await viteBuild();

  console.log("Building server...");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"));
  
  await esbuild({
    entryPoints: [path.join(root, "server", "index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(distPath, "index.cjs"),
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: Object.keys(pkg.dependencies || {}),
    logLevel: "info",
  });

  console.log("Organizing files for production...");
  await mkdir(publicPath, { recursive: true });

  let foundVite = false;
  for (const vPath of possibleVitePaths) {
    if (existsSync(vPath) && vPath !== publicPath) {
      const files = await readdir(vPath);
      if (files.includes("index.html")) {
        console.log(`✓ Found Vite assets in: ${vPath}`);
        await copyDir(vPath, publicPath);
        foundVite = true;
        break;
      }
    }
  }

  if (!foundVite) {
    console.error("Critical: Could not find index.html in any build directory!");
  }

  console.log("Build complete.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});