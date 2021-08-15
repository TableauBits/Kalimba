import { Express } from "express";

import { dashboardController } from "./controllers/dashboard/dashboard";

export function createEndpoints(app: Express): Express {
	return app.use("/dashboard", dashboardController);
}
