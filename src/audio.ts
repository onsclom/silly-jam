import { audio } from "@spud.gg/api";

/*
  when you import binary assets using vite, you'll get a url string.
  read more at https://vite.dev/guide/assets#importing-asset-as-url
*/
import chomp1Url from "./assets/audio/chomp1.wav";
import chomp2Url from "./assets/audio/chomp2.wav";
import chomp3Url from "./assets/audio/chomp3.wav";
import chomp4Url from "./assets/audio/chomp4.wav";
import chomp5Url from "./assets/audio/chomp5.wav";
import chomp6Url from "./assets/audio/chomp6.wav";
import gasp1Url from "./assets/audio/gasp1.wav";
import gulp1Url from "./assets/audio/gulp1.wav";
import toilet1Url from "./assets/audio/toilet1.wav";
import hitWallUrl from "./assets/audio/hit-wall.wav";
import winUrl from "./assets/audio/win.mp3";

import menuMusicUrl from "./assets/audio/menu-music.mp3";

/*
  use createSounds for short, snappy SFX that you want pre-buffered
  for low-latency playback. we recommend creating your own effects
  using a tool like https://pro.sfxr.me/
*/
export const sfx = audio.createSounds({
  chomp1: { url: chomp1Url },
  chomp2: { url: chomp2Url },
  chomp3: { url: chomp3Url },
  chomp4: { url: chomp4Url },
  chomp5: { url: chomp5Url },
  chomp6: { url: chomp6Url },
  gasp: { url: gasp1Url },
  gulp: { url: gulp1Url },
  toilet: { url: toilet1Url },
  win: { url: winUrl },
  hitWall: { url: hitWallUrl },
});

let chompIndex = 0;
export function chompSound() {
  const chomps = [
    "chomp1",
    "chomp2",
    "chomp3",
    "chomp4",
    "chomp5",
    "chomp6",
  ] as const;
  const sound = chomps[chompIndex]!;
  sfx(sound).play();
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

/*
  in spud demo mode (spud.isDemoMode === true), audio methods are no-ops.
  that means you can always call sfx("...").play() or music.play() without
  adding conditional checks; the demo stays silent automatically.
*/
menuMusic.play();
