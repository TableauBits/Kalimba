import { Express } from "express";

import { testController } from "./controllers/test-controller";

export function createEndpoints(app: Express): Express {
	return app.use("/test", testController);
}
