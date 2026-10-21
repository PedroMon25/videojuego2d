/* LAGO MALDITO — motor Canvas 2D completo (Música, Pausa, Reiniciar, Velocidad) */
(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("canvasWrap");
  const gameShell = document.getElementById("gameShell");
  const scoreEl = document.getElementById("score");
  const progressBar = document.getElementById("progressBar");
  const statusText = document.getElementById("statusText");
  const overlay = document.getElementById("introOverlay");
  const cursor = document.getElementById("customCursor");
  const toast = document.getElementById("toast");
  const audio = document.getElementById("ambientAudio");

  const radarCanvas = document.getElementById("radarCanvas");
  const radarCtx = radarCanvas.getContext("2d");
  const radarStatusText = document.getElementById("radarStatusText");
  const radarCard = document.getElementById("radarCard");
  const speedSelect = document.getElementById("speedSelect");

  const CONFIG = { creatureCount: 25, captureRadius: 25, targetScore: 25 };
  const COLORS = { cyan: "#4df5e5", pink: "#ff3ca6", purple: "#b879ff", orange: "#ff8a32" };
  const images = {};
  const imageFiles = {
    bat: "assets/images/murcielago.png",
    ghost: "assets/images/fantasma.png",
    eyes: "assets/images/ojos.png",
    background: "assets/images/fondo-lago.jpg"
  };

  Object.entries(imageFiles).forEach(([key, src]) => {
    const img = new Image();
    img.src = src;
    img.onload = () => { 
      images[key] = img;
      if (key === "background") buildBackground();
    };
    img.onerror = () => { console.warn(`No se pudo cargar ${src}.`); };
  });

  let width = 900, height = 520, dpr = 1, lastTime = 0, elapsed = 0;
  let score = 0, paused = false, started = false, soundOn = false, torchPulse = 0;
  let creatures = [], particles = [], fireflies = [], ripples = [], toastTimeout = null;
  let pointer = { x: -200, y: -200, inside: false };
  let backgroundCanvas = document.createElement("canvas");
  let backgroundCtx = backgroundCanvas.getContext("2d");
  let radarAngle = 0;
  let speedMultiplier = 1.0;

  const rand = (min, max) => Math.random() * (max - min) + min;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const choice = arr => arr[Math.floor(Math.random() * arr.length)];

  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    width = Math.max(320, rect.width);
    height = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const radarRect = radarCard.getBoundingClientRect();
    radarCanvas.width = Math.floor(radarRect.width);
    radarCanvas.height = Math.floor(radarRect.height);

    buildBackground();
    if (!creatures.length) resetCreatures();
    else creatures.forEach(c => { c.x = clamp(c.x, c.radius, width - c.radius); c.y = clamp(c.y, c.radius, height - c.radius); });
  }

  function buildBackground() {
    backgroundCanvas.width = Math.floor(width);
    backgroundCanvas.height = Math.floor(height);
    backgroundCtx = backgroundCanvas.getContext("2d");

    if (images.background?.complete && images.background.naturalWidth) {
      backgroundCtx.globalAlpha = 1;
      backgroundCtx.globalCompositeOperation = "source-over";
      backgroundCtx.drawImage(images.background, 0, 0, width, height);
    } else {
      backgroundCtx.fillStyle = "#090d19";
      backgroundCtx.fillRect(0, 0, width, height);
    }
  }

  function makeCreature(type, x, y) {
    const radius = type === "eyes" ? rand(13, 19) : type === "bat" ? rand(16, 23) : rand(17, 24);
    const angle = rand(0, Math.PI * 2), baseSpeed = rand(40, 95);
    return { type, x: x ?? rand(radius, width - radius), y: y ?? rand(radius, height - radius),
      radius, baseSpeed, vx: Math.cos(angle) * baseSpeed, vy: Math.sin(angle) * baseSpeed,
      angle: rand(0, Math.PI * 2), orbit: rand(18, 55), orbitSpeed: rand(.6, 1.7) * (Math.random() < .5 ? -1 : 1),
      moveType: choice(["vertical", "diagonal", "circular", "horizontal"]), phase: rand(0, 7),
      bob: rand(0, Math.PI * 2), rotation: rand(-.25, .25), age: rand(0, 10), opacity: 1, hit: 0, alive: true };
  }

  function resetCreatures() {
    creatures = [];
    const types = ["bat", "ghost", "eyes"];
    for (let i = 0; i < CONFIG.creatureCount; i++) creatures.push(makeCreature(types[i % types.length]));
    fireflies = Array.from({ length: 55 }, () => ({ x: rand(0, width), y: rand(0, height), r: rand(.7, 2), speed: rand(6, 22), phase: rand(0, 7), hue: choice([COLORS.cyan, COLORS.pink, COLORS.purple, COLORS.orange]) }));
  }

  function drawCreature(c) {
    const img = images[c.type];
    ctx.save(); ctx.globalAlpha = c.opacity; ctx.translate(c.x, c.y); ctx.rotate(c.rotation);
    const scale = c.hit > 0 ? 1 + Math.sin(c.hit * 25) * .2 : 1;
    ctx.scale(scale, scale);
    const auraColor = c.type === "bat" ? COLORS.purple : c.type === "ghost" ? COLORS.cyan : COLORS.pink;
    ctx.shadowBlur = c.hit > 0 ? 35 : 15; ctx.shadowColor = auraColor;
    if (img?.complete && img.naturalWidth) {
      const size = c.radius * 2.8;
      ctx.drawImage(img, -size/2, -size/2, size, size);
    }
    ctx.restore();
  }

  function spawnParticles(x, y, color, amount = 14, force = 1) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, Math.PI * 2), speed = rand(25, 150) * force;
      particles.push({ x, y, vx: Math.cos(a)*speed, vy: Math.sin(a)*speed, life: rand(.35, .85), maxLife: .85, size: rand(1.5, 4), color, gravity: rand(-10, 50), sparkle: Math.random() < .5 });
    }
  }

  function addRipple(x, y, color = COLORS.cyan) { ripples.push({ x, y, r: 2, life: .65, maxLife: .65, color }); }

  function updateCreature(c, dt) {
    c.age += dt; c.hit = Math.max(0, c.hit - dt);
    const currentSpeed = c.baseSpeed * speedMultiplier;
    
    if (c.moveType === "vertical") { 
      c.y += Math.sin(elapsed * 1.2 + c.phase) * currentSpeed * dt; 
      c.x += Math.sin(elapsed * .55 + c.phase) * currentSpeed * .15 * dt; 
    } else if (c.moveType === "circular") { 
      c.angle += c.orbitSpeed * speedMultiplier * dt; 
      c.x += Math.cos(c.angle) * c.orbit * dt; 
      c.y += Math.sin(c.angle) * c.orbit * dt; 
    } else { 
      c.x += (c.vx / c.baseSpeed) * currentSpeed * dt; 
      c.y += (c.vy / c.baseSpeed) * currentSpeed * dt; 
      if (c.moveType === "horizontal") c.vy = Math.sin(elapsed * 1.8 + c.phase) * currentSpeed * .35; 
    }
    
    c.x = clamp(c.x, c.radius, width - c.radius); c.y = clamp(c.y, c.radius, height - c.radius);
    if (c.x <= c.radius || c.x >= width - c.radius) c.vx *= -1;
    if (c.y <= c.radius || c.y >= height - c.radius) c.vy *= -1;
  }

  function drawRadar(dt) {
    const rw = radarCanvas.width, rh = radarCanvas.height;
    if (!rw || !rh) return;
    const cx = rw / 2, cy = rh / 2 - 10, radius = Math.min(rw, rh) * 0.38;

    radarCtx.clearRect(0, 0, rw, rh);
    radarCtx.strokeStyle = "#4df5e533";
    radarCtx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      radarCtx.beginPath();
      radarCtx.arc(cx, cy, (radius / 3) * r, 0, Math.PI * 2);
      radarCtx.stroke();
    }
    radarCtx.beginPath();
    radarCtx.moveTo(cx - radius, cy); radarCtx.lineTo(cx + radius, cy);
    radarCtx.moveTo(cx, cy - radius); radarCtx.lineTo(cx, cy + radius);
    radarCtx.stroke();

    radarAngle += dt * 1.8 * speedMultiplier;
    const sweepX = cx + Math.cos(radarAngle) * radius;
    const sweepY = cy + Math.sin(radarAngle) * radius;

    const grad = radarCtx.createRadialGradient(cx, cy, 2, cx, cy, radius);
    grad.addColorStop(0, "#4df5e520"); grad.addColorStop(1, "#4df5e500");
    radarCtx.fillStyle = grad;
    radarCtx.beginPath();
    radarCtx.moveTo(cx, cy);
    radarCtx.arc(cx, cy, radius, radarAngle - 0.4, radarAngle);
    radarCtx.closePath();
    radarCtx.fill();

    radarCtx.strokeStyle = COLORS.cyan;
    radarCtx.beginPath();
    radarCtx.moveTo(cx, cy);
    radarCtx.lineTo(sweepX, sweepY);
    radarCtx.stroke();

    let counts = { bat: 0, ghost: 0, eyes: 0 };
    creatures.forEach(c => {
      counts[c.type] = (counts[c.type] || 0) + 1;
      const rx = cx + (c.x / width - 0.5) * radius * 1.8;
      const ry = cy + (c.y / height - 0.5) * radius * 1.8;
      const color = c.type === "bat" ? COLORS.purple : c.type === "ghost" ? COLORS.cyan : COLORS.pink;

      radarCtx.fillStyle = color;
      radarCtx.shadowBlur = 8;
      radarCtx.shadowColor = color;
      radarCtx.beginPath();
      radarCtx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      radarCtx.fill();
    });
    radarCtx.shadowBlur = 0;
    radarStatusText.textContent = `🦇 ${counts.bat} | 👻 ${counts.ghost} | 👁️ ${counts.eyes}`;
  }

  function drawEnvironment(dt) {
    ctx.drawImage(backgroundCanvas, 0, 0, width, height);

    for (let i = 0; i < 3; i++) {
      const y = height * (.5 + i * .15) + Math.sin(elapsed * (.35+i*.1) + i) * 10;
      const x = ((elapsed * (8 + i*5) + i*width*.37) % (width*1.5)) - width*.25;
      const grad = ctx.createRadialGradient(x, y, 1, x, y, width*.28);
      grad.addColorStop(0, "#4df5e50e"); grad.addColorStop(1, "#4df5e500");
      ctx.fillStyle = grad; ctx.fillRect(0, y-70, width, 140);
    }

    if (pointer.inside && started) {
      const radius = 145 + (torchPulse > 0 ? (1-torchPulse/.8)*160 : 0);
      const glow = ctx.createRadialGradient(pointer.x,pointer.y,4,pointer.x,pointer.y,radius);
      glow.addColorStop(0, "#ffb65a26"); glow.addColorStop(.25, "#ff8a3218"); glow.addColorStop(1, "#ff8a3200");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(pointer.x,pointer.y,radius,0,Math.PI*2); ctx.fill();
    }
  }

  function updateParticles(dt) {
    particles = particles.filter(p => (p.life -= dt) > 0);
    particles.forEach(p => { p.x += p.vx*dt; p.y += p.vy*dt; p.vy += p.gravity*dt; });
    ripples = ripples.filter(r => (r.life -= dt) > 0);
    ripples.forEach(r => { r.r += 95*dt; });
  }

  function drawParticles() {
    ripples.forEach(r => { ctx.globalAlpha = r.life/r.maxLife; ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x,r.y,r.r,r.r*.55,0,0,Math.PI*2); ctx.stroke(); });
    particles.forEach(p => { ctx.globalAlpha = clamp(p.life/p.maxLife,0,1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(.3+p.life/p.maxLife),0,Math.PI*2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    requestAnimationFrame(frame);
    const dt = Math.min((time - (lastTime || time))/1000, .04); lastTime = time;
    if (!paused && started) elapsed += dt;
    if (!paused && started) {
      creatures.forEach(c => updateCreature(c, dt));
      updateParticles(dt); torchPulse = Math.max(0, torchPulse-dt);
    } else { updateParticles(dt); }
    drawEnvironment(dt);
    if (!paused) creatures.forEach(drawCreature);
    drawParticles();
    drawRadar(dt);
  }

  function updateScore() {
    scoreEl.textContent = String(score).padStart(3, "0");
    progressBar.style.width = `${Math.min(100, score/CONFIG.targetScore*100)}%`;
  }

  function showToast(message) {
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function setStatus(msg) { statusText.textContent = msg; }

  function startGame() {
    started = true; paused = false; overlay.classList.add("hidden"); cursor.style.display = "block";
    setStatus("Expedición en curso · las sombras se mueven");
    showToast("La cacería ha comenzado. ¡Buena suerte!");
  }

  // LÓGICA DE PAUSA
  function togglePause() {
    if (!started) { startGame(); return; }
    paused = !paused;
    const btn = document.getElementById("pauseButton");
    btn.innerHTML = paused ? "▶ <span>Reanudar</span>" : "Ⅱ <span>Pausar</span>";
    setStatus(paused ? "Tiempo detenido · el lago guarda silencio" : "Expedición en curso · las sombras se mueven");
    showToast(paused ? "La noche espera..." : "La cacería continúa");
  }

  // LÓGICA DE REINICIO
  function resetGame() {
    score = 0; paused = false; started = true; torchPulse = 0; particles = []; ripples = [];
    resetCreatures(); updateScore(); overlay.classList.add("hidden"); cursor.style.display = "block";
    document.getElementById("pauseButton").innerHTML = "Ⅱ <span>Pausar</span>";
    setStatus("Nueva expedición · 25 criaturas detectadas");
    showToast("La maldición comienza de nuevo");
  }

  // LÓGICA DE SONIDO Y MÚSICA
  async function toggleSound() {
    soundOn = !soundOn;
    const btn = document.getElementById("soundButton");
    btn.innerHTML = soundOn ? "♫ <span>Silenciar</span>" : "♫ <span>Activar sonido</span>";
    btn.setAttribute("aria-pressed", String(soundOn));
    if (soundOn) {
      try {
        await audio.play();
        showToast("Música ambiental activada");
      } catch (e) {
        showToast("Coloca ambiente.mp3 en assets/audio/");
      }
    } else {
      audio.pause();
      showToast("Música silenciada");
    }
  }

  function captureAt(x,y) {
    if (!started || paused) return;
    let foundIndex = -1, best = Infinity;
    creatures.forEach((c,i) => {
      const dist = Math.hypot(c.x-x,c.y-y);
      if (dist < c.radius + CONFIG.captureRadius*.35 && dist < best) { best = dist; foundIndex = i; }
    });
    if (foundIndex < 0) return;
    const c = creatures[foundIndex], color = c.type === "bat" ? COLORS.purple : c.type === "ghost" ? COLORS.cyan : COLORS.pink;
    spawnParticles(c.x,c.y,color,24,1.25); addRipple(c.x,c.y,color);
    creatures.splice(foundIndex,1);
    score++; updateScore();
    showToast(`✦ Alma capturada (+1)`);
    creatures.push(makeCreature(choice(["bat","ghost","eyes"]), rand(25,width-25), rand(25,height-25)));
  }

  function revealShadows() {
    if (!started) startGame();
    showToast("🔮 ¡Sombras reveladas en el lago!");
    creatures.forEach(c => {
      c.hit = 0.8;
      const color = c.type === "bat" ? COLORS.purple : c.type === "ghost" ? COLORS.cyan : COLORS.pink;
      spawnParticles(c.x, c.y, color, 12, 0.8);
      addRipple(c.x, c.y, color);
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      gameShell.requestFullscreen().catch(() => showToast("No se pudo activar la pantalla completa."));
    } else {
      document.exitFullscreen();
    }
  }

  canvas.addEventListener("pointermove", e => {
    const rect = wrap.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.inside = true;
    cursor.style.display = "block";
    cursor.style.left = `${pointer.x}px`;
    cursor.style.top = `${pointer.y}px`;
  });

  canvas.addEventListener("pointerenter", () => {
    pointer.inside = true;
    cursor.style.display = "block";
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
    cursor.style.display = "none";
  });

  canvas.addEventListener("pointerdown", e => {
    const rect = canvas.getBoundingClientRect();
    captureAt(e.clientX-rect.left, e.clientY-rect.top);
  });

  speedSelect.addEventListener("change", e => {
    speedMultiplier = parseFloat(e.target.value);
    const speedLabels = { "0.6": "Modo Lento", "1.0": "Modo Normal", "1.7": "Modo Pesadilla" };
    showToast(`⚡ Velocidad: ${speedLabels[e.target.value]}`);
  });

  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "p" && !e.repeat) togglePause();
  });

  radarCard.addEventListener("click", revealShadows);
  document.getElementById("revealButton").addEventListener("click", revealShadows);
  document.getElementById("startButton").addEventListener("click", startGame);
  document.getElementById("overlayStartButton").addEventListener("click", startGame);
  document.getElementById("pauseButton").addEventListener("click", togglePause);
  document.getElementById("resetButton").addEventListener("click", resetGame);
  document.getElementById("soundButton").addEventListener("click", toggleSound);
  document.getElementById("fullscreenButton").addEventListener("click", toggleFullscreen);
  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  requestAnimationFrame(frame);
})();