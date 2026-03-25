#!/usr/bin/env node
/**
 * Generate procedural SVG→PNG background textures for event themes.
 * Uses ImageMagick (magick) for SVG→PNG conversion.
 *
 * Run: node scripts/generate-theme-textures.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const OUT_DIR = join(import.meta.dirname, "..", "assets", "theme-backgrounds");
const W = 800;
const H = 1200;

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max)); }
function pick(arr) { return arr[randInt(0, arr.length)]; }

function svgWrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

function generateAndSave(name, svgContent) {
  const svgPath = join(OUT_DIR, `${name}.svg`);
  const pngPath = join(OUT_DIR, `${name}.png`);
  writeFileSync(svgPath, svgContent);
  execSync(`magick "${svgPath}" -resize ${W}x${H} -quality 85 "${pngPath}"`, { stdio: "pipe" });
  // Remove temp SVG
  execSync(`rm "${svgPath}"`, { stdio: "pipe" });
  console.log(`  ✓ ${name}.png`);
}

// ── Texture generators ──

function birthdayBash() {
  let shapes = "";
  for (let i = 0; i < 60; i++) {
    const x = rand(0, W), y = rand(0, H);
    const color = pick(["#EC4899", "#FFD700", "#3B82F6", "#F97316", "#22C55E", "#A855F7"]);
    const opacity = rand(0.15, 0.4);
    const rot = rand(0, 360);
    if (Math.random() > 0.5) {
      const w = rand(6, 16), h = rand(3, 10);
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${x} ${y})"/>`;
    } else {
      const r = rand(3, 8);
      shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
    }
  }
  return svgWrap(`<rect width="${W}" height="${H}" fill="#1A0A10"/>${shapes}`);
}

function celebration() {
  let shapes = "";
  for (let i = 0; i < 80; i++) {
    const x = rand(0, W), y = rand(0, H);
    const r = rand(1.5, 6);
    const color = pick(["#FFD700", "#D4AF37", "#FFF8E1", "#FFE082"]);
    const opacity = rand(0.1, 0.35);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
  }
  return svgWrap(`<rect width="${W}" height="${H}" fill="#0A0E2A"/>${shapes}`);
}

function gameDay() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0F2E16"/>`;
  // Fine grass noise
  for (let i = 0; i < 300; i++) {
    const x = rand(0, W), y = rand(0, H);
    const w = rand(1, 3), h = rand(4, 12);
    shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1B5E20" opacity="${rand(0.15, 0.35)}" transform="rotate(${rand(-10, 10)} ${x} ${y})"/>`;
  }
  // Faint yard lines
  for (let ly = 120; ly < H; ly += 120) {
    shapes += `<line x1="40" y1="${ly}" x2="${W - 40}" y2="${ly}" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>`;
  }
  return svgWrap(shapes);
}

function gardenParty() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0F1F0A"/>`;
  // Abstract flower shapes
  for (let i = 0; i < 30; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const color = pick(["#84CC16", "#A3E635", "#F4A3BC", "#FACC15"]);
    const opacity = rand(0.12, 0.3);
    const size = rand(8, 20);
    // 5-petal flower
    for (let p = 0; p < 5; p++) {
      const angle = (p * 72) * Math.PI / 180;
      const px = cx + Math.cos(angle) * size * 0.6;
      const py = cy + Math.sin(angle) * size * 0.6;
      shapes += `<ellipse cx="${px}" cy="${py}" rx="${size * 0.4}" ry="${size * 0.25}" fill="${color}" opacity="${opacity}" transform="rotate(${p * 72} ${px} ${py})"/>`;
    }
  }
  // Scattered leaves
  for (let i = 0; i < 20; i++) {
    const x = rand(0, W), y = rand(0, H);
    const rot = rand(0, 360);
    const s = rand(10, 22);
    shapes += `<ellipse cx="${x}" cy="${y}" rx="${s}" ry="${s * 0.4}" fill="#4ADE80" opacity="${rand(0.08, 0.2)}" transform="rotate(${rot} ${x} ${y})"/>`;
  }
  return svgWrap(shapes);
}

function fallHarvest() {
  let shapes = `<rect width="${W}" height="${H}" fill="#28180C"/>`;
  for (let i = 0; i < 35; i++) {
    const x = rand(0, W), y = rand(0, H);
    const color = pick(["#D97706", "#C2410C", "#B91C1C", "#EAB308", "#92400E"]);
    const rot = rand(0, 360);
    const s = rand(12, 28);
    // Leaf silhouette (pointed ellipse)
    shapes += `<ellipse cx="${x}" cy="${y}" rx="${s}" ry="${s * 0.45}" fill="${color}" opacity="${rand(0.12, 0.3)}" transform="rotate(${rot} ${x} ${y})"/>`;
    // Leaf stem
    shapes += `<line x1="${x}" y1="${y - s * 0.3}" x2="${x}" y2="${y + s * 0.5}" stroke="${color}" stroke-width="1" opacity="${rand(0.1, 0.2)}" transform="rotate(${rot} ${x} ${y})"/>`;
  }
  return svgWrap(shapes);
}

function bonfireNight() {
  let shapes = `<rect width="${W}" height="${H}" fill="#1A120A"/>`;
  // Ember dots
  for (let i = 0; i < 50; i++) {
    const x = rand(0, W), y = rand(H * 0.3, H);
    const r = rand(1.5, 5);
    const color = pick(["#FF9800", "#FF6D00", "#FFAB40", "#FFD54F"]);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${rand(0.15, 0.4)}"/>`;
  }
  // Smoke wisps
  for (let i = 0; i < 12; i++) {
    const cx = rand(W * 0.2, W * 0.8), cy = rand(0, H * 0.6);
    const rx = rand(30, 80), ry = rand(15, 40);
    shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#9E9E9E" opacity="${rand(0.04, 0.1)}" transform="rotate(${rand(-30, 30)} ${cx} ${cy})"/>`;
  }
  return svgWrap(shapes);
}

function poolParty() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0A2530"/>`;
  // Water caustic circles
  for (let i = 0; i < 50; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const r = rand(15, 60);
    const color = pick(["#06B6D4", "#67E8F9", "#FFFFFF", "#A5F3FC"]);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${rand(1, 3)}" opacity="${rand(0.06, 0.18)}"/>`;
  }
  // Light patches
  for (let i = 0; i < 20; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const r = rand(20, 50);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#67E8F9" opacity="${rand(0.03, 0.08)}"/>`;
  }
  return svgWrap(shapes);
}

function valentinesHeart() {
  let shapes = `<rect width="${W}" height="${H}" fill="#2A0A1E"/>`;
  for (let i = 0; i < 40; i++) {
    const x = rand(0, W), y = rand(0, H);
    const s = rand(8, 24);
    const color = pick(["#EC4899", "#BE123C", "#F472B6", "#FB7185"]);
    const opacity = rand(0.1, 0.3);
    const rot = rand(-20, 20);
    // Heart path (scaled)
    const d = `M ${x} ${y + s * 0.3} C ${x - s * 0.5} ${y - s * 0.3}, ${x - s} ${y + s * 0.1}, ${x} ${y + s} C ${x + s} ${y + s * 0.1}, ${x + s * 0.5} ${y - s * 0.3}, ${x} ${y + s * 0.3} Z`;
    shapes += `<path d="${d}" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${x} ${y})"/>`;
  }
  return svgWrap(shapes);
}

function winterGlow() {
  let shapes = `<rect width="${W}" height="${H}" fill="#111B3A"/>`;
  // Frost crystal branching lines
  for (let i = 0; i < 25; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const branches = randInt(4, 7);
    const len = rand(20, 50);
    const color = pick(["#FFFFFF", "#C7D7FF", "#93BBF3"]);
    const opacity = rand(0.08, 0.22);
    for (let b = 0; b < branches; b++) {
      const angle = (b * 360 / branches + rand(-10, 10)) * Math.PI / 180;
      const ex = cx + Math.cos(angle) * len;
      const ey = cy + Math.sin(angle) * len;
      shapes += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="1" opacity="${opacity}"/>`;
      // Sub-branches
      const subLen = len * 0.4;
      for (let s = 0; s < 2; s++) {
        const subAngle = angle + (s === 0 ? 0.5 : -0.5);
        const sx = cx + Math.cos(angle) * len * 0.6;
        const sy = cy + Math.sin(angle) * len * 0.6;
        const sex = sx + Math.cos(subAngle) * subLen;
        const sey = sy + Math.sin(subAngle) * subLen;
        shapes += `<line x1="${sx}" y1="${sy}" x2="${sex}" y2="${sey}" stroke="${color}" stroke-width="0.7" opacity="${opacity * 0.7}"/>`;
      }
    }
  }
  return svgWrap(shapes);
}

function newYearsEve() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0A0A18"/>`;
  // Radial starburst shapes
  for (let i = 0; i < 15; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const rays = randInt(8, 16);
    const len = rand(20, 60);
    const color = pick(["#FFD700", "#C0C0C0", "#FFF8E1", "#FFE082"]);
    const opacity = rand(0.1, 0.28);
    for (let r = 0; r < rays; r++) {
      const angle = (r * 360 / rays) * Math.PI / 180;
      const ex = cx + Math.cos(angle) * len;
      const ey = cy + Math.sin(angle) * len;
      shapes += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${rand(0.5, 1.5)}" opacity="${opacity}"/>`;
    }
    shapes += `<circle cx="${cx}" cy="${cy}" r="${rand(2, 5)}" fill="${color}" opacity="${opacity}"/>`;
  }
  return svgWrap(shapes);
}

function graduation() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0A0E2A"/>`;
  // Parchment texture — warm noise dots
  for (let i = 0; i < 400; i++) {
    const x = rand(0, W), y = rand(0, H);
    const r = rand(0.5, 2.5);
    const color = pick(["#FFF8E1", "#FFE082", "#D7CCC8", "#BCAAA4"]);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${rand(0.04, 0.12)}"/>`;
  }
  // Subtle horizontal grain lines
  for (let i = 0; i < 30; i++) {
    const y = rand(0, H);
    shapes += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#D7CCC8" stroke-width="0.5" opacity="${rand(0.03, 0.08)}"/>`;
  }
  return svgWrap(shapes);
}

function worshipNight() {
  let shapes = `<rect width="${W}" height="${H}" fill="#221C16"/>`;
  // Golden light rays from upper center
  const originX = W * 0.5, originY = H * 0.1;
  for (let i = 0; i < 20; i++) {
    const angle = rand(-60, 60) * Math.PI / 180;
    const len = rand(H * 0.4, H * 0.9);
    const ex = originX + Math.sin(angle) * len;
    const ey = originY + Math.cos(angle) * len;
    const color = pick(["#FFD700", "#FFBF00", "#FFE4B5"]);
    shapes += `<line x1="${originX}" y1="${originY}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${rand(2, 8)}" opacity="${rand(0.04, 0.12)}" stroke-linecap="round"/>`;
  }
  // Central glow
  shapes += `<circle cx="${originX}" cy="${originY}" r="80" fill="#FFD700" opacity="0.06"/>`;
  shapes += `<circle cx="${originX}" cy="${originY}" r="40" fill="#FFF8E1" opacity="0.08"/>`;
  return svgWrap(shapes);
}

function springBloom() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0A1F10"/>`;
  // Cherry blossom scatter — 5-petal flowers
  for (let i = 0; i < 35; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const size = rand(6, 16);
    const color = pick(["#F4A3BC", "#FBD5E5", "#FFFFFF", "#F9A8D4"]);
    const opacity = rand(0.12, 0.3);
    for (let p = 0; p < 5; p++) {
      const angle = (p * 72 + rand(-5, 5)) * Math.PI / 180;
      const px = cx + Math.cos(angle) * size * 0.5;
      const py = cy + Math.sin(angle) * size * 0.5;
      shapes += `<ellipse cx="${px}" cy="${py}" rx="${size * 0.35}" ry="${size * 0.2}" fill="${color}" opacity="${opacity}" transform="rotate(${p * 72} ${px} ${py})"/>`;
    }
    // Center dot
    shapes += `<circle cx="${cx}" cy="${cy}" r="${size * 0.12}" fill="#FBBF24" opacity="${opacity * 0.8}"/>`;
  }
  return svgWrap(shapes);
}

function luau() {
  let shapes = `<rect width="${W}" height="${H}" fill="#1A1015"/>`;
  // Palm frond shapes
  for (let i = 0; i < 12; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const rot = rand(0, 360);
    const len = rand(50, 120);
    const color = pick(["#166534", "#15803D", "#14532D"]);
    const opacity = rand(0.1, 0.25);
    // Central stem
    shapes += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + len}" stroke="${color}" stroke-width="2" opacity="${opacity}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    // Frond leaves along stem
    for (let l = 0; l < 8; l++) {
      const ly = cy + (len / 8) * l;
      const leafLen = rand(15, 35) * (1 - l / 10);
      const side = l % 2 === 0 ? -1 : 1;
      const lx = cx + side * leafLen;
      shapes += `<ellipse cx="${(cx + lx) / 2}" cy="${ly}" rx="${leafLen * 0.6}" ry="${rand(4, 8)}" fill="${color}" opacity="${opacity}" transform="rotate(${rot + side * rand(15, 35)} ${cx} ${cy})"/>`;
    }
  }
  // Monstera shapes (simplified)
  for (let i = 0; i < 6; i++) {
    const cx = rand(0, W), cy = rand(0, H);
    const s = rand(25, 50);
    shapes += `<ellipse cx="${cx}" cy="${cy}" rx="${s}" ry="${s * 0.8}" fill="#166534" opacity="${rand(0.08, 0.18)}" transform="rotate(${rand(0, 360)} ${cx} ${cy})"/>`;
  }
  return svgWrap(shapes);
}

function movieNight() {
  let shapes = `<rect width="${W}" height="${H}" fill="#0F1218"/>`;
  // Film strip borders on left and right edges
  const stripW = 40;
  const sprocketSize = 8;
  const sprocketGap = 24;
  for (const xBase of [10, W - stripW - 10]) {
    shapes += `<rect x="${xBase}" y="0" width="${stripW}" height="${H}" fill="#1A1D24" opacity="0.4"/>`;
    // Sprocket holes
    for (let y = 12; y < H; y += sprocketGap) {
      shapes += `<rect x="${xBase + 6}" y="${y}" width="${sprocketSize}" height="${sprocketSize * 0.7}" rx="1.5" fill="#0F1218" opacity="0.7"/>`;
      shapes += `<rect x="${xBase + stripW - 6 - sprocketSize}" y="${y}" width="${sprocketSize}" height="${sprocketSize * 0.7}" rx="1.5" fill="#0F1218" opacity="0.7"/>`;
    }
  }
  // Subtle film grain
  for (let i = 0; i < 100; i++) {
    const x = rand(stripW + 20, W - stripW - 20), y = rand(0, H);
    const r = rand(0.5, 1.5);
    shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="#64748B" opacity="${rand(0.05, 0.15)}"/>`;
  }
  return svgWrap(shapes);
}

// ── Main ──

console.log("Generating theme background textures...\n");

const textures = [
  ["birthday_bash", birthdayBash],
  ["celebration", celebration],
  ["game_day", gameDay],
  ["garden_party", gardenParty],
  ["fall_harvest", fallHarvest],
  ["bonfire_night", bonfireNight],
  ["pool_party", poolParty],
  ["valentines", valentinesHeart],
  ["winter_glow", winterGlow],
  ["new_years_eve", newYearsEve],
  ["graduation", graduation],
  ["worship_night", worshipNight],
  ["spring_bloom", springBloom],
  ["luau", luau],
  ["movie_night_v2", movieNight],
];

for (const [name, generator] of textures) {
  generateAndSave(name, generator());
}

console.log("\nDone! Generated", textures.length, "textures.");
