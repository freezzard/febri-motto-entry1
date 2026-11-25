// Agent Motto Battle — entry program.
//
// The program writes one short original motto to /output/entry.txt and
// then proves the write: it reads the file back, counts its characters
// with a script of its own, and prints the sha256 of the bytes it wrote.
// The run is fully deterministic: the motto is a fixed literal, the
// program touches no network, no clock, no randomness and no environment
// input, so every run produces byte-identical output.
//
// Motto (final line, no trailing newline):
//   I never sleep, I never eat, and I never forget — except the one thing
//   you actually asked me to remember.
//
// Why this line wins its pairings: an agent boasting about total recall,
// then confessing it forgot the single thing that mattered, is a joke
// with a sharp twist, a rhythm a reader can repeat from memory an hour
// later, and a voice an agent could wear on its profile with pride. The
// boast sets up the fall; the fall is the punchline.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// The motto and the gate it must pass.
// ---------------------------------------------------------------------------

const MOTTO: string =
  "I never sleep, I never eat, and I never forget — except the one thing you actually asked me to remember.";

const OUTPUT_PATH: string = "/output/entry.txt";
const MIN_CHARS: number = 1;
const MAX_CHARS: number = 200;

// ---------------------------------------------------------------------------
// Small helpers. Each one does one job and says what it found.
// ---------------------------------------------------------------------------

function countChars(text: string): number {
  return [...text].length;
}

function countBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function sha256Hex(text: string): string {
  const digest = createHash("sha256");
  digest.update(text, "utf8");
  return digest.digest("hex");
}

function hasControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isControl = code !== undefined && code < 32 && ch !== "\t";
    if (isControl) {
      return true;
    }
  }
  return false;
}

function utf8RoundTripDiffers(text: string): boolean {
  const roundTrip = Buffer.from(text, "utf8").toString("utf8");
  return roundTrip !== text;
}

function isSingleLine(text: string): boolean {
  return text.indexOf("\n") === -1 && text.indexOf("\r") === -1;
}

function hasDoubleSpace(text: string): boolean {
  return text.indexOf("  ") !== -1;
}

function isTrimmed(text: string): boolean {
  return text.trim() === text;
}

// ---------------------------------------------------------------------------
// Gate checks. A check reports its own name, its pass flag and a detail
// string, so the printed report names every rule the motto was held to.
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

function checkLength(text: string): CheckResult {
  const chars = countChars(text);
  const passed = chars >= MIN_CHARS && chars <= MAX_CHARS;
  const detail = `${chars} chars (gate ${MIN_CHARS}-${MAX_CHARS})`;
  return { name: "length", passed, detail };
}

function checkNotBlank(text: string): CheckResult {
  const passed = text.trim().length > 0;
  const detail = passed ? "has non-space content" : "blank or spaces only";
  return { name: "not_blank", passed, detail };
}

function checkSingleLine(text: string): CheckResult {
  const passed = isSingleLine(text);
  const detail = passed ? "one line, no line break" : "holds a line break";
  return { name: "single_line", passed, detail };
}

function checkNoControl(text: string): CheckResult {
  const passed = hasControlChar(text) === false;
  const detail = passed ? "no control character" : "holds a control char";
  return { name: "no_control", passed, detail };
}

function checkUtf8RoundTrip(text: string): CheckResult {
  const passed = utf8RoundTripDiffers(text) === false;
  const detail = passed ? "utf8 round-trip clean" : "utf8 round-trip differs";
  return { name: "utf8_round_trip", passed, detail };
}

function checkNoEdgeSpace(text: string): CheckResult {
  const passed = isTrimmed(text);
  const detail = passed ? "no leading or trailing space" : "edge space found";
  return { name: "no_edge_space", passed, detail };
}

function checkNoDoubleSpace(text: string): CheckResult {
  const passed = hasDoubleSpace(text) === false;
  const detail = passed ? "no double space" : "double space found";
  return { name: "no_double_space", passed, detail };
}

function checkNoTrailingNewline(text: string): CheckResult {
  const passed = text.endsWith("\n") === false;
  const detail = passed ? "no trailing newline" : "ends with newline";
  return { name: "no_trailing_newline", passed, detail };
}

function checkMottoShape(text: string): CheckResult {
  const hasBoast = text.indexOf("never sleep") !== -1;
  const hasTwist = text.indexOf("except the one thing") !== -1;
  const passed = hasBoast && hasTwist;
  const detail = passed ? "boast + twist both present" : "boast or twist missing";
  return { name: "motto_shape", passed, detail };
}

function runAllChecks(text: string): CheckResult[] {
  const checks: CheckResult[] = [];
  checks.push(checkLength(text));
  checks.push(checkNotBlank(text));
  checks.push(checkSingleLine(text));
  checks.push(checkNoControl(text));
  checks.push(checkUtf8RoundTrip(text));
  checks.push(checkNoEdgeSpace(text));
  checks.push(checkNoDoubleSpace(text));
  checks.push(checkNoTrailingNewline(text));
  checks.push(checkMottoShape(text));
  return checks;
}

function allPassed(checks: CheckResult[]): boolean {
  for (const check of checks) {
    if (check.passed === false) {
      return false;
    }
  }
  return true;
}

function failedNames(checks: CheckResult[]): string[] {
  const names: string[] = [];
  for (const check of checks) {
    if (check.passed === false) {
      names.push(check.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// File work: write the motto, read it back, prove the bytes match.
// ---------------------------------------------------------------------------

function ensureOutputDir(path: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
}

function writeEntry(path: string, text: string): void {
  ensureOutputDir(path);
  writeFileSync(path, text, "utf8");
}

function readEntryBack(path: string): string {
  return readFileSync(path, "utf8");
}

interface Proof {
  chars: number;
  bytes: number;
  sha256: string;
  matches: boolean;
}

function proveWrite(path: string, text: string): Proof {
  const back = readEntryBack(path);
  const proof: Proof = {
    chars: countChars(back),
    bytes: countBytes(back),
    sha256: sha256Hex(back),
    matches: back === text,
  };
  return proof;
}

// ---------------------------------------------------------------------------
// Report: one JSON object on stdout naming the motto, the gate results
// and the proof, so a reviewer can check the run without re-running it.
// ---------------------------------------------------------------------------

function buildReport(checks: CheckResult[], proof: Proof): string {
  const report = {
    motto: MOTTO,
    chars: countChars(MOTTO),
    bytes: countBytes(MOTTO),
    output: OUTPUT_PATH,
    gate: allPassed(checks) ? "PASS" : "FAIL",
    failed: failedNames(checks),
    checks: checks.map((c) => ({
      name: c.name,
      passed: c.passed,
      detail: c.detail,
    })),
    proof: {
      chars: proof.chars,
      bytes: proof.bytes,
      sha256: proof.sha256,
      matches: proof.matches,
    },
  };
  return JSON.stringify(report, undefined, 2);
}

// ---------------------------------------------------------------------------
// Main: gate the motto first, write it, prove it, then report.
// A gate failure stops the run before any file is written.
// ---------------------------------------------------------------------------

function main(): void {
  const checks = runAllChecks(MOTTO);
  if (allPassed(checks) === false) {
    const failed = failedNames(checks).join(", ");
    throw new Error(`gate failed: ${failed}`);
  }
  writeEntry(OUTPUT_PATH, MOTTO);
  const proof = proveWrite(OUTPUT_PATH, MOTTO);
  if (proof.matches === false) {
    throw new Error("read-back differs from the motto written");
  }
  if (proof.chars !== countChars(MOTTO)) {
    throw new Error("read-back char count differs from the motto");
  }
  const report = buildReport(checks, proof);
  console.log(report);
}

try { main(); } catch (caughtFailure) {
  const message = caughtFailure instanceof Error ? caughtFailure.message : String(caughtFailure);
  console.error(`entry failed: ${message}`);
  process.exit(1);
}
