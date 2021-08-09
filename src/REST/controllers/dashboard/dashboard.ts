import { Router } from "express";
import { isNil } from "lodash";
import { renderFile } from "ejs";

const password = process.env["DASHBOARD_PASSWORD"];
if (isNil(password)) {
	console.log("Unable to start server: dashboard password not found in ENV: DASHBOARD_PASSWORD");
	process.exit(-2);
}

const dashboardController = Router();

dashboardController.get("/", async (req, res) => {
	const passwordAttempt = req.query["password"] ?? "";
	const data = {
		isAdmin: passwordAttempt === password,
	};
	res.send(await renderFile(__dirname + "/template.ejs", data));
});

export { dashboardController };
