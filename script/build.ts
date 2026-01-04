import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, readdir, copyFile, unlink, stat } from "fs/promises";
import path from "path";

const allowlist = [
  "@google/generative-ai", "axios", "connect-pg-simple", "cors", "date-fns",
  "drizzle-orm", "drizzle-zod", "express", "express-rate-limit",
  "express-session", "jsonwebtoken", "memorystore", "multer", "nanoid",
  "nodemailer", "openai", "passport", "passport-local", "pg", "stripe",
  "uuid", "ws", "xlsx", "zod", "zod-validation-error",
];

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function buildAll() {
  const root = process.cwd();
  const distPath = path.join(root, "dist");
  const publicPath = path.join(distPath, "public");

  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });

  console.log("Building client (Vite)...");
  await viteBuild();

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

  console.log("Re-organizing files for Render...");
  await mkdir(publicPath, { recursive: true });

  const files = await readdir(distPath);
  for (const file of files) {
    if (file !== "index.cjs" && file !== "public") {
      const src = path.join(distPath, file);
      const dest = path.join(publicPath, file);
      
      const fileStat = await stat(src);
      if (fileStat.isDirectory()) {
        await copyDir(src, dest);
        await rm(src, { recursive: true, force: true });
      } else {
        await copyFile(src, dest);
        await unlink(src);
      }
    }
  }

  // A tiny wait to ensure file system sync
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log("Build and organization complete.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});