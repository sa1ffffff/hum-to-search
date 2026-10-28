import createEngineModule from './generated/hts.mjs';
import type { NativeEngine } from './types';
import type { Song } from '../library/songs';

/** Instantiates the WebAssembly engine and indexes the library into its trie. */
export async function loadEngine(songs: readonly Song[]): Promise<NativeEngine> {
  const module = await createEngineModule();
  const engine = new module.Engine();
  for (const song of songs) {
    const id = engine.addSong(song.title, song.composer, song.notes.map((n) => n.midi));
    if (id !== song.index) throw new Error(`Song index mismatch for "${song.title}"`);
  }
  return engine;
}
