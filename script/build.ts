import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, readdir, rename } from "fs/promises";
import path from "path";

const allowlist = [
  "@google/generative-ai", "axios", "connect-pg-simple", "cors", "date-fns",
  "drizzle-orm", "drizzle-zod", "express", "express-rate-limit",
  "express-session", "jsonwebtoken", "memorystore", "multer", "nanoid",
  "nodemailer", "openai", "passport", "passport-local", "pg", "stripe",
  "uuid", "ws", "xlsx", "zod", "zod-validation-error",
];

async function buildAll() {
  // 1. Clean start
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("Ensuring directory structure for production...");
  
  // 2. Create the target public folder
  const distPublic = path.resolve("dist", "public");
  await mkdir(distPublic, { recursive: true });

  // 3. Migration Logic: Move everything except index.cjs into dist/public
  const distFiles = await readdir("dist");
  for (const file of distFiles) {
    const oldPath = path.join("dist", file);
    const newPath = path.join(distPublic, file);

    // Don't move the public folder into itself or move the server file
    if (file !== "public" && file !== "index.cjs") {
      await rename(oldPath, newPath);
      console.log(`Moved ${file} to dist/public/`);
    }
  }
  console.log("Build and organization complete.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});