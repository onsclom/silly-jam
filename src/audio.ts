import { audio } from "@spud.gg/api";
import { Entity } from "./state";

import chomp1Url from "./assets/audio/chomp1.wav";
import chomp3Url from "./assets/audio/chomp3.wav";
import chomp4Url from "./assets/audio/chomp4.wav";
import chomp5Url from "./assets/audio/chomp5.wav";
import chomp6Url from "./assets/audio/chomp6.wav";
import gasp1Url from "./assets/audio/gasp1.wav";
import gulp1Url from "./assets/audio/gulp1.wav";
import toilet1Url from "./assets/audio/toilet1.wav";
import hitWallUrl from "./assets/audio/hit-wall.wav";
import grunt1Url from "./assets/audio/grunt1.wav";
import grunt2Url from "./assets/audio/grunt2.wav";
import grunt3Url from "./assets/audio/grunt3.wav";
import grunt4Url from "./assets/audio/grunt4.wav";
import grunt5Url from "./assets/audio/grunt5.wav";
import grunt6Url from "./assets/audio/grunt6.wav";
import grunt7Url from "./assets/audio/grunt7.wav";
import grunt8Url from "./assets/audio/grunt8.wav";
import crunch from "./assets/audio/crunch.wav";
import crunchGlass from "./assets/audio/crunch-break.wav";
import glassShatter1 from "./assets/audio/glass-shatter-1.wav";
import glassShatter2 from "./assets/audio/glass-shatter-2.wav";
import trumpet1 from "./assets/audio/trumpet1.mp3";
import trumpet2 from "./assets/audio/trumpet2.mp3";
import trumpet3 from "./assets/audio/trumpet3.mp3";

import menuMusicUrl from "./assets/audio/menu-music.mp3";

/*
  use createSounds for short, snappy SFX that you want pre-buffered
  for low-latency playback. we recommend creating your own effects
  using a tool like https://pro.sfxr.me/
*/
export const sfx = audio.createSounds({
  chomp1: { url: chomp1Url },
  chomp3: { url: chomp3Url },
  chomp4: { url: chomp4Url },
  chomp5: { url: chomp5Url },
  chomp6: { url: chomp6Url },
  gasp: { url: gasp1Url },
  gulp: { url: gulp1Url },
  toilet: { url: toilet1Url },
  trumpet1: { url: trumpet1 },
  trumpet2: { url: trumpet2 },
  trumpet3: { url: trumpet3 },
  hitWall: { url: hitWallUrl },
  grunt1: { url: grunt1Url },
  grunt2: { url: grunt2Url },
  grunt3: { url: grunt3Url },
  grunt4: { url: grunt4Url },
  grunt5: { url: grunt5Url },
  grunt6: { url: grunt6Url },
  grunt7: { url: grunt7Url },
  grunt8: { url: grunt8Url },
  crunch: { url: crunch },
  crunchGlass: { url: crunchGlass },
  glassShatter1: { url: glassShatter1 },
  glassShatter2: { url: glassShatter2 },
});

let winSoundIndex = 0;
export function winSound() {
  const sounds = ["trumpet1", "trumpet2", "trumpet3"] as const;
  const sound = sounds[winSoundIndex]!;
  winSoundIndex = (winSoundIndex + 1) % sounds.length;
  sfx(sound).play();
}

export function glassHitSound() {
  sfx("crunch").play({ detune: -300, volume: 0.1 });
  sfx("crunchGlass").play({ volume: 0.5 });
  sfx("hitWall").play({ volume: 0.2 });
}

export function glassShatterSound() {
  const shatters = ["glassShatter1", "glassShatter2"] as const;
  const sound = shatters[Math.floor(Math.random() * shatters.length)]!;
  sfx("crunch").play({ volume: 0.1 });
  sfx("crunchGlass").play({ volume: 0.3 });
  sfx(sound).play({ volume: 0.2 });
}

let chompIndex = 0;
export function chompSound(player: Entity) {
  const chomps = ["chomp1", "chomp3", "chomp4", "chomp5", "chomp6"] as const;
  const sound = chomps[chompIndex]!;
  sfx(sound).play({
    detune: 900 - player.w * 450,
  });
  chompIndex = (chompIndex + 1) % chomps.length;
}

/*
  createMusic is for longer tracks that can
  stream and don't need frame-perfect timing.
*/
export const menuMusic = audio.createMusic({
  url: menuMusicUrl,
  loop: true,
  volume: 0,
});

// idea if we want the player to make a sound when they kick off of a wall
// or maybe instead of grunt we use a softer hitWall sound.
// export function movementSound(player: Entity) {
//   // todo: speed (+ pitch) up when entity is small. slower/lower when large.
//   const grunts = ["grunt6", "grunt7", "grunt8"] as const;
//   const sound = grunts[Math.floor(Math.random() * grunts.length)]!;
//   sfx(sound).play({
//     volume: 0.3,
//   });
// }

export function hitWallSound(player: Entity) {
  // const sizeScale = player.w ** 1.5;
  // todo: speed (+ pitch) up when entity is small. slower/lower when large.
  const grunts = ["grunt1", "grunt2", "grunt3", "grunt4", "grunt5"] as const;
  const sound = grunts[Math.floor(Math.random() * grunts.length)]!;
  sfx(sound).play({
    detune: 1500 - player.w * 750,
  });
  sfx("hitWall").play({
    // volume: Math.min(2, sizeScale), // todo: find a good range for this.
    detune: Math.random() * 300 - 150,
    volume: 0.3,
    playbackRate: 1 / player.w ** 0.5,
  });
}

export function tutorialKeySound() {
  const grunts = [
    "grunt1",
    "grunt2",
    "grunt3",
    "grunt4",
    "grunt5",
    "grunt6",
    "grunt7",
    "grunt8",
  ] as const;
  const sound = grunts[Math.floor(Math.random() * grunts.length)]!;
  sfx(sound).play({
    volume: 0.25,
  });
  sfx("hitWall").play({
    detune: Math.random() * 300 - 150,
    volume: 0.3,
  });
}

/*
  in spud demo mode (spud.isDemoMode === true), audio methods are no-ops.
  that means you can always call sfx("...").play() or music.play() without
  adding conditional checks; the demo stays silent automatically.
*/
menuMusic.play();
