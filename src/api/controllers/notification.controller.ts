import type {Request, Response} from 'express';
import { safeValidateNotificationRequest, safeValidateBatchNotificationRequest } from '@src/types/schemas.js';
import {
  convert_notification_request_to_notification_schema,
  convert_batch_notification_schema_to_notification_schema,
  DuplicateNotificationError,
  InvalidProviderChannelError,
  InvalidContentSchemaError,
  ProviderNotFoundError,
  process_notifications,
  updateApiKeyNotificationUsage,
  formatZodErrorResponse,
} from '../utils/utils.js';
import { notification } from '@src/types/types.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export const notification_controller = async (req: Request, res: Response)=>{
    try{
        const data = req.body;
        const result = safeValidateNotificationRequest(data);
        if(result.success){
            const request_data = result.data;
            const apiKeyId = req.apiKey?.key_id;
            const notifications: notification[] = await convert_notification_request_to_notification_schema(request_data, apiKeyId);
            const response = await process_notifications(notifications);

            updateApiKeyNotificationUsage(req.apiKey, notifications, response?.created_count ?? 0);

            res.status(202).json({ message: 'Notifications are being processed', ...response});
        }
        else{
            const formatted = formatZodErrorResponse(result.error);
            res.status(400).json(formatted);
            return;
        }
    } catch(err) {
        if (err instanceof InvalidProviderChannelError) {
            res.status(400).json({
                message: err.message,
                invalidChannels: err.invalidChannels.length > 0 ? err.invalidChannels : undefined,
                invalidProviders: err.invalidProviders.length > 0 ? err.invalidProviders : undefined
            });
            return;
        }
        if(err instanceof InvalidContentSchemaError){
            const formatted = formatZodErrorResponse(err.issues);
            res.status(400).json({
                ...formatted,
                error: err.message,
                message: err.message,
            });
            return;
        }
        if(err instanceof ProviderNotFoundError){
            res.status(400).json({
                message: err.message
            });
            return;
        }
        if (err instanceof DuplicateNotificationError) {
            res.status(409).json({
                message: err.message,
                duplicateCount: err.duplicateCount,
                duplicates: err.duplicateKeys
            });
            return;
        }
        logger.error(`Error in notification controller`, err);
        res.status(500).json({
            message: "Internal Server Error"
        });
        return;
    }
}

export const batch_notification_controller = async (req: Request, res: Response)=>{
    try{
        const data = req.body;
        const result = safeValidateBatchNotificationRequest(data);
        if(result.success){
            const request_data = result.data;
            const apiKeyId = req.apiKey?.key_id;
            const notifications: notification[] = await convert_batch_notification_schema_to_notification_schema(request_data, apiKeyId);
            const response = await process_notifications(notifications);

            updateApiKeyNotificationUsage(req.apiKey, notifications, response?.created_count ?? 0);

            res.status(202).json({ message: 'Notifications are being processed', ...response});
        }
        else{
            const formatted = formatZodErrorResponse(result.error);
            res.status(400).json(formatted);
            return;
        }
    }
    catch(err) {
        if (err instanceof InvalidProviderChannelError) {
            res.status(400).json({
                message: err.message,
                invalidChannels: err.invalidChannels.length > 0 ? err.invalidChannels : undefined,
                invalidProviders: err.invalidProviders.length > 0 ? err.invalidProviders : undefined
            });
            return;
        }
        if(err instanceof InvalidContentSchemaError){
            const formatted = formatZodErrorResponse(err.issues);
            res.status(400).json({
                ...formatted,
                error: err.message,
                message: err.message,
            });
            return;
        }
        if(err instanceof ProviderNotFoundError){
            res.status(400).json({
                message: err.message
            });
            return;
        }
        if (err instanceof DuplicateNotificationError) {
            res.status(409).json({
                message: err.message,
                duplicateCount: err.duplicateCount,
                duplicates: err.duplicateKeys
            });
            return;
        }
        logger.error(`Error in batch notification controller`, err);
        res.status(500).json({
            message: "Internal Server Error"
        });
        return;
    }
}