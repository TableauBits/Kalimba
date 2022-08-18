import { Express } from "express";

import { dashboardController } from "./controllers/dashboard/dashboard";
import { InvitesController, INVITES_PATH } from "./controllers/invites/invites";
import { KEEP_ALIVE_PATH, keepAliveController } from "./controllers/keep-alive/keep-alive";
import { USER_INFO_PATH, UserInfoController } from "./controllers/user-info/user-info";

export function createEndpoints(app: Express): Express {
	app.use("/dashboard", dashboardController);
	app.use(`/${KEEP_ALIVE_PATH}`, keepAliveController);
	app.use(`/${USER_INFO_PATH}`, UserInfoController);
	app.use(`/${INVITES_PATH}`, InvitesController);

	return app;
}
