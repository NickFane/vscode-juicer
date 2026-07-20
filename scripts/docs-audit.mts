/**
 * docs-audit — guards the LLM-optimized documentation system.
 *
 * Runs on `node --experimental-strip-types` (no deps, only node: builtins) so the
 * pre-commit hook needs nothing installed. Mirrors the goblin-engine pattern.
 *
 * FATAL checks (exit 1): always-loaded token ceiling, link integrity, orphan
 * slices, coverage-sentinel faithfulness. WARN checks: duplicated doctrine,
 * staleness.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const SKILLS = join(ROOT, ".claude", "skills");

const CEILING_TOKENS = 3000; // always-loaded budget (CLAUDE.md + skill frontmatter)
const DUP_MIN_LEN = 80;
const STALE_MONTHS = 6;

const estTokens = (s: string): number => Math.ceil(s.length / 4);
const read = (p: string): string => readFileSync(p, "utf8");

const errors: string[] = [];
const warnings: string[] = [];

// ── 1. Always-loaded token ceiling ────────────────────────────────────────────
let footprint = 0;
const claudeMd = join(ROOT, "CLAUDE.md");
if (existsSync(claudeMd)) footprint += estTokens(read(claudeMd));
else errors.push("CLAUDE.md is missing");

if (existsSync(SKILLS)) {
  for (const dir of readdirSync(SKILLS)) {
    const skillFile = join(SKILLS, dir, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    const m = read(skillFile).match(/^---\n([\s\S]*?)\n---/);
    if (m) footprint += estTokens(m[1]); // only frontmatter is pre-loaded
  }
}
if (footprint > CEILING_TOKENS) {
  errors.push(
    `always-loaded footprint ~${footprint} tokens exceeds ceiling ${CEILING_TOKENS}`
  );
}

// ── collect slices ────────────────────────────────────────────────────────────
const slices = existsSync(DOCS)
  ? readdirSync(DOCS).filter((f) => f.endsWith(".md") && f !== "INDEX.md")
  : [];

// ── 2. Link integrity ─────────────────────────────────────────────────────────
const linkFiles = [claudeMd, ...slices.map((s) => join(DOCS, s)), join(DOCS, "INDEX.md")];
for (const file of linkFiles) {
  if (!existsSync(file)) continue;
  const src = read(file);
  const re = /\]\(([^)]+\.md)(#[^)]*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const target = m[1];
    if (/^https?:\/\//.test(target)) continue;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      errors.push(`${relative(ROOT, file)} -> broken link ${target}`);
    }
  }
}

// ── 3. Orphan slices (every slice must be linked from INDEX.md) ────────────────
const indexPath = join(DOCS, "INDEX.md");
if (existsSync(indexPath)) {
  const index = read(indexPath);
  for (const s of slices) {
    if (!index.includes(`(${s})`)) {
      errors.push(`slice ${s} is not referenced in docs/INDEX.md (orphan)`);
    }
  }
} else if (slices.length) {
  errors.push("docs/INDEX.md is missing");
}

// ── 4. Coverage / faithfulness sentinels ──────────────────────────────────────
const coveragePath = join(DOCS, "coverage.json");
if (existsSync(coveragePath)) {
  const coverage = JSON.parse(read(coveragePath)) as {
    topics: { topic: string; dest: string; sentinel: string }[];
  };
  for (const { topic, dest, sentinel } of coverage.topics) {
    const destPath = join(ROOT, dest);
    if (!existsSync(destPath)) {
      errors.push(`coverage topic "${topic}" -> missing dest ${dest}`);
    } else if (!read(destPath).includes(sentinel)) {
      errors.push(`coverage topic "${topic}" -> sentinel not found in ${dest}`);
    }
  }
} else {
  warnings.push("docs/coverage.json is missing (faithfulness not enforced)");
}

// ── 5. Duplicated doctrine (WARN) ─────────────────────────────────────────────
const lineHome = new Map<string, string>();
for (const s of slices) {
  const seen = new Set<string>();
  for (const raw of read(join(DOCS, s)).split("\n")) {
    const line = raw.trim();
    if (line.length < DUP_MIN_LEN) continue;
    if (/^[#>|*\-]/.test(line) || line.startsWith("last-verified")) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    const prev = lineHome.get(line);
    if (prev && prev !== s) {
      warnings.push(`duplicated line across ${prev} and ${s}: "${line.slice(0, 60)}..."`);
    } else {
      lineHome.set(line, s);
    }
  }
}

// ── 6. Staleness (WARN) ───────────────────────────────────────────────────────
const now = Date.now();
for (const s of slices) {
  const m = read(join(DOCS, s)).match(/last-verified:\*{0,2}\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    warnings.push(`${s} has no last-verified date`);
    continue;
  }
  const ageMonths = (now - new Date(m[1]).getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (ageMonths > STALE_MONTHS) {
    warnings.push(`${s} last-verified ${m[1]} is older than ${STALE_MONTHS} months`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(
  `docs-audit: always-loaded ~${footprint}/${CEILING_TOKENS} tokens, ${slices.length} slices`
);
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  FATAL ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} fatal issue(s).`);
  process.exit(1);
}
console.log(warnings.length ? `\nOK (${warnings.length} warning(s)).` : "\nOK.");
