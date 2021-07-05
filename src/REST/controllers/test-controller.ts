import { Router } from "express";

export const testController = Router();

testController.get("/base", (_, res) => {
	res.send("successful test controller");
});
