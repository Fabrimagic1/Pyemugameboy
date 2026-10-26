// Web Worker: esegue l'emulatore Python con Pyodide senza bloccare la pagina.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const PY_FILES = ["../cpu.py", "../memory.py", "../timer.py", "../gpu.py", "emu_web.py"];
const FRAME_MS = 1000 / 60;

let pyodide = null;
let emu = null;
let running = false;
let timer = null;
let fpsFrames = 0;
let fpsStart = 0;

async function init() {
  importScripts(PYODIDE_URL + "pyodide.js");
  pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage("numpy");
  // I sorgenti vanno nel filesystem in memoria di Pyodide
  for (const path of PY_FILES) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Impossibile caricare ${path} (${resp.status})`);
    pyodide.FS.writeFile(path.split("/").pop(), await resp.text());
  }
  pyodide.runPython("from emu_web import WebEmulator");
  postMessage({ type: "ready" });
}

function loop() {
  if (!running) return;
  const start = performance.now();
  let pixels;
  try {
    const result = emu.run_frame();
    pixels = result.toJs();
    result.destroy();
  } catch (err) {
    running = false;
    postMessage({ type: "error", message: String(err) });
    return;
  }
  postMessage({ type: "frame", pixels }, [pixels.buffer]);

  fpsFrames++;
  const now = performance.now();
  if (now - fpsStart >= 1000) {
    postMessage({ type: "fps", fps: (fpsFrames * 1000) / (now - fpsStart) });
    fpsFrames = 0;
    fpsStart = now;
  }
  timer = setTimeout(loop, Math.max(0, FRAME_MS - (now - start)));
}

function loadRom(bytes) {
  running = false;
  clearTimeout(timer);
  if (emu) emu.destroy();
  const WebEmulator = pyodide.globals.get("WebEmulator");
  const pyBytes = pyodide.toPy(bytes);
  try {
    emu = WebEmulator(pyBytes);
  } finally {
    pyBytes.destroy();
    WebEmulator.destroy();
  }
  postMessage({ type: "loaded", title: emu.title() });
  running = true;
  fpsFrames = 0;
  fpsStart = performance.now();
  loop();
}

onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === "rom") loadRom(new Uint8Array(msg.data));
    else if (msg.type === "key" && emu) emu.set_key(msg.group, msg.bit, msg.pressed);
    else if (msg.type === "pause") {
      running = false;
      clearTimeout(timer);
    } else if (msg.type === "resume" && emu && !running) {
      running = true;
      fpsFrames = 0;
      fpsStart = performance.now();
      loop();
    }
  } catch (err) {
    postMessage({ type: "error", message: String(err) });
  }
};

init().catch((err) => postMessage({ type: "error", message: String(err) }));
