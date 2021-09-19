import { Router } from "express";
import { isNil } from "lodash";
import { renderFile } from "ejs";
import { userModule } from "../../../WebSocket/modules/user";
import { constitutionModule } from "../../../WebSocket/modules/constitution-manager";
import { clients } from "../../../WebSocket/event-handler";
import { telemetry } from "../../../WebSocket/modules/telemetry";

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
		clients: clients,
		telemetry: telemetry,
	};
	res.send(await renderFile(__dirname + "/template.ejs", data));
});

export { dashboardController };
