import { Router } from "express";
import { batch_notification_controller, notification_controller } from "../controllers/notification.controllers.js";

const notification_router= Router();

notification_router.post("/", notification_controller);

notification_router.post("/batch", batch_notification_controller);

notification_router.get("/", (req, res)=>{
    res.json({
        info: "Notification endpoint is working"
    });
    return;
});

export default notification_router;