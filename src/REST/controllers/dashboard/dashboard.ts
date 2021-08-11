import { Router } from "express";
import { isNil } from "lodash";
import { renderFile } from "ejs";
import { userModule } from "../../../WebSocket/modules/user";
import { constitutionModule } from "../../../WebSocket/modules/constitution";

const password = process.env["DASHBOARD_PASSWORD"];
if (isNil(password)) {
	console.log("Unable to start server: dashboard password not found in ENV: DASHBOARD_PASSWORD");
	process.exit(-2);
}

const dashboardController = Router();

dashboardController.get("/", async (req, res) => {
	const passwordAttempt = req.query["pw"] ?? "";
	const data = {
		isAdmin: passwordAttempt === password,
		userMap: userModule.users,
		cstMap: constitutionModule.constitutions,
	};
	res.send(await renderFile(__dirname + "/template.ejs", data));
});

export { dashboardController };
