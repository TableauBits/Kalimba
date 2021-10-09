import { Constitution, Song } from "chelys";

export interface VoteData {
	songs: Map<number, Song>;
	constitution: Constitution;
}
