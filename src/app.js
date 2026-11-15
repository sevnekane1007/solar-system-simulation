const AU_SCALE = 34;
const J2000 = 2451545.0;
const DAY_MS = 86_400_000;
const MAX_ASTEROIDS = 30_000;
const TRAIL_SEGMENTS = 96;

const ui = {
  canvas: document.querySelector("#scene"),
  status: document.querySelector("#status"),
  speed: document.querySelector("#speed"),
  speedValue: document.querySelector("#speedValue"),
  count: document.querySelector("#count"),
  countValue: document.querySelector("#countValue"),
  trailCount: document.querySelector("#trailCount"),
  trailValue: document.querySelector("#trailValue"),
  toggleTrails: document.querySelector("#toggleTrails"),
  togglePlanets: document.querySelector("#togglePlanets"),
  toggleBloom: document.querySelector("#toggleBloom"),
  loadedMetric: document.querySelector("#loadedMetric"),
  visibleMetric: document.querySelector("#visibleMetric"),
  dateMetric: document.querySelector("#dateMetric"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
};

const ctx = ui.canvas.getContext("2d", { alpha: false });
const state = {
  width: 0,
  height: 0,
  dpr: 1,
  asteroids: [],
  visibleAsteroids: [],
  trails: [],
  filter: "all",
  speed: Number(ui.speed.value),
  count: Number(ui.count.value),
  trailCount: Number(ui.trailCount.value),
  simDays: 0,
  lastTime: performance.now(),
  yaw: -0.55,
  pitch: 0.86,
  zoom: 1,
  dragging: false,
  dragX: 0,
  dragY: 0,
};

const colors = {
  "main-belt": "#4ed8ff",
  "near-earth": "#ffb84d",
  pha: "#ff5a93",
  trojan: "#75f0aa",
  outer: "#b59cff",
};

const planets = [
  ["水星", 0.38709927, 0.20563593, 7.00497902, 48.33076593, 29.12703035, 174.79588482, "#b7a488", 2.6],
  ["金星", 0.72333566, 0.00677672, 3.39467605, 76.67984255, 54.92262463, 50.41611388, "#ffcf7a", 3.4],
  ["地球", 1.00000261, 0.01671123, -0.00001531, 0, 102.93768193, 357.51716, "#4aa3ff", 3.5],
  ["火星", 1.52371034, 0.0933941, 1.84969142, 49.55953891, 286.4968315, 19.41248, "#ff7048", 3],
  ["木星", 5.202887, 0.04838624, 1.30439695, 100.47390909, 273.867, 20.02, "#e3bd8c", 6.4],
  ["土星", 9.53667594, 0.05386179, 2.48599187, 113.66242448, 339.392, 317.02, "#f1d58c", 5.5],
  ["天王星", 19.18916464, 0.04725744, 0.77263783, 74.01692503, 96.998857, 142.24, "#7edcff", 4.8],
  ["海王星", 30.06992276, 0.00859048, 1.77004347, 131.78422574, 273.187, 256.23, "#5279ff", 4.8],
].map(([name, a, e, i, om, w, ma, color, radius]) => ({
  name,
  a,
  e,
  i,
  om,
  w,
  ma,
  color,
  radius,
  epoch: J2000,
  n: meanMotionFromA(a),
}));

const stars = makeStars(1800);
const dust = makeDust(1600);

resize();
bindControls();
loadInitialAsteroids();
requestAnimationFrame(animate);

function bindControls() {
  ui.speed.addEventListener("input", () => {
    state.speed = Number(ui.speed.value);
    ui.speedValue.textContent = `${state.speed.toLocaleString()}x`;
  });

  ui.count.addEventListener("input", () => {
    state.count = Number(ui.count.value);
    ui.countValue.textContent = state.count.toLocaleString();
    applyFilter();
  });

  ui.trailCount.addEventListener("input", () => {
    state.trailCount = Number(ui.trailCount.value);
    ui.trailValue.textContent = state.trailCount.toLocaleString();
    rebuildTrails();
  });

  ui.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      ui.filterButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      applyFilter();
    });
  });

  ui.canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.dragX = event.clientX;
    state.dragY = event.clientY;
    ui.canvas.setPointerCapture(event.pointerId);
  });

  ui.canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.dragX;
    const dy = event.clientY - state.dragY;
    state.dragX = event.clientX;
    state.dragY = event.clientY;
    state.yaw += dx * 0.006;
    state.pitch = clamp(state.pitch + dy * 0.004, 0.18, 1.45);
  });

  ui.canvas.addEventListener("pointerup", () => {
    state.dragging = false;
  });

  ui.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.zoom = clamp(state.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.45, 3.2);
    },
    { passive: false },
  );

  window.addEventListener("resize", resize);
}

function loadInitialAsteroids() {
  state.asteroids = generateFallbackAsteroids(MAX_ASTEROIDS);
  ui.loadedMetric.textContent = state.asteroids.length.toLocaleString();
  ui.status.textContent = "已载入内置轨道数据，正在后台尝试连接 NASA/JPL SBDB。";
  applyFilter();
  loadJplAsteroids();
}

async function loadJplAsteroids() {
  const url = new URL("https://ssd-api.jpl.nasa.gov/sbdb_query.api");
  url.searchParams.set("sb-kind", "a");
  url.searchParams.set("fields", "spkid,pdes,full_name,neo,pha,class,epoch,e,a,i,om,w,ma,n,per,H,diameter");
  url.searchParams.set("limit", String(MAX_ASTEROIDS));
  url.searchParams.set("sort", "a");

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) throw new Error(`JPL SBDB HTTP ${response.status}`);
    const payload = await response.json();
    const asteroids = parseJplPayload(payload);
    if (!asteroids.length) throw new Error("JPL SBDB returned no usable rows");
    state.asteroids = asteroids;
    ui.loadedMetric.textContent = state.asteroids.length.toLocaleString();
    ui.status.textContent = `已连接 NASA/JPL SBDB，读取 ${state.asteroids.length.toLocaleString()} 颗小行星轨道根数。`;
    applyFilter();
  } catch (error) {
    console.warn(error);
    ui.status.textContent = "NASA/JPL 在线数据暂不可用，当前使用内置轨道数据；动画可正常运行。";
  }
}

function parseJplPayload(payload) {
  const fields = payload.fields || [];
  const rows = payload.data || [];
  const index = Object.fromEntries(fields.map((field, position) => [field, position]));
  return rows
    .map((row) => {
      const a = readNumber(row, index.a);
      const e = readNumber(row, index.e);
      const i = readNumber(row, index.i);
      const om = readNumber(row, index.om);
      const w = readNumber(row, index.w);
      const ma = readNumber(row, index.ma);
      if (![a, e, i, om, w, ma].every(Number.isFinite)) return null;
      const neo = row[index.neo] === "Y";
      const pha = row[index.pha] === "Y";
      const classCode = String(row[index.class] || "");
      const group = classifyBody({ a, neo, pha, classCode });
      return {
        id: row[index.spkid],
        name: String(row[index.full_name] || row[index.pdes] || "asteroid").trim(),
        a,
        e: Math.min(e, 0.98),
        i,
        om,
        w,
        ma,
        n: readNumber(row, index.n) || meanMotionFromA(a),
        epoch: readNumber(row, index.epoch) || J2000,
        neo,
        pha,
        classCode,
        group,
      };
    })
    .filter(Boolean);
}

function applyFilter() {
  state.visibleAsteroids = state.asteroids
    .filter((body) => state.filter === "all" || body.group === state.filter)
    .slice(0, state.count);
  ui.visibleMetric.textContent = state.visibleAsteroids.length.toLocaleString();
  rebuildTrails();
}

function rebuildTrails() {
  state.trails = [];
  const stride = Math.max(1, Math.floor(state.visibleAsteroids.length / state.trailCount));
  const selected = state.visibleAsteroids.filter((_, index) => index % stride === 0).slice(0, state.trailCount);
  for (const body of selected) {
    const points = [];
    for (let step = 0; step <= TRAIL_SEGMENTS; step += 1) {
      points.push(orbitPosition(body, body.epoch, (step / TRAIL_SEGMENTS) * 360));
    }
    state.trails.push({ body, points });
  }
}

function animate(now) {
  const deltaSeconds = Math.min((now - state.lastTime) / 1000, 0.08);
  state.lastTime = now;
  state.simDays += (deltaSeconds * state.speed) / 24;
  const julianDate = J2000 + state.simDays;
  const date = new Date(Date.UTC(2000, 0, 1, 12) + state.simDays * DAY_MS);
  ui.dateMetric.textContent = date.toISOString().slice(0, 10);
  draw(julianDate, now / 1000);
  requestAnimationFrame(animate);
}

function draw(julianDate, time) {
  ctx.fillStyle = "#030408";
  ctx.fillRect(0, 0, state.width, state.height);
  drawStars(time);
  if (ui.toggleBloom.checked) drawDust(time);
  if (ui.toggleTrails.checked) drawTrails();
  if (ui.togglePlanets.checked) drawPlanets(julianDate);
  drawAsteroids(julianDate);
  drawSun(time);
}

function drawStars(time) {
  ctx.save();
  for (const star of stars) {
    const pulse = 0.5 + Math.sin(time * star.twinkle + star.phase) * 0.22;
    ctx.globalAlpha = star.alpha * pulse;
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x * state.width, star.y * state.height, star.size, star.size);
  }
  ctx.restore();
}

function drawDust(time) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of dust) {
    const angle = particle.angle + time * particle.speed;
    const point = project({
      x: Math.cos(angle) * particle.radius,
      y: particle.y,
      z: Math.sin(angle) * particle.radius,
    });
    if (!point.visible) continue;
    ctx.globalAlpha = 0.11 * point.depth;
    ctx.fillStyle = "#4ed8ff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(0.25, particle.size * point.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSun(time) {
  const center = project({ x: 0, y: 0, z: 0 });
  const radius = 15 * center.scale * state.zoom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 6.4);
  glow.addColorStop(0, "rgba(255, 235, 150, 0.95)");
  glow.addColorStop(0.22, "rgba(255, 143, 54, 0.45)");
  glow.addColorStop(1, "rgba(255, 74, 38, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  const body = ctx.createRadialGradient(center.x - radius * 0.3, center.y - radius * 0.25, 0, center.x, center.y, radius);
  body.addColorStop(0, "#fff6b3");
  body.addColorStop(0.24, "#ffc14f");
  body.addColorStop(0.72, "#f05a2a");
  body.addColorStop(1, "#3b1510");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 205, 105, ${0.4 + Math.sin(time * 2.1) * 0.12})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawPlanets(julianDate) {
  const items = [];
  for (const planet of planets) {
    drawOrbit(planet, planet.color, planet.a > 4 ? 0.17 : 0.25);
    const position = orbitPosition(planet, julianDate);
    const screen = project(position);
    if (screen.visible) items.push({ planet, screen });
  }
  items.sort((a, b) => a.screen.depth - b.screen.depth);
  for (const item of items) {
    const r = Math.max(2, item.planet.radius * item.screen.scale * state.zoom);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = item.planet.color;
    ctx.beginPath();
    ctx.arc(item.screen.x, item.screen.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = item.planet.color;
    ctx.beginPath();
    ctx.arc(item.screen.x, item.screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (item.planet.name === "土星") {
      ctx.strokeStyle = "rgba(241, 213, 140, 0.72)";
      ctx.lineWidth = Math.max(1, r * 0.28);
      ctx.beginPath();
      ctx.ellipse(item.screen.x, item.screen.y, r * 2.3, r * 0.68, -0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawTrails() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const trail of state.trails) {
    const alpha = trail.body.group === "pha" ? 0.22 : 0.11;
    ctx.strokeStyle = hexToRgba(colors[trail.body.group] || colors.outer, alpha);
    ctx.lineWidth = trail.body.group === "pha" ? 1.1 : 0.7;
    ctx.beginPath();
    let started = false;
    for (const point of trail.points) {
      const screen = project(point);
      if (!screen.visible) continue;
      if (!started) {
        ctx.moveTo(screen.x, screen.y);
        started = true;
      } else {
        ctx.lineTo(screen.x, screen.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroids(julianDate) {
  const points = [];
  for (const body of state.visibleAsteroids) {
    const screen = project(orbitPosition(body, julianDate));
    if (screen.visible) points.push({ body, screen });
  }
  points.sort((a, b) => a.screen.depth - b.screen.depth);
  ctx.save();
  ctx.globalCompositeOperation = ui.toggleBloom.checked ? "lighter" : "source-over";
  for (const item of points) {
    const color = colors[item.body.group] || colors.outer;
    const size = (item.body.group === "pha" ? 1.55 : 1.05) * item.screen.scale * state.zoom;
    ctx.globalAlpha = clamp(0.22 + item.screen.depth * 0.72, 0.12, 0.95);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(item.screen.x, item.screen.y, Math.max(0.45, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbit(body, color, alpha) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  let started = false;
  for (let step = 0; step <= 220; step += 1) {
    const screen = project(orbitPosition(body, body.epoch, (step / 220) * 360));
    if (!screen.visible) continue;
    if (!started) {
      ctx.moveTo(screen.x, screen.y);
      started = true;
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function orbitPosition(body, julianDate, anomalyOverride) {
  const meanAnomaly = anomalyOverride ?? body.ma + body.n * (julianDate - body.epoch);
  const M = degToRad(normalizeDegrees(meanAnomaly));
  const e = clamp(body.e || 0, 0, 0.98);
  let E = M;
  for (let iteration = 0; iteration < 7; iteration += 1) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  const xOrb = body.a * (Math.cos(E) - e);
  const yOrb = body.a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cosO = Math.cos(degToRad(body.om));
  const sinO = Math.sin(degToRad(body.om));
  const cosI = Math.cos(degToRad(body.i));
  const sinI = Math.sin(degToRad(body.i));
  const cosW = Math.cos(degToRad(body.w));
  const sinW = Math.sin(degToRad(body.w));
  const x = (cosO * cosW - sinO * sinW * cosI) * xOrb + (-cosO * sinW - sinO * cosW * cosI) * yOrb;
  const y = (sinO * cosW + cosO * sinW * cosI) * xOrb + (-sinO * sinW + cosO * cosW * cosI) * yOrb;
  const z = sinW * sinI * xOrb + cosW * sinI * yOrb;
  return { x: x * AU_SCALE, y: z * AU_SCALE, z: y * AU_SCALE };
}

function project(point) {
  const cosY = Math.cos(state.yaw);
  const sinY = Math.sin(state.yaw);
  const cosP = Math.cos(state.pitch);
  const sinP = Math.sin(state.pitch);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const y1 = point.y * cosP - z1 * sinP;
  const z2 = point.y * sinP + z1 * cosP;
  const cameraDistance = 920 / state.zoom;
  const perspective = cameraDistance / (cameraDistance + z2);
  const scale = perspective * 1.08;
  return {
    x: state.width * 0.55 + x1 * scale,
    y: state.height * 0.52 + y1 * scale,
    scale,
    depth: clamp(perspective, 0.15, 1.9),
    visible: perspective > 0.08,
  };
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  ui.canvas.width = Math.floor(state.width * state.dpr);
  ui.canvas.height = Math.floor(state.height * state.dpr);
  ui.canvas.style.width = `${state.width}px`;
  ui.canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function makeStars(count) {
  const palette = ["#ffffff", "#9bdcff", "#ffd39a", "#dfe7ff"];
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 1.7 + 0.35,
    alpha: Math.random() * 0.62 + 0.18,
    color: palette[Math.floor(Math.random() * palette.length)],
    twinkle: Math.random() * 1.8 + 0.5,
    phase: Math.random() * Math.PI * 2,
  }));
}

function makeDust(count) {
  return Array.from({ length: count }, () => ({
    radius: 90 + Math.random() * 300,
    angle: Math.random() * Math.PI * 2,
    speed: 0.005 + Math.random() * 0.018,
    y: (Math.random() - 0.5) * 20,
    size: Math.random() * 1.1 + 0.3,
  }));
}

function generateFallbackAsteroids(count) {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bodies = [];
  for (let index = 0; index < count; index += 1) {
    const roll = random();
    let a;
    let e;
    let i;
    let group;
    let neo = false;
    let pha = false;
    if (roll < 0.08) {
      a = 0.85 + random() * 1.55;
      e = 0.08 + random() * 0.55;
      i = random() * 24;
      neo = true;
      pha = random() < 0.09;
      group = pha ? "pha" : "near-earth";
    } else if (roll > 0.94) {
      a = 5.05 + random() * 0.42;
      e = random() * 0.12;
      i = random() * 32;
      group = "trojan";
    } else {
      a = 2.05 + random() * 1.25;
      e = random() * 0.24;
      i = random() ** 1.8 * 22;
      group = "main-belt";
    }
    bodies.push({
      id: `fallback-${index}`,
      name: `Synthetic asteroid ${index}`,
      a,
      e,
      i,
      om: random() * 360,
      w: random() * 360,
      ma: random() * 360,
      n: meanMotionFromA(a),
      epoch: J2000,
      neo,
      pha,
      classCode: group,
      group,
    });
  }
  return bodies;
}

function classifyBody(body) {
  if (body.pha) return "pha";
  if (body.neo || ["ATE", "APO", "AMO", "IEO"].includes(body.classCode)) return "near-earth";
  if (body.classCode.includes("TJN")) return "trojan";
  if (body.a >= 1.7 && body.a <= 3.7) return "main-belt";
  return "outer";
}

function readNumber(row, fieldIndex) {
  if (fieldIndex === undefined) return NaN;
  const value = Number(row[fieldIndex]);
  return Number.isFinite(value) ? value : NaN;
}

function meanMotionFromA(a) {
  return 0.9856076686 / Math.sqrt(a ** 3);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
