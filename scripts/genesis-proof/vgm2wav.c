/*
 * vgm2wav: play a .vgm file through Game_Music_Emu's Sega Genesis (YM2612) emulation and write a WAV.
 * An independent check that Fright Score's Genesis export is real chip music: this code knows nothing
 * about Fright Score, it only replays the YM2612 register writes in the file.
 *
 * Build: cc -O2 vgm2wav.c $(pkg-config --cflags --libs libgme) -o vgm2wav  (or see make-proof.sh)
 * Usage: vgm2wav in.vgm out.wav <start seconds> <length seconds>
 */
#include <gme/gme.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

static void put32(FILE *f, uint32_t v) { fwrite(&v, 4, 1, f); }
static void put16(FILE *f, uint16_t v) { fwrite(&v, 2, 1, f); }

int main(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: vgm2wav in.vgm out.wav <start seconds> <length seconds>\n");
    return 2;
  }
  const int rate = 44100;
  Music_Emu *emu;
  gme_err_t err = gme_open_file(argv[1], &emu, rate);
  if (err) { fprintf(stderr, "%s\n", err); return 1; }

  gme_info_t *info;
  gme_track_info(emu, &info, 0);
  fprintf(stderr, "system: %s, title: %s, length: %d ms\n", info->system, info->song, info->length);
  gme_free_info(info);

  /* Keep leading silence: without this, the emulator skips it and every timestamp shifts earlier. */
  gme_ignore_silence(emu, 1);
  if ((err = gme_start_track(emu, 0))) { fprintf(stderr, "%s\n", err); return 1; }
  double start = atof(argv[3]), length = atof(argv[4]);
  if (start > 0) gme_seek(emu, (long)(start * 1000));

  long count = (long)(length * rate) * 2; /* interleaved stereo samples */
  short *buf = malloc(count * sizeof(short));
  if ((err = gme_play(emu, count, buf))) { fprintf(stderr, "%s\n", err); return 1; }

  FILE *out = fopen(argv[2], "wb");
  if (!out) { perror(argv[2]); return 1; }
  fwrite("RIFF", 1, 4, out); put32(out, 36 + count * 2);
  fwrite("WAVEfmt ", 1, 8, out); put32(out, 16); put16(out, 1); put16(out, 2);
  put32(out, rate); put32(out, rate * 4); put16(out, 4); put16(out, 16);
  fwrite("data", 1, 4, out); put32(out, count * 2); fwrite(buf, 2, count, out);
  fclose(out);
  free(buf);
  gme_delete(emu);
  return 0;
}
