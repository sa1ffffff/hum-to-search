import raw from '../../data/songs.json';
import { parseNotes, type LibraryNote } from './notation';

export interface Song {
  /** Index in the engine; equals the position in `SONGS`. */
  index: number;
  id: string;
  title: string;
  composer: string;
  year: number;
  tempo: number;
  notes: LibraryNote[];
}

interface RawSong {
  id: string;
  title: string;
  composer: string;
  year: number;
  tempo: number;
  notes: string;
}

export const SONGS: readonly Song[] = (raw.songs as RawSong[]).map((song, index) => ({
  index,
  id: song.id,
  title: song.title,
  composer: song.composer,
  year: song.year,
  tempo: song.tempo,
  notes: parseNotes(song.notes),
}));
