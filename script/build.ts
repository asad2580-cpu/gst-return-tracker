import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, readdir, rename, stat } from "fs/promises";
import path from "path";

const allowlist = [
  "@google/generative-ai", "axios", "connect-pg-simple", "cors", "date-fns",
  "drizzle-orm", "drizzle-zod", "express", "express-rate-limit",
  "express-session", "jsonwebtoken", "memorystore", "multer", "nanoid",
  "nodemailer", "openai", "passport", "passport-local", "pg", "stripe",
  "uuid", "ws", "xlsx", "zod", "zod-validation-error",
];

async function buildAll() {
  const root = process.cwd();
  const distPath = path.join(root, "dist");
  const publicPath = path.join(distPath, "public");

  // Step 1: Clean slate
  console.log("Cleaning dist directory...");
  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });

  // Step 2: Build Frontend
  console.log("Building client (Vite)...");
  await viteBuild();

  // Step 3: Build Backend
  console.log("Building server (Esbuild)...");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"));
  const allDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: [path.join(root, "server", "index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(distPath, "index.cjs"),
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Step 4: Final Folder Organization
  console.log("Ensuring directory structure for production...");
  await mkdir(publicPath, { recursive: true });

  const topLevelFiles = await readdir(distPath);
  for (const file of topLevelFiles) {
    const oldPath = path.join(distPath, file);
    const newPath = path.join(publicPath, file);

    // If it's not the server file and not the public folder itself, move it inside public
    if (file !== "index.cjs" && file !== "public") {
      await rename(oldPath, newPath);
      console.log(`✓ Moved ${file} to dist/public/`);
    }
  }
  console.log("Final Blow Delivered: Build complete.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});