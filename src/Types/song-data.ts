import { Constitution, Song } from "chelys";

export interface SongData {
	songs: Map<number, Song>;
	constitution: Constitution;
}
