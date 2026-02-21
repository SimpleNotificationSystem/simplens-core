/*
Notification Templates controller

Enables management of notification templates for simpleNS

*/

import notification_template_model from "@src/database/models/notification-template.models.js";
import type {Request, Response} from 'express';
import {apiLogger as logger } from '@src/workers/utils/logger.js';
import { safeValidateNotificationTemplateRequestSchema, safeValidateNotificationTemplateUpdateRequestSchema } from "@src/types/schemas.js";
import { PluginRegistry } from "@src/plugins/index.js";
import { MongoServerError } from 'mongodb';

const normalizeTemplateVariablesInString = (value: string): string => {
    const normalizedDollarBraces = value.replace(/\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g, '{{$1}}');
    return normalizedDollarBraces.replace(/(?<!\{)\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}(?!\})/g, '{{$1}}');
};

const normalizeTemplateContentVariables = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return normalizeTemplateVariablesInString(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeTemplateContentVariables(item));
    }

    if (value && typeof value === 'object') {
        const normalizedObject: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
            normalizedObject[key] = normalizeTemplateContentVariables(nestedValue);
        });
        return normalizedObject;
    }

    return value;
};

const validatePackageAndContentSchema = (
    packageName: string,
    content: Record<string, unknown>,
): { success: true } | { success: false; statusCode: number; message: string; error?: unknown } => {
    const metadata = PluginRegistry.getPluginMetadata();
    let isavailable: boolean = false;
    let providerId: string | null = null;
    Object.keys(metadata.channels).forEach(channel=>{
        metadata.channels[channel].providers.forEach(provider=>{
            if(!isavailable && packageName === provider.name){
                isavailable = true;
                providerId = provider.id;
            }
        });
    });

    if (!isavailable || !providerId) {
        return {
            success: false,
            statusCode: 400,
            message: `The package ${packageName} does not exists in your simpleNS instance.`,
        };
    }

    const provider = PluginRegistry.get(providerId);
    const providerContentSchema = provider!.getContentSchema();
    const contentSchemaValidationRes = providerContentSchema.safeParse(content);
    if(!contentSchemaValidationRes.success){
        return {
            success: false,
            statusCode: 400,
            message: `Invalid content schema for the package: ${packageName}`,
            error: contentSchemaValidationRes.error,
        };
    }

    return { success: true };
};

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
        const normalizedContent = normalizeTemplateContentVariables(validationResult.data.content) as Record<string, unknown>;
        const packageValidation = validatePackageAndContentSchema(validationResult.data.package, normalizedContent);
        if(!packageValidation.success){
            res.status(packageValidation.statusCode).json({
                message: packageValidation.message,
                error: packageValidation.error,
            });
            logger.error(packageValidation.message);
            return;
        }

        await notification_template_model.insertOne({
            ...validationResult.data,
            content: normalizedContent,
        });
        logger.success('Successfully added template to db');
        res.status(201).json({
            message: "Template created successfully"
        });
        return;
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
 * Update template by template-id
 */

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
        const template_id =
            typeof req.params.template_id === "string"
                ? req.params.template_id.trim()
                : "";
        if(!template_id){
            res.status(400).json({
                message: "Template-Id required"
            });
            return;
        }

        const validationResult = safeValidateNotificationTemplateUpdateRequestSchema(req.body);
        if(!validationResult.success){
            const validationErrors = validationResult.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
            const errmsg = validationErrors.map(e => e.message).join('\n');
            res.status(400).json({
                message: errmsg,
                errors: validationErrors,
            });
            logger.error(`Error in updating template request validation :${errmsg}`);
            return;
        }

        const existingTemplate = await notification_template_model.findOne({ template_id });
        if (!existingTemplate) {
            res.status(404).json({
                message: "No template found for the given id"
            });
            logger.info("No template found for the given id");
            return;
        }

        const normalizedContent = normalizeTemplateContentVariables(validationResult.data.content) as Record<string, unknown>;
        const packageValidation = validatePackageAndContentSchema(validationResult.data.package, normalizedContent);
        if(!packageValidation.success){
            res.status(packageValidation.statusCode).json({
                message: packageValidation.message,
                error: packageValidation.error,
            });
            logger.error(packageValidation.message);
            return;
        }

        await notification_template_model.updateOne(
            { template_id },
            {
                $set: {
                    ...validationResult.data,
                    content: normalizedContent,
                }
            }
        );

        res.status(200).json({
            message: "Template updated successfully"
        });
        logger.success(`Template updated successfully: ${template_id}`);
        return;
    } catch (err: any) {
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
 * Delete template by template-id
 */

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
        const template_id =
            typeof req.params.template_id === "string"
                ? req.params.template_id.trim()
                : "";
        if(!template_id){
            res.status(400).json({
                message: "Template-Id required"
            });
            return;
        }

        const deletedTemplate = await notification_template_model.findOneAndDelete({
            template_id
        });

        if(!deletedTemplate){
            res.status(404).json({
                message: "No template found for the given id"
            });
            logger.info("No template found for the given id")
            return;
        }

        res.status(200).json({
            message: "Template deleted successfully"
        });
        logger.success(`Template deleted successfully: ${template_id}`);
        return;
    } catch(err: any) {
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

