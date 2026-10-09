import * as THREE from 'three';
import { MOUSE, TOUCH } from 'three';
import './styles/index.css';
import { TrackFormatError, validateTrack, type SerializedTrack } from './track/Track';
import { CAMERA_LABELS, type CameraMode } from './render/CameraRig';
import { STEPS_PER_SECOND } from './physics/Simulation';
import { HOP_FULL, P } from './physics/Rider';
import { vehicleById, type VehicleDef } from './physics/vehicles';
import { BIOMES, DEFAULT_WORLD, TIMES, WEATHERS, biomeById, normalizeWorld, sameWorld, surfaceOf, worldLabel, type BiomeId, type WorldConfig } from './world/worlds';
import { UI, type SettingsView, type SummaryInfo } from './ui/UI';
import { resetProgress, saveSettings, type Quality as QualitySetting } from './game/settings';
import { buildDemoTrack } from './demoTrack';
import { dailyLink, readSharedLink, shareLink } from './game/share';
import { rateRun } from './game/rating';
import { beats, encodeInputs, loadGhost, saveGhost, type GhostRecord } from './game/Ghost';
import { MEDALS, MEDAL_NAME, bestTime, levelMedal, medalFor, medalTimes, recordTime } from './game/medals';
import { LEVELS, chapterOf } from './levels/levels';
import { OUTFITS, champions, isUnlocked, outfitUnlocked, loadProgress, saveLevelResult, selectOutfit, selectedOutfit, totalStars, worldGate, worldOpen } from './game/progress';
import { ACHIEVEMENTS, evaluate, loadCounters, noteWorld, selectPaint, unlockedAchievements, type RunContext } from './game/achievements';
import { KEYS, migrateStorage, readFlag, readJSON, readText, writeFlag, writeJSON, writeText } from './game/storage';
import { buildTemplate, TEMPLATES, type TemplateId } from './editor/templates';
import type { EditorPrefs, Tool } from './editor/Editor';
import { createSlot, currentSlot, deleteSlot, duplicateSlot, freshName, listSlots, loadSlot, renameSlot, saveSlot, setCurrent } from './game/gallery';
import { createStage, fitToWindow } from './app/stage';
import { createCore, type Core } from './app/core';
import { EDIT, TITLE, autosaves, challengeOf, editing, fixedTrack, freeEdit, inGame, levelOf, type Session } from './app/session';
import { PUZZLES, budgetText, finishGoal, parGoal, puzzleBase, puzzleKind, puzzleSpent, puzzleWorld, trickDone, usesInk, type PuzzleBase } from './levels/puzzles';
import { loadPuzzles, puzzleGate, puzzleWorldOpen, savePuzzle } from './game/puzzleProgress';
import { dailyInfo, dayKey } from './levels/daily';
import { loadDaily, recordDaily, streakOn } from './game/dailyRecords';
import { dailyTrack } from './app/dailyTrack';
import { Input } from './app/Input';
import { Run } from './app/Run';
import { WorldDirector } from './app/WorldDirector';
import { CameraMoves } from './app/CameraMoves';
import { Rides } from './app/Rides';
import { Quality } from './app/Quality';
import { recordBest, runKey } from './app/records';
import { registerServiceWorker } from './app/pwa';
import { showUpdate } from './ui/screens/update';
import { SEASON_END, halloweenSeason, seasonOn, type SeasonPref } from './game/season';

/** Favicon during the Halloween season. */
const PUMPKIN_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 16c-4-3-11-4-17-1C7 19 4 29 6 38c2 10 11 16 26 16s24-6 26-16c2-9-1-19-9-23-6-3-13-2-17 1Z" fill="#f07a1c"/><path d="M32 16V7c3 0 6 1 8 3" stroke="#4a5a22" stroke-width="4" fill="none" stroke-linecap="round"/><path d="m18 30 5-6 5 6Zm18 0 5-6 5 6ZM17 39c4 5 9 7 15 7s11-2 15-7l-5 2-3-3-3 3-4-3-4 3-3-3-3 3Z" fill="#3a1a08"/></svg>',
  );

// Upgrade saves from older builds before anything reads them.
migrateStorage();
// Installed app: the game stays on the device for offline play.
// A new version found while playing: offered once no run is on (the editor track is saved first).
registerServiceWorker((version, restart) =>
  showUpdate(version, () => {
    flushSave();
    restart();
  }),
);

// ------------------------------------------------------------------ setup
const stage = createStage(document.getElementById('app')!);
const core = createCore(stage) as Core;
const { track, sim, rig, camera, controls, env, editor, sound, runStats, riderCenter } = core;

/** What the player is doing (title, editing, a level). */
let session: Session = TITLE;
const levelIndex = () => levelOf(session);
const challenge = () => challengeOf(session);
const playingGame = () => inGame(session);
/** The challenger's run from a link, raced live (cleared with the session). */
let friendGhost: GhostRecord | null = null;
/** Rider controls: always on in levels, dailies and challenges, a toggle in the editor. */
let riderMode = readFlag(KEYS.riderMode);
const riderOn = () => session.kind !== 'puzzle' && (fixedTrack(session) || challenge() > 0 || riderMode);

const moves = new CameraMoves(camera, controls);
editor.fly = (pos, target, duration) => moves.flyTo(pos, target, duration);
editor.applyPrefs(readJSON<Partial<EditorPrefs>>(KEYS.editorPrefs, {}));
const input = new Input(playingGame, () => freeEdit(session), cycleVehicle);

const run = new Run(core, {
  inGame: playingGame,
  riderOn,
  input: () => input.mask,
  vehicle: () => rides.current,
  // A friend's ghost from a challenge link, else the player's own best.
  ghostRecord: () => friendGhost ?? loadGhost(ghostKey()),
  focus: focusRider,
  tick: () => checkAchievements(false),
  ended: showSummary,
});

const worlds = new WorldDirector(core, {
  applied() {
    // The title's demo run restarts on the new ground (no mid-run re-simulation).
    if (session.kind === 'title') run.rewind();
    run.ghost = null;
  },
  shown: (w) => core.ui?.setWorldBadge(w),
});
applySeason();

/** Halloween look (title tour, colors, favicon) while the season is on and not turned off. */
function applySeason() {
  const on = seasonOn(core.settings.seasonal);
  const was = document.body.classList.contains('season-halloween');
  document.body.classList.toggle('season-halloween', on);
  worlds.setSeason(on);
  const link = document.querySelector<HTMLLinkElement>('link[rel=icon]');
  if (link) {
    link.dataset.base ??= link.href;
    link.href = on ? PUMPKIN_ICON : link.dataset.base;
  }
  // Switching it on the title shows the Hollow right away.
  if (on !== was && session.kind === 'title') worlds.startTour();
}

const rides = new Rides(core, {
  lockReason: () => (rides.locked ? (session.kind === 'daily' ? "the daily's ride" : challenge() > 0 ? "the challenger's ride" : "this level's ride") : null),
  changed() {
    run.ghost = null;
    run.reset();
  },
});

/** Stops the run; in a puzzle the camera goes back to the side view to fix the track. */
function stopRun() {
  run.stop();
  restoreTestStart();
  if (session.kind === 'puzzle') moves.showSide(track, 0.8);
  else if (session.kind === 'edit') editor.reframe();
}

/** The real start while testing from another point (put back on Stop). */
let testStart: THREE.Vector3 | null = null;

function restoreTestStart() {
  if (!testStart) return;
  const back = testStart;
  testStart = null;
  loadInto(() => track.setStart(back));
}

/** T: ride from the point under the pointer without moving the start flag for good. */
function testHere() {
  // Puzzles keep their own start.
  if (session.kind !== 'edit' || run.playing) return;
  const p = editor.cursorPoint();
  if (!p) return ui.flash(stage.isTouch ? 'Centre a track or the drawing grid on screen, then tap Test' : 'Point at a track or the drawing grid, then press T');
  run.stop();
  if (!testStart) testStart = track.start.clone();
  loadInto(() => track.setStart(p));
  ui.flash('Testing from here: Stop puts the start flag back', 2500);
  run.play();
}

/** Ghosts and bests are per track, ride and ground. */
function ghostKey() {
  return runKey(track, rides.current.id, surfaceOf(env.config));
}

function focusRider() {
  sim.seek(run.frame);
  sim.rider.center(riderCenter);
  moves.focus(riderCenter);
  rig.snapTo(riderCenter);
}

function cycleVehicle() {
  if (rides.locked) return;
  run.stop();
  const next = rides.cycle();
  if (next) core.ui.flash(`Ride: ${next.name}`);
}

// ------------------------------------------------------------------ saving

/** A freshly loaded demo is not saved, so it never overwrites the player's own track. */
let pristine = true;
/** What the current puzzle built (to tell the player's rings and erased lines apart). */
let puzzleBuilt: PuzzleBase = { rings: new Set(), erasable: new Set() };
/**
 * The gallery slot of the track in the editor; null until a new, demo or
 * shared track is first edited, which then becomes a new saved track.
 */
let slotId: string | null = null;
let slotName = '';
let loading = false;
let saveTimer = 0;

/** Saves now if an autosave is pending (before the track or its slot changes). */
function flushSave() {
  writeJSON(KEYS.editorPrefs, editor.prefs());
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTrack();
}

function loadInto(fn: () => void) {
  flushSave();
  loading = true;
  fn();
  loading = false;
}

track.on((e) => {
  // Moving the start flag by hand during a test keeps it (Stop won't put the old one back).
  if (e.kind === 'startChanged' && !loading) testStart = null;
  if (loading || e.kind === 'cleared' || !autosaves(session)) return;
  pristine = false;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveTrack, 400);
});

/** Saves the editor track into its gallery slot (a new one on the first edit). */
function saveTrack() {
  saveTimer = 0;
  if (!slotId) slotId = createSlot(slotName || freshName());
  const data = track.serialize();
  // While testing from another point, the real start is the one saved.
  if (testStart) data.start = testStart.toArray();
  if (!saveSlot(slotId, data)) ui.flash('Storage is full: export your track to keep it', 4000);
}

/** The track "Continue" opens (the last one edited). */
function savedTrack(): SerializedTrack | null {
  const id = currentSlot();
  const data = id ? loadSlot(id) : null;
  return data && data.strokes.length > 0 ? data : null;
}

/** Opens a saved track from the gallery. */
function openSlot(id: string) {
  const data = loadSlot(id);
  if (!data) return ui.flash("That track can't be read");
  openTrack(() => track.load(data), null, false);
  slotId = id;
  setCurrent(id);
}

function galleryCards() {
  const current = currentSlot();
  return listSlots().map((s) => ({ ...s, current: s.id === current }));
}

/** My tracks: open, create, rename, duplicate, delete. Resolves when a track is opened. */
async function openGallery(): Promise<boolean> {
  const pick = await ui.showGallery(galleryCards(), {
    rename: (id, name) => (renameSlot(id, name), galleryCards()),
    duplicate: (id) => (duplicateSlot(id), galleryCards()),
    remove: (id) => {
      deleteSlot(id);
      if (slotId === id) slotId = null;
      return galleryCards();
    },
  });
  if (!pick) return false;
  if ('create' in pick) startNewTrack();
  else openSlot(pick.open);
  return true;
}

// Closing the tab right after an edit still saves it.
addEventListener('pagehide', flushSave);

loadInto(() => buildDemoTrack(track));
worlds.apply(env.config);
rides.dress();

// ------------------------------------------------------------------ UI
const cameraModes: CameraMode[] = ['cinematic', 'chase', 'side', 'follow'];

const ui = new UI(stage.app.appendChild(Object.assign(document.createElement('div'), { className: 'ui' })), editor, {
  play: () => run.play(),
  // Touch has no Esc: in a game, the pause button opens the pause menu.
  pause: () => (stage.isTouch && playingGame() && run.playing && !run.replaying ? openPause() : run.pause()),
  stop: () => stopRun(),
  seek: (f) => run.seek(f),
  cycleCamera() {
    rig.mode = cameraModes[(cameraModes.indexOf(rig.mode) + 1) % cameraModes.length];
    return CAMERA_LABELS[rig.mode];
  },
  toggleSlowMo() {
    run.slowMo = !run.slowMo;
    return run.slowMo;
  },
  levels: () => backToLevels(),
  mainMenu() {
    run.stop();
    enterTitle();
  },
  async newTrack() {
    const tpl = await ui.pickTemplate(TEMPLATES);
    if (!tpl) return;
    noteSaved();
    startNewTrack(tpl);
  },
  loadDemo() {
    noteSaved();
    openTrack(() => buildDemoTrack(track), DEFAULT_WORLD);
  },
  exportTrack() {
    const blob = new Blob([JSON.stringify(track.serialize())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linerider3d-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // Safari reads the blob after the click returns.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importTrack(file) {
    file.text().then((text) => {
      try {
        const data = validateTrack(JSON.parse(text));
        // An imported track becomes a new saved track, named after its file.
        openTrack(() => track.load(data), null, false);
        slotId = null;
        slotName = file.name.replace(/\.json$/i, '').replace(/[-_]+/g, ' ').slice(0, 40) || freshName();
        saveTrack();
        ui.flash('Track loaded');
      } catch (e) {
        ui.flash(e instanceof TrackFormatError ? e.message : 'Invalid track file', 4500);
      }
    });
  },
  focusRider,
  world: () => env.config,
  setWorld(w) {
    const cfg = normalizeWorld(w);
    // The ground changes the physics: the run starts over.
    run.stop();
    track.setWorld(cfg);
    worlds.applyNow(cfg);
    ui.flash(worldLabel(env.config));
    return env.config;
  },
  settings: () => openSettings(),
  escape() {
    if (playingGame() && run.playing) openPause();
    else stopRun();
  },
  photo: () => openPhoto(),
  async share(score = 0) {
    // A daily needs no track in the link: everyone can build the day's ride.
    const daily = session.kind === 'daily' ? dailyInfo(session.day) : null;
    // A score comes from the run just ended: its inputs become the friend's ghost.
    const ghost = score > 0 && run.summaryShown && riderOn() && runStats.stats.respawns === 0 ? encodeInputs(sim.inputsUpTo(run.frame)) : undefined;
    const url = daily ? dailyLink(daily.day, score, ghost) : await shareLink(track.serialize(), score, rides.current.id, ghost);
    const text = daily
      ? `I scored ${score.toLocaleString()} on Line Rider 3D Daily #${daily.number} (${daily.name}). Can you beat it?`
      : score > 0
        ? `I scored ${score.toLocaleString()} on this Line Rider 3D track. Can you beat it?`
        : 'Ride my Line Rider 3D track!';
    // Phones: the native share sheet. Elsewhere: a dialog with a copy button.
    if (navigator.share && stage.isTouch) {
      try {
        await navigator.share({ title: 'Line Rider 3D', text, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    ui.showLink(url, score);
  },
  toggleSfx() {
    sound.setSfx(!sound.sfxOn);
    return sound.sfxOn;
  },
  toggleMusic() {
    sound.setMusic(!sound.musicOn);
    return sound.musicOn;
  },
  toggleRiderMode() {
    riderMode = !riderMode;
    writeFlag(KEYS.riderMode, riderMode);
    return riderMode;
  },
  touchInput(mask) {
    input.touch = mask;
  },
  spaceJumps: () => run.playing && playingGame() && riderOn() && !run.replaying,
  cycleVehicle,
  testHere,
  async gallery() {
    run.stop();
    await openGallery();
  },
  click: () => sound.click(),
}, riderMode);
core.ui = ui;
ui.setSoundState(sound.sfxOn, sound.musicOn);
ui.setWorldBadge(env.config);
rides.apply(rides.current);

const quality = new Quality(core);
quality.apply(true);
fitToWindow(stage, () => core.effects.setViewportHeight(innerHeight * stage.renderer.getPixelRatio()));

// ------------------------------------------------------------------ sessions

/** Leaving an edited track: it is kept in the gallery (say so once). */
function noteSaved() {
  if (session.kind === 'edit' && !pristine && track.strokes.size > 0) ui.flash('Your track is saved in My tracks', 2500);
}

/**
 * Switches session: editor on or off, the ride lock, rider controls.
 * Levels lock their own ride; a challenge locks the challenger's.
 */
function enter(next: Session, lockedRide: VehicleDef | null = null, ghost: number[] | null = null) {
  // The track being left keeps its pending edits, and its real start flag.
  restoreTestStart();
  flushSave();
  const wasTitle = session.kind === 'title';
  session = next;
  friendGhost = ghost && challengeOf(next) > 0 ? { rle: ghost, frames: ghost.reduce((n, v, i) => n + (i % 2 ? v : 0), 0), score: challengeOf(next), finishTime: 0 } : null;
  if (wasTitle && next.kind !== 'title') {
    run.playing = false;
    run.reset();
    ui.setPlaying(false);
  }
  const index = levelOf(next);
  // Puzzles are tuned (and tested) for the sled.
  const fixed = index !== null ? LEVELS[index].vehicle : next.kind === 'daily' ? dailyInfo(next.day).vehicle : next.kind === 'puzzle' ? 'sled' : undefined;
  rides.lock(fixed ? vehicleById(fixed) : lockedRide);
  editor.enabled = editing(next);
  if (next.kind !== 'puzzle' && editor.rules) {
    editor.setRules(null);
    ui.setPuzzle(false);
  }
  document.body.classList.toggle('level-mode', fixedTrack(next));
  document.body.classList.toggle('puzzle-mode', next.kind === 'puzzle');
  ui.setRiderMode(next.kind === 'puzzle' ? false : fixedTrack(next) || challenge() > 0 ? true : riderMode);
}

/**
 * Opens a track in the editor and flies to its start. `world` null means the
 * track's own world; `fresh` tracks (demo, new, shared) aren't autosaved until edited.
 */
function openTrack(load: () => void, world: Partial<WorldConfig> | null, fresh = true) {
  enter(EDIT);
  // A fresh track (demo, shared) is saved as a new track once edited.
  slotId = null;
  slotName = '';
  loadInto(load);
  worlds.change(world ?? worlds.trackWorld());
  pristine = fresh;
  editor.history.clear();
  run.stop();
  editor.showStart();
}

function startNewTrack(template: TemplateId = 'blank') {
  enter(EDIT);
  slotId = null;
  slotName = '';
  let end: ReturnType<typeof buildTemplate> = null;
  loadInto(() => (end = buildTemplate(track, template)));
  worlds.change(DEFAULT_WORLD);
  pristine = true;
  editor.history.clear();
  run.stop();
  editor.showStart();
  // A template carries on from the end of its track.
  const e = end as ReturnType<typeof buildTemplate>;
  if (e) {
    editor.work.moveTo(e.end, e.tangent);
    // Carry on from the end of the template.
    editor.showTip();
  }
}

function enterTitle() {
  enter(TITLE);
  run.ghost = null;
  loadInto(() => buildDemoTrack(track));
  worlds.startTour();
  pristine = true;
  run.reset();
  sim.clearInputs();
  run.playing = true;
  titleFlow();
}

/** Garage and wardrobe: Bosh waits at the start for a close look. */
async function closeUp<T>(show: () => Promise<T>): Promise<T> {
  moves.closeUp = true;
  run.playing = false;
  run.reset();
  const result = await show();
  moves.closeUp = false;
  run.playing = true;
  return result;
}

async function titleFlow() {
  for (;;) {
    const progress = loadProgress();
    const choice = await ui.showTitle(savedTrack() !== null, totalStars(progress), LEVELS.length * 3, dailyCard(), seasonCard(progress), nextLevel(progress));
    if (choice === 'wardrobe') {
      const stars = totalStars(progress);
      await closeUp(() =>
        ui.showWardrobe(
          OUTFITS.map((o) => ({
            id: o.id,
            name: o.name,
            stars: o.stars,
            colors: [o.jacket, o.scarf, o.hat, o.sled],
            unlocked: outfitUnlocked(o, stars),
            world: o.hint,
            lock: o.season ? ACHIEVEMENTS.find((a) => a.id === o.achievement)?.desc : undefined,
            tag: o.season ? (halloweenSeason() ? `🎃 Free until ${SEASON_END}` : '🎃 Halloween') : undefined,
          })),
          stars,
          selectedOutfit().id,
          (id) => {
            selectOutfit(id);
            rides.dress();
          },
        ),
      );
      continue;
    }
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'phone') {
      await ui.showPhone();
      continue;
    }
    if (choice === 'trophies') {
      const got = unlockedAchievements();
      await ui.showTrophies(
        ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, desc: a.desc, ride: a.ride, rideName: a.ride ? vehicleById(a.ride).name : undefined, unlocked: !!got[a.id] })),
      );
      continue;
    }
    if (choice === 'garage') {
      await closeUp(() =>
        ui.showGarage(
          rides.garageCards(),
          rides.current.id,
          (id) => {
            rides.choose(id);
            run.playing = false;
          },
          (ride, paint) => {
            selectPaint(ride as VehicleDef['id'], paint);
            rides.dress();
            return rides.garageCards();
          },
        ),
      );
      continue;
    }
    if (choice === 'puzzles') {
      const idx = await pickPuzzle();
      if (idx === null) continue;
      startPuzzle(idx);
      return;
    }
    if (choice === 'daily') {
      enterDaily(dayKey());
      return;
    }
    if (choice === 'levels' || choice === 'season') {
      const idx = await pickLevel(choice === 'season' ? 'halloween' : undefined);
      if (idx === null) continue;
      startLevel(idx);
      return;
    }
    if (choice === 'gallery') {
      if (await openGallery()) return;
      continue;
    }
    if (choice === 'create' && currentSlot()) {
      openSlot(currentSlot()!);
      return;
    }
    const tpl = await ui.pickTemplate(TEMPLATES);
    if (!tpl) continue;
    startNewTrack(tpl);
    // A first track gets the walkthrough (the full help stays in the menu).
    if (readText(KEYS.editorTour) === null) {
      writeText(KEYS.helpSeen, '1');
      setTimeout(() => ui.startTour(() => writeText(KEYS.editorTour, '1')), 1500);
    }
    return;
  }
}

/** The Haunted Hollow button on the title, during the season. */
/** The level Play leads to: the first open one not yet won, for the title's Play card. */
function nextLevel(progress: ReturnType<typeof loadProgress>) {
  const i = LEVELS.findIndex((l, k) => isUnlocked(k, progress) && !(progress[l.id]?.stars ?? 0));
  if (i < 0) return null;
  return { name: LEVELS[i].name, world: chapterOf(LEVELS[i]), number: i + 1, fresh: Object.keys(progress).length === 0 };
}

function seasonCard(progress: ReturnType<typeof loadProgress>) {
  if (!seasonOn(core.settings.seasonal)) return null;
  const hollow = LEVELS.filter((l) => chapterOf(l) === 'halloween');
  return { stars: hollow.reduce((n, l) => n + (progress[l.id]?.stars ?? 0), 0), max: hollow.length * 3 };
}

function pickLevel(focus?: BiomeId): Promise<number | null> {
  const progress = loadProgress();
  return ui.showLevels(
    LEVELS.map((l, i) => ({
      name: l.name,
      tip: l.tip,
      stars: progress[l.id]?.stars ?? 0,
      score: progress[l.id]?.score ?? 0,
      unlocked: isUnlocked(i, progress),
      world: chapterOf(l),
      ride: l.vehicle,
      medal: levelMedal(l.id),
      difficulty: l.difficulty,
      skill: !!l.solution,
    })),
    BIOMES.map((b) => ({ id: b.id, open: worldOpen(b.id, progress), gate: worldGate(b.id) })),
    totalStars(progress),
    focus,
  );
}

async function startLevel(index: number) {
  enter({ kind: 'level', index });
  const level = LEVELS[index];
  loadInto(() => level.build(track));
  worlds.change(worlds.levelWorld(index));
  pristine = true;
  editor.history.clear();
  run.stop();
  moves.showStart(track, 1.3);
  const best = loadProgress()[level.id]?.stars ?? 0;
  const goals = rateRun(track, runStats.stats).goals.map((g) => g.label);
  const medals = (ride: string) => {
    const times = medalTimes(level.id, ride);
    return times ? { times, best: bestTime(level.id, ride) } : null;
  };
  await ui.showLevelIntro(index + 1, level.name, level.tip, goals, best, rides.keys(), rides.picker(medals), worlds.picker(worlds.levelWorld(index)));
  run.play();
}

async function backToLevels() {
  run.stop();
  const idx = await pickLevel();
  if (idx === null) enterTitle();
  else startLevel(idx);
}

/** Opens a track from a share link, with an intro (and the challenge score). */
async function enterShared(data: SerializedTrack, score: number, vehicleId: string | null, ghost: number[] | null = null) {
  // A challenge is ridden on the challenger's ride, against their ghost.
  // Links leave out the sled (the default ride).
  enter({ kind: 'edit', challenge: score }, score > 0 ? vehicleById(vehicleId ?? 'sled') : null, ghost);
  slotId = null;
  slotName = freshName('Shared track');
  loadInto(() => track.load(data));
  worlds.change(worlds.trackWorld());
  pristine = true;
  history.replaceState(null, '', location.pathname + location.search);
  editor.showStart(1.3);
  // Outside levels a world pick belongs to the track (saved, shared, exported).
  const picker = score > 0 ? undefined : worlds.picker(worlds.trackWorld(), (w) => track.setWorld(w));
  await ui.showSharedIntro(score, rateRun(track, runStats.stats).goals.map((g) => g.label), rides.keys(), rides.picker(), picker, friendGhost !== null);
  run.play();
}

/** The daily ride's entry on the title. */
function dailyCard() {
  const today = dayKey();
  const info = dailyInfo(today);
  const rec = loadDaily();
  return { number: info.number, name: info.name, best: rec.days[today]?.score ?? 0, stars: rec.days[today]?.stars ?? 0, streak: streakOn(today, rec) };
}

/** Plays a day's daily ride (today's, or an older one from a friend's link). */
async function enterDaily(day: string, score = 0, ghost: number[] | null = null) {
  const info = dailyInfo(day);
  const session0: Session = { kind: 'daily', day, challenge: score };
  enter(session0, null, ghost);
  const slow = setTimeout(() => ui.flash("Building today's track…", 4000), 200);
  const data = await dailyTrack(day);
  clearTimeout(slow);
  // The player may have left while it was being built.
  if (session !== session0) return;
  loadInto(() => track.load(data));
  worlds.change(info.world);
  pristine = true;
  editor.history.clear();
  run.stop();
  history.replaceState(null, '', location.pathname + location.search);
  moves.showStart(track, 1.3);
  const today = dayKey();
  const rec = loadDaily();
  const date = new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  await ui.showDailyIntro(
    { number: info.number, name: info.name, date: day === today ? `Today, ${date}` : date, challenge: score, best: rec.days[day]?.score ?? 0, streak: streakOn(today, rec), world: worldLabel(info.world), racing: friendGhost !== null },
    rateRun(track, runStats.stats).goals.map((g) => g.label),
    rides.keys(),
    rides.picker(),
  );
  run.play();
}

function pickPuzzle(): Promise<number | null> {
  const done = loadPuzzles();
  return ui.showPuzzles(
    PUZZLES.map((p) => ({
      name: p.name,
      tip: p.tip,
      stars: done[p.id]?.stars ?? 0,
      kind: puzzleKind(p),
      world: puzzleWorld(p),
      best: done[p.id] ? budgetText(p, done[p.id].ink, true) : '',
      par: budgetText(p, p.par, true),
    })),
    BIOMES.map((b) => ({ id: b.id, open: puzzleWorldOpen(b.id, done), gate: puzzleGate(b.id) })),
  );
}

async function startPuzzle(index: number) {
  const p = PUZZLES[index];
  enter({ kind: 'puzzle', index });
  const kind = puzzleKind(p);
  loadInto(() => {
    track.clear();
    p.build(track);
    // Erase puzzles keep their erasable lines; everything else the puzzle built is fixed.
    if (kind !== 'erase') for (const s of track.strokes.values()) s.locked = true;
  });
  puzzleBuilt = puzzleBase(track);
  const tools: Tool[] = kind === 'rings' ? ['item', 'eraser'] : kind === 'erase' ? ['eraser'] : ['pencil', 'line', 'eraser'];
  editor.setRules({ ink: p.ink, tools, types: p.types, kind, base: puzzleBuilt });
  ui.setPuzzle(true);
  worlds.change(normalizeWorld(p.world ?? { biome: 'alpine', time: 'day', weather: 'clear' }));
  pristine = true;
  editor.history.clear();
  run.stop();
  editor.resetPlane();
  moves.showSide(track, 1.3);
  await ui.showPuzzleIntro({
    number: index + 1,
    name: p.name,
    tip: p.tip,
    kind,
    budget: budgetText(p, p.ink),
    goals: [finishGoal(p), parGoal(p)],
    types: usesInk(p) ? p.types : [],
    stars: loadPuzzles()[p.id]?.stars ?? 0,
    starsTotal: track.stars.size,
  });
}

async function backToPuzzles() {
  run.stop();
  const idx = await pickPuzzle();
  if (idx === null) enterTitle();
  else startPuzzle(idx);
}

// ------------------------------------------------------------------ end of a run, achievements

let worldsSeen = loadCounters();

function puzzleCounts() {
  const all = Object.values(loadPuzzles());
  return { puzzlesSolved: all.filter((p) => p.stars > 0).length, puzzlesPerfect: all.filter((p) => p.stars >= 3).length };
}

/** Unlocks achievements for the current run state (mid-run or at the end). */
function checkAchievements(ended: boolean, rating = 0) {
  if (!playingGame() || run.replaying) return;
  const s = runStats.stats;
  const index = levelIndex();
  const levelDone = ended && s.finished && !s.crashed && index !== null;
  // Storage is only touched when something new happens.
  if (levelDone || !worldsSeen.rode.includes(env.config.biome)) worldsSeen = noteWorld(env.config.biome, levelDone);
  const ctx: RunContext = {
    stats: s,
    vehicle: rides.current.id,
    levelId: index !== null ? LEVELS[index].id : null,
    rating,
    tricks: run.tricks,
    ended,
    totalStars: totalStars(),
    wipeouts: run.wipeouts,
    beatChallenge: ended && challenge() > 0 && s.score >= challenge(),
    ownTrack: freeEdit(session) && !pristine,
    world: env.config,
    worldsRidden: worldsSeen.rode.length,
    worldsFinished: worldsSeen.finished.length,
    // Read at the end only (this runs every few frames mid-run).
    dailyStreak: ended ? streakOn(dayKey()) : 0,
    ...(ended ? puzzleCounts() : { puzzlesSolved: 0, puzzlesPerfect: 0 }),
    champion: ended ? champions() : {},
  };
  for (const a of evaluate(ctx)) {
    ui.toast(a.title, a.desc, a.ride);
    sound.success();
  }
}

/** Saves the result (stars, best, ghost) and shows the run summary. */
function showSummary(wasReplay: boolean) {
  if (session.kind === 'puzzle') return showPuzzleSummary(session.index);
  const s = runStats.stats;
  const index = levelIndex();
  const rating = rateRun(track, s);
  if (index !== null && !wasReplay) saveLevelResult(LEVELS[index].id, rating.stars, s.score);
  const levelInfo =
    index !== null ? { number: index + 1, name: LEVELS[index].name, hasNext: index + 1 < LEVELS.length, nextUnlocked: isUnlocked(index + 1) } : undefined;
  // Save this run as the ghost to beat if it's the best so far (a ghost is only inputs:
  // it can't replay comebacks at a checkpoint).
  let ghostSaved = false;
  if (!wasReplay && riderOn() && s.respawns === 0) {
    const key = ghostKey();
    if (beats(s.score, s.finishTime, loadGhost(key))) {
      saveGhost(key, { rle: encodeInputs(sim.inputsUpTo(run.frame)), frames: run.frame, score: s.score, finishTime: s.finishTime });
      ghostSaved = true;
    }
  }
  // Finish-time medals: clean finishes (no comebacks) on the level's home world.
  let medal: SummaryInfo['medal'];
  const times = index !== null ? medalTimes(LEVELS[index].id, rides.current.id) : null;
  if (index !== null && times && s.finished && !s.crashed && s.respawns === 0 && sameWorld(env.config, worlds.levelWorld(index))) {
    const r = wasReplay ? { best: bestTime(LEVELS[index].id, rides.current.id), newBest: false, medal: null, newMedal: false } : recordTime(LEVELS[index].id, rides.current.id, s.finishTime);
    // The medal this run earned, and the next one up.
    const won = medalFor(times, s.finishTime);
    const nextI = won ? MEDALS.indexOf(won) + 1 : 0;
    medal = {
      medal: won,
      newMedal: r.newMedal,
      time: s.finishTime,
      best: r.best,
      newBest: r.newBest,
      next: nextI < MEDALS.length ? { name: MEDAL_NAME[MEDALS[nextI]], time: times[nextI] } : null,
    };
  }
  let daily: { number: number; name: string; streak: number } | undefined;
  let best = wasReplay ? { best: recordBest(ghostKey(), 0, 0).best, newBest: false } : recordBest(ghostKey(), s.score, rating.stars);
  if (session.kind === 'daily') {
    const info = dailyInfo(session.day);
    const today = dayKey();
    const r = wasReplay ? { ...best, streak: streakOn(today) } : recordDaily(session.day, today, s.score, rating.stars);
    if (!wasReplay) best = { best: r.best, newBest: r.newBest };
    daily = { number: info.number, name: info.name, streak: r.streak };
  }
  if (rating.stars === 3) setTimeout(() => sound.perfect(), 700);
  if (!wasReplay) checkAchievements(true, rating.stars);
  ui.showSummary(
    { ...s },
    {
      ...best,
      riderMode: riderOn(),
      goals: rating.goals,
      rating: rating.stars,
      starsTotal: track.stars.size,
      ghostSaved,
      level: levelInfo,
      challenge: challenge(),
      daily,
      medal,
      vehicle: rides.current.name,
    },
    () => {
      run.reset();
      run.play();
    },
    () => stopRun(),
    () => run.watchReplay(),
    () => (session.kind === 'daily' ? enterTitle() : backToLevels()),
    () => {
      if (index !== null) startLevel(index + 1);
    },
  );
}

/** Puzzle result: a star for finishing, one for every star, one within par. */
function showPuzzleSummary(index: number) {
  const p = PUZZLES[index];
  const s = runStats.stats;
  const spent = puzzleSpent(p, track, puzzleBuilt);
  const clean = s.finished && !s.crashed;
  const goals = [
    { label: finishGoal(p), done: clean && trickDone(p, s) },
    { label: track.stars.size > 1 ? `Collect all ${track.stars.size} stars` : track.stars.size ? 'Collect the star' : 'Finish without a crash', done: clean && s.stars === track.stars.size },
    { label: parGoal(p), done: clean && spent <= p.par + 1e-6 },
  ];
  // No star without the finish (and the trick, in trick puzzles).
  const stars = goals[0].done ? goals.filter((g) => g.done).length : 0;
  if (goals[0].done) savePuzzle(p.id, stars, spent);
  if (stars === 3) setTimeout(() => sound.perfect(), 700);
  checkAchievements(true, stars);
  ui.showSummary(
    { ...s },
    {
      best: 0,
      newBest: false,
      riderMode: false,
      goals,
      rating: stars,
      starsTotal: track.stars.size,
      puzzle: { number: index + 1, name: p.name, used: budgetText(p, spent), par: budgetText(p, p.par), under: spent <= p.par + 1e-6, hasNext: index + 1 < PUZZLES.length },
    },
    () => {
      run.reset();
      run.play();
    },
    () => stopRun(),
    () => run.watchReplay(),
    () => backToPuzzles(),
    () => startPuzzle(index + 1),
  );
}

// ------------------------------------------------------------------ photo mode, settings, pause
let photoOn = false;

/** Freezes the moment, hides the UI and lets the player frame a shot (light and weather too). */
async function openPhoto() {
  if (!playingGame() || photoOn || run.summaryShown) return;
  photoOn = true;
  const wasPlaying = run.playing;
  run.pause();
  const prevMode = rig.mode;
  rig.mode = 'follow';
  controls.target.copy(riderCenter);
  document.body.classList.add('photo');
  // Dragging frames the shot: no drawing, the left button orbits.
  const editorWasOn = editor.enabled;
  editor.enabled = false;
  editor.release();
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  // The look can change for the shot; the world itself comes back after.
  const original = { ...env.config };
  const label = <T extends { id: string; name: string }>(list: T[], id: string) => ({ icon: id, name: list.find((x) => x.id === id)?.name ?? id });
  const cycle = (key: 'time' | 'weather') => {
    const options = key === 'time' ? TIMES.map((t) => t.id) : biomeById(env.config.biome).weathers;
    const next = options[(options.indexOf(env.config[key] as never) + 1) % options.length];
    worlds.preview({ ...env.config, [key]: next });
    return key === 'time' ? label(TIMES, env.config.time) : label(WEATHERS, env.config.weather);
  };
  let riderHidden = false;
  await ui.showPhotoMode({
    fov: camera.fov,
    onFov: (fov) => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    },
    onSnap: () => {
      // Render and grab the frame in the same task (the buffer isn't preserved).
      stage.postfx.flash = 0;
      stage.postfx.render(0);
      const name = `linerider3d-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
      const canvas = stage.renderer.domElement;
      const download = (blob: Blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      if (stage.isTouch && navigator.canShare) {
        // Phones: the share sheet (save to Photos, send to a chat). Built synchronously,
        // so the share still counts as part of the tap.
        const bytes = atob(canvas.toDataURL('image/png').split(',')[1]);
        const file = new File([Uint8Array.from(bytes, (c) => c.charCodeAt(0))], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Line Rider 3D' }).catch((err: Error) => {
            if (err.name !== 'AbortError') download(file);
          });
        } else download(file);
      } else {
        canvas.toBlob((blob) => blob && download(blob), 'image/png');
      }
      run.flash = 0.6;
      sound.click(true);
    },
    time: label(TIMES, env.config.time),
    weather: label(WEATHERS, env.config.weather),
    cycleTime: () => cycle('time'),
    cycleWeather: () => cycle('weather'),
    toggleRider: () => {
      riderHidden = !riderHidden;
      core.riderView.root.visible = !riderHidden;
      return riderHidden;
    },
  });
  core.riderView.root.visible = true;
  editor.enabled = editorWasOn;
  editor.rebind();
  if (!sameWorld(env.config, original)) worlds.preview(original);
  document.body.classList.remove('photo');
  rig.mode = prevMode;
  photoOn = false;
  if (wasPlaying) run.play();
}

async function openSettings() {
  const settings = core.settings;
  const view: SettingsView = { ...settings, qualityNote: quality.note };
  await ui.showSettings(
    view,
    (v) => {
      const qualityChanged = v.quality !== settings.quality;
      Object.assign(settings, {
        quality: v.quality as QualitySetting,
        sfxVolume: v.sfxVolume,
        musicVolume: v.musicVolume,
        camera: v.camera as CameraMode,
        cameraDistance: v.cameraDistance,
        reducedMotion: v.reducedMotion,
        seasonal: v.seasonal as SeasonPref,
      });
      saveSettings(settings);
      applySeason();
      if (qualityChanged && settings.quality === 'auto') quality.restartAuto();
      quality.apply();
    },
    () => resetProgress(),
  );
}

/** Esc while riding: a pause menu instead of throwing the run away. */
async function openPause() {
  run.pause();
  const index = levelIndex();
  const title =
    index !== null ? LEVELS[index].name : session.kind === 'puzzle' ? `Puzzle ${session.index + 1}` : session.kind === 'daily' ? `Daily ride #${dailyInfo(session.day).number}` : challenge() > 0 ? 'Challenge' : 'Your track';
  for (;;) {
    const choice = await ui.showPause(title, session.kind !== 'daily');
    if (choice === 'settings') {
      await openSettings();
      continue;
    }
    if (choice === 'resume') run.play();
    else if (choice === 'restart') {
      run.stop();
      run.play();
    } else if (choice === 'levels') {
      if (session.kind === 'puzzle') backToPuzzles();
      else backToLevels();
    }
    else {
      run.stop();
      enterTitle();
    }
    return;
  }
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
timer.connect(document);
let booted = false;

function loop(time: number) {
  timer.update(time);
  const rawDt = timer.getDelta();
  const dt = THREE.MathUtils.clamp(rawDt, 0, 0.1);
  const t = timer.getElapsed();

  run.update(dt);
  const rider = sim.rider;

  // Camera.
  if (session.kind === 'title') {
    // Loop the demo run behind the title.
    const s = runStats.stats;
    if (s.still > 1 || s.crashed || run.frame > 900) run.reset();
    // Tour the worlds only while the title menu itself is showing.
    worlds.tour(dt, !moves.devView && !moves.closeUp && !!document.querySelector('.title-screen') && !document.querySelector('.screen, .modal'));
    moves.attract(t, dt, riderCenter);
    rig.settle(dt);
  } else if (moves.flying) {
    moves.updateTween(dt);
    rig.settle(dt);
    controls.update();
  } else if (run.playing) {
    rig.update(dt, riderCenter, core.riderVel, STEPS_PER_SECOND, !rider.contact.some((c) => c) && !rider.crashed);
    if (rig.mode === 'follow') controls.update();
  } else {
    if (!photoOn) rig.settle(dt);
    controls.update();
  }
  rig.applyShake(dt);
  core.effects.update(dt);

  run.checkEnd(dt);
  run.updateFlash(dt);
  quality.govern(rawDt);

  const game = playingGame();
  editor.update(!run.playing && editing(session), dt);
  if (session.kind === 'puzzle' && editor.rules) {
    const p = PUZZLES[session.index];
    const left = editor.budgetLeft();
    ui.setInk(left, editor.rules.ink, p.par, budgetText(p, left, true));
  }
  core.trackView.update(t, riderCenter, rider);
  env.update(dt, controls.target, t, camera.position);
  worlds.updateHeadlight(game && core.riderView.root.visible);
  ui.setTime(run.frame, sim.recorded, STEPS_PER_SECOND);
  ui.setHud(game && (run.playing || run.frame > 0) && !run.summaryShown, runStats.stats, track.stars.size);
  ui.setGap(game && !run.summaryShown ? run.gap : null);
  ui.setTouchPad(stage.isTouch && riderOn() && game && run.playing && !run.replaying, rides.current.handling.yaw !== null);
  // Jump power while the key is held.
  if (game && riderOn() && !run.replaying && rider.hopCharge > 0 && !rider.crashed) {
    const p = jumpAt.copy(riderCenter).project(camera);
    ui.setJumpCharge(rider.hopCharge / HOP_FULL, ((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight);
  } else ui.setJumpCharge(null);
  stage.postfx.render(dt);

  if (!booted) {
    booted = true;
    document.getElementById('boot')?.classList.add('gone');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    // A share link opens its track directly; otherwise show the title.
    // Start building today's daily ride in the background.
    void dailyTrack(dayKey());
    readSharedLink()
      .then((shared) => (!shared ? enterTitle() : shared.kind === 'daily' ? enterDaily(shared.day, shared.challenge, shared.ghost) : enterShared(shared.data, shared.challenge, shared.vehicle, shared.ghost)))
      .catch((e) => {
        ui.flash(e instanceof TrackFormatError ? e.message : 'That share link looks broken', 4500);
        enterTitle();
      });
  }
}
/** Scratch: the rider's spot on screen for the jump meter. */
const jumpAt = new THREE.Vector3();
stage.renderer.setAnimationLoop(loop);

// ------------------------------------------------------------------ dev hooks
let devClock = performance.now();
if (import.meta.env.DEV) {
  const devWorld = (biome: string, time?: string, weather?: string) => worlds.apply({ biome, time, weather } as Partial<WorldConfig>);
  Object.assign(window, {
    lr3d: {
      ...core,
      session: () => session,
      run,
      shot: (biome: string, time = 'day', weather = 'clear', p?: number[], t?: number[]) => {
        document.body.classList.add('dev-shot');
        devWorld(biome, time, weather);
        if (p && t) moves.devView = [new THREE.Vector3(...p), new THREE.Vector3(...t)];
        return env.config;
      },
      view: (p?: number[], t?: number[]) => (moves.devView = p && t ? [new THREE.Vector3(...p), new THREE.Vector3(...t)] : null),
      world: devWorld,
      keys: (m: number) => (input.devKeys = m),
      /** Advance the game loop by hand (hidden tabs get no animation frames). */
      tick: (n = 1, ms = 1000 / 60) => {
        timer.disconnect();
        for (let k = 0; k < n; k++) loop((devClock += ms));
      },
      chooseVehicle: (id: string) => rides.choose(id),
      fx: () => ({ timeScale: run.timeScale, impact: run.impact, fov: camera.fov }),
      ghostInfo: () => ({ visible: core.ghostView.root.visible, frame: run.ghost?.sim.frame, butt: run.ghost?.sim.rider.pos[P.butt].toArray(), me: sim.rider.pos[P.butt].toArray() }),
    },
  });
}
