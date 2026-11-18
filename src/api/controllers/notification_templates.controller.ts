/*
Notification Templates controller

Enables management of notification templates for simpleNS

*/

import notification_template_model from "@src/database/models/notification-template.models.js";
import type { Request, Response } from "express";
import { apiLogger as logger } from "@src/workers/utils/logger.js";
import {
  safeValidateNotificationTemplateRequestSchema,
  safeValidateNotificationTemplateUpdateRequestSchema,
} from "@src/types/schemas.js";
import { PluginRegistry } from "@src/plugins/index.js";
import { MongoServerError } from "mongodb";
import mongoose from "mongoose";
import {
  pruneEmptyValues,
  formatZodErrorResponse,
  validateTemplateContent,
} from "@src/api/utils/utils.js";
import { normalizeTemplateContentVariables } from "@src/utils/template-renderer.utils.js";
import type { ValidationErrorDetail } from "@src/types/types.js";

const validatePackageAndContentSchema = (
  packageName: string,
  content: Record<string, unknown>,
):
  | { success: true }
  | {
      success: false;
      statusCode: number;
      message: string;
      error?: unknown;
      errors?: ValidationErrorDetail[];
    } => {
  const metadata = PluginRegistry.getPluginMetadata();
  let isavailable: boolean = false;
  let providerId: string | null = null;
  Object.keys(metadata.channels).forEach((channel) => {
    metadata.channels[channel].providers.forEach((provider) => {
      if (!isavailable && packageName === provider.name) {
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
  const sanitizedContent = (pruneEmptyValues(content) || {}) as Record<string, unknown>;
  const contentSchemaValidationRes = validateTemplateContent(
    sanitizedContent,
    providerContentSchema,
  );
  if (!contentSchemaValidationRes.success) {
    const formatted = formatZodErrorResponse(
      contentSchemaValidationRes.error,
      `Invalid content schema for the package: ${packageName}`
    );
    return {
      success: false,
      statusCode: 400,
      ...formatted,
    };
  }

  return { success: true };
};

/**
 * Controller for creating a notification template
 */
export const createTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const reqBody = req.body;
    const validationResult =
      safeValidateNotificationTemplateRequestSchema(reqBody);
    if (!validationResult.success) {
      const formatted = formatZodErrorResponse(validationResult.error);
      res.status(400).json(formatted);
      logger.error(`Error in creating template request validation: ${formatted.message}`);
      return;
    }
    const normalizedContent = normalizeTemplateContentVariables(
      validationResult.data.content,
    ) as Record<string, unknown>;
    const packageValidation = validatePackageAndContentSchema(
      validationResult.data.package,
      normalizedContent,
    );
    if (!packageValidation.success) {
      res.status(packageValidation.statusCode).json({
        error: packageValidation.error || packageValidation.message,
        message: packageValidation.message,
        errors: packageValidation.errors,
      });
      logger.error(packageValidation.message);
      return;
    }

    const rawTemplateId = validationResult.data.template_id?.trim();
    const template_id =
      rawTemplateId && rawTemplateId.length > 0
        ? rawTemplateId
        : new mongoose.Types.ObjectId().toString();

    const sanitizedContent = (pruneEmptyValues(normalizedContent) || {}) as Record<string, unknown>;

    await notification_template_model.insertOne({
      ...validationResult.data,
      template_id,
      content: sanitizedContent,
    });
    logger.success(`Successfully added template to db with template_id: ${template_id}`);
    res.status(201).json({
      message: "Template created successfully",
      template_id,
    });
    return;
  } catch (err: unknown) {
    if (
      err instanceof MongoServerError &&
      (err.code === "E11000" || err.code === 11000)
    ) {
      res.status(400).json({
        message: "Template-Id already exists",
      });
      logger.error("Template-Id already exists");
      return;
    }
    res.status(500).json({
      message: "Internal Server Error",
    });
    logger.error(`Internal Server Error: ${err}`);
    return;
  }
};

/**
 * Update template by template-id
 */

export const updateTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const template_id =
      typeof req.params.template_id === "string"
        ? req.params.template_id.trim()
        : "";
    if (!template_id) {
      res.status(400).json({
        message: "Template-Id required",
      });
      return;
    }

    const validationResult =
      safeValidateNotificationTemplateUpdateRequestSchema(req.body);
    if (!validationResult.success) {
      const formatted = formatZodErrorResponse(validationResult.error);
      res.status(400).json(formatted);
      logger.error(`Error in updating template request validation: ${formatted.message}`);
      return;
    }

    const existingTemplate = await notification_template_model.findOne({
      template_id,
    });
    if (!existingTemplate) {
      res.status(404).json({
        message: "No template found for the given id",
      });
      logger.info("No template found for the given id");
      return;
    }

    const normalizedContent = normalizeTemplateContentVariables(
      validationResult.data.content,
    ) as Record<string, unknown>;
    const packageValidation = validatePackageAndContentSchema(
      validationResult.data.package,
      normalizedContent,
    );
    if (!packageValidation.success) {
      res.status(packageValidation.statusCode).json({
        error: packageValidation.error || packageValidation.message,
        message: packageValidation.message,
        errors: packageValidation.errors,
      });
      logger.error(packageValidation.message);
      return;
    }

    const sanitizedContent = (pruneEmptyValues(normalizedContent) || {}) as Record<string, unknown>;

    await notification_template_model.updateOne(
      { template_id },
      {
        $set: {
          ...validationResult.data,
          content: sanitizedContent,
        },
      },
    );

    res.status(200).json({
      message: "Template updated successfully",
    });
    logger.success(`Template updated successfully: ${template_id}`);
    return;
  } catch (err: unknown) {
    if (
      err instanceof MongoServerError &&
      (err.code === "E11000" || err.code === 11000)
    ) {
      res.status(400).json({
        message: "Template-Id already exists",
      });
      logger.error("Template-Id already exists");
      return;
    }
    res.status(500).json({
      message: "Internal Server Error",
    });
    logger.error(`Internal Server Error: ${err}`);
    return;
  }
};

/**
 * Delete template by template-id
 */

export const deleteTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const template_id =
      typeof req.params.template_id === "string"
        ? req.params.template_id.trim()
        : "";
    if (!template_id) {
      res.status(400).json({
        message: "Template-Id required",
      });
      return;
    }

    const deletedTemplate = await notification_template_model.findOneAndDelete({
      template_id,
    });

    if (!deletedTemplate) {
      res.status(404).json({
        message: "No template found for the given id",
      });
      logger.info("No template found for the given id");
      return;
    }

    res.status(200).json({
      message: "Template deleted successfully",
    });
    logger.success(`Template deleted successfully: ${template_id}`);
    return;
  } catch (err: unknown) {
    res.status(500).json({
      message: "Internal Server Error",
    });
    logger.error(`Internal Server Error: ${err}`);
    return;
  }
};

/**
 * Get Templates by package
 */

export const getTemplates = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const package_name =
      typeof req.query.package_name === "string"
        ? req.query.package_name.trim()
        : "";

    const query: Record<string, string> = {};
    if (package_name) {
      query.package = package_name;
    }

    const templates = await notification_template_model.find(query);
    const response = templates.map((template) => ({
      name: template.name,
      description: template.description ?? "",
      template_id: template.template_id,
      package: template.package,
      created_at: (template as unknown as Record<string, unknown>).created_at,
    }));
    if (templates.length > 0) {
      logger.info(
        `Found ${templates.length} templates${package_name ? ` for the given package: ${package_name}` : ""}`,
      );
    } else {
      logger.info(
        `No templates found${package_name ? ` for the given package name ${package_name}` : ""}`,
      );
    }
    res.status(200).json(response);
    return;
  } catch (err: unknown) {
    res.status(500).json({
      message: `Internal Server Error`,
    });
    logger.error(`Internal Server Error: ${err}`);
    return;
  }
};

/**
 * Get template by template-id
 */

export const getTemplateById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const template_id =
      typeof req.params.template_id === "string"
        ? req.params.template_id.trim()
        : "";
    if (!template_id) {
      res.status(400).json({
        message: "Template-Id required",
      });
      return;
    }
    const template = await notification_template_model.findOne({
      template_id: template_id,
    });
    if (!template) {
      res.status(404).json({
        message: "No template found for the given id",
      });
      logger.info("No template found for the given id");
      return;
    } else {
      res.status(200).json({
        name: template.name,
        description: template.description ?? "",
        template_id: template.template_id,
        package: template.package,
        content: template.content,
      });
      return;
    }
  } catch (err: unknown) {
    res.status(500).json({
      message: `Internal Server Error`,
    });
    logger.error(`Internal Server Error: ${err}`);
  }
};
