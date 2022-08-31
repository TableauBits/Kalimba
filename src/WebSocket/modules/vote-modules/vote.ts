import { SongData } from "../../../Types/song-data";
import { SubModule } from "../../module";

export abstract class VoteModule extends SubModule<SongData> {
    public abstract deleteSong(songID: number): void;
}
