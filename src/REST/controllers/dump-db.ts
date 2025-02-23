import { Router } from "express";
import { firestore } from "../../WebSocket/firebase";

export const DUMP_DB_PATH = "dump-db";

const DumpDBController = Router();

DumpDBController.get("/", async (req, res) => {
	const password = process.env["DASHBOARD_PASSWORD"];
	const passwordAttempt = req.query["pw"] ?? "";

	let json = "Wrong password !";
	if (passwordAttempt === password) {
		const data = await Promise.all((await firestore.collection("matday").get()).docs.map(async (doc) => {
			const base_fields = doc.data();

			const songs: any = {};
			(await firestore.collection("matday").doc(doc.id).collection("songs").get()).docs.forEach((song) => songs[song.id] = song.data());

			const votes: any = {};
			(await firestore.collection("matday").doc(doc.id).collection("votes").get()).docs.forEach((vote) => votes[vote.id] = vote.data());

			const favs: any = {};
			(await firestore.collection("matday").doc(doc.id).collection("favs").get()).docs.forEach((fav) => favs[fav.id] = fav.data());

			return {
				...base_fields,
				songs,
				votes,
				favs
			};
		}));

		json = JSON.stringify(data);
	}

	res.send(json);
});

export { DumpDBController };
