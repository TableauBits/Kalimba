import { VoteData } from "../../../Types/vote-data";
import { SubModule } from "../../module";

export abstract class VoteModule extends SubModule<VoteData> {
    public abstract deleteSong(songID: number): void;
}
