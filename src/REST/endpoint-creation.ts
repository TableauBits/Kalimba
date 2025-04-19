import { Express } from "express";

import { dashboardController } from "./controllers/dashboard/dashboard";
import { DumpDBController, DUMP_DB_PATH } from "./controllers/dump-db";
import { InvitesController, INVITES_PATH } from "./controllers/invites/invites";
import { USER_INFO_PATH, UserInfoController } from "./controllers/user-info/user-info";
import { REWIND_PATH, RewindController } from "./controllers/rewind";

export function createEndpoints(app: Express): Express {
	app.use("/dashboard", dashboardController);
	app.use(`/${USER_INFO_PATH}`, UserInfoController);
	app.use(`/${INVITES_PATH}`, InvitesController);
	app.use(`/${DUMP_DB_PATH}`, DumpDBController);
	app.use(`/${REWIND_PATH}`, RewindController);

	return app;
}
