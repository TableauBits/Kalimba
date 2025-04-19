import { Router } from "express";
import { isNil } from "lodash";
import { firestore } from "../../WebSocket/firebase";

export const REWIND_PATH = "rewind";
const RewindController = Router();

const FS_REWIND_ROOT_PATH = "rewind";
const FS_REWIND_PER_YEAR_COLLECTION = "per_year";

RewindController.get("/:uid/:year", async (req, res) => {
    const uid = req.params["uid"];
    const year = req.params["year"];
    console.log(`got request for ${uid}, ${year}`);
    if (isNil(uid)) {
        res.send("Invalid UserID");
        return;
    }
    if (isNil(year)) {
        res.send("Invalid year");
        return;
    }

    const rewindData = (
        await firestore.collection(`${FS_REWIND_ROOT_PATH}/${uid}/${FS_REWIND_PER_YEAR_COLLECTION}`)
            .doc(year)
            .get()
    ).data();

    res.send(JSON.stringify(rewindData));
});

export { RewindController };