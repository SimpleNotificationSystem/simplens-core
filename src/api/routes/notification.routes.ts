import { Router } from "express";
import { notification_controller } from "../controllers/notification.controllers.js";

const notification_router= Router();

notification_router.post("/", notification_controller);

export default notification_router;