/*
Notification Templates controller

Enables management of notification templates for simpleNS

*/

import notification_template_model from "@src/database/models/notification-template.models.js";
import type {Request, Response} from 'express';
import {apiLogger as logger } from '@src/workers/utils/logger.js';
import { safeValidateNotificationTemplateRequestSchema } from "@src/types/schemas.js";
import { PluginRegistry } from "@src/plugins/index.js";
import { MongoServerError } from 'mongodb';

/** 
 * Controller for creating a notification template
*/
export const createTemplate = async (req: Request, res: Response): Promise<void> =>{
    try{
        const reqBody = req.body;
        const validationResult = safeValidateNotificationTemplateRequestSchema(reqBody);
        if(!validationResult.success){
            const validationErrors = validationResult.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
            const errmsg = validationErrors.map(e => e.message).join('\n')
            res.status(400).json({
                message: errmsg,
                errors: validationErrors,
            });
            logger.error(`Error in creating template request validation :${errmsg}`);
            return;
        }
        // here we check whether the plugin package exists in the instance
        const metadata = PluginRegistry.getPluginMetadata();
        let isavailable: boolean = false;
        let providerId: string | null = null;
        Object.keys(metadata.channels).forEach(channel=>{
            metadata.channels[channel].providers.forEach(provider=>{
                if(!isavailable && validationResult.data.package === provider.name){
                    isavailable = true;
                    providerId = provider.id;
                }
            });
        });
        // after the package exists in the instance we check whether the contentschema matches the provider's content schema
        if(isavailable && providerId){
            const provider = PluginRegistry.get(providerId);
            const providerContentSchema = provider!.getContentSchema();
            const contentSchemaValidationRes = providerContentSchema.safeParse(validationResult.data.content);
            if(!contentSchemaValidationRes.success){
                    res.status(400).json({
                    message: `Invalid content schema for the package: ${validationResult.data.package}`,
                    error: contentSchemaValidationRes.error
                });
                logger.error(`Invalid content schema for the package: ${validationResult.data.package}`);
                return;
            }
            await notification_template_model.insertOne(validationResult.data);
            logger.success('Successfully added template to db');
            res.status(201).json({
                message: "Template created successfully"
            });
            return;
        }
        else{
            res.status(400).json({
                message: `The package ${validationResult.data.package} does not exists in your simpleNS instance.`
            });
            logger.error(`The package ${validationResult.data.package} does not exists in your simpleNS instance.`);
            return;
        }
    }catch(err: any){
        if (err instanceof MongoServerError && (err.code === "E11000" || err.code === 11000)){
            res.status(400).json({
                message: "Template-Id already exists"
            });
            logger.error("Template-Id already exists");
            return;
        }
        res.status(500).json({
            message: 'Internal Server Error'
        });
        logger.error(`Internal Server Error: ${err}`);
        return;
    }
}

/**
 * Get Templates by package
 */

export const getTemplates = async (req: Request, res: Response) : Promise<void> =>{
    try{
        const package_name =
            typeof req.query.package_name === "string"
                ? req.query.package_name.trim()
                : "";
        if(!package_name){
            res.status(400).json({
                message: "Package name required"
            });
            return;
        };
        const templates = await notification_template_model.find({
            package: package_name
        });
        const response = templates.map(template => ({
            name: template.name,
            description: template.description ?? "",
            template_id: template.template_id
        }));
        if(templates.length > 0){
            logger.info(`Found ${templates.length} templates for the given package: ${package_name}`);
        }
        else{
            logger.info(`No templates found for the given package name ${package_name}`);
        }
        res.status(200).json(response);
        return;
    }catch(err: any){
        res.status(500).json({
            message: `Internal Server Error`
        });
        logger.error(`Internal Server Error: ${err}`);
        return;
    }
}

/**
 * Get template by template-id
 */

export const getTemplateById = async (req: Request, res: Response): Promise<void> =>{
    try{
        const template_id =
            typeof req.params.template_id === "string"
                ? req.params.template_id.trim()
                : "";
        if(!template_id){
            res.status(400).json({
                message: "Template-Id required"
            });
            return;
        };
        const template = await notification_template_model.findOne({
            template_id: template_id
        });
        if(!template){
            res.status(404).json({
                message: "No template found for the given id"
            });
            logger.info("No template found for the given id")
            return;
        }else{
            res.status(200).json({
                name: template.name,
                description: template.description ?? "",
                template_id: template.template_id,
                package: template.package,
                content: template.content,
            });
            return;
        }
    }catch(err: any){
        res.status(500).json({
            message: `Internal Server Error`
        });
        logger.error(`Internal Server Error: ${err}`);
    }
}

