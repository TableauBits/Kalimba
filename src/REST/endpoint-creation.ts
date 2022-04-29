import { Express } from "express";

import { dashboardController } from "./controllers/dashboard/dashboard";
import { KEEP_ALIVE_PATH, keepAliveController } from "./controllers/keep-alive/keep-alive";

export function createEndpoints(app: Express): Express {
	app.use("/dashboard", dashboardController);
	app.use(`/${KEEP_ALIVE_PATH}`, keepAliveController);

	return app;
}
