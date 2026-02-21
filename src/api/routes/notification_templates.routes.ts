import { createTemplate, getTemplateById, getTemplates } from "@src/api/controllers/notification_templates.controller.js";
import { Router } from "express";

const notification_templates_router = Router();

notification_templates_router.post('/create', createTemplate);

notification_templates_router.get('/', getTemplates);

notification_templates_router.get('/:template_id', getTemplateById);

export default notification_templates_router;
