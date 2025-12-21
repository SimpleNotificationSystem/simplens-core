import type {Request, Response} from 'express';
import { safeValidateNotificationRequest, safeValidateBatchNotificationRequest } from '@src/types/schemas.js';
import { convert_notification_request_to_notification_schema,  convert_batch_notification_schema_to_notification_schema, DuplicateNotificationError } from '../utils/utils.js';
import { notification } from '@src/types/types.js';
import { process_notifications } from '@src/api/utils/utils.js';
import { apiLogger as logger } from '@src/workers/utils/logger.js';

export const notification_controller = async (req: Request, res: Response)=>{
    try{
        const data = req.body;
        const result = safeValidateNotificationRequest(data);
        if(result.success){
            const request_data = result.data;
            const notifications: notification[] = convert_notification_request_to_notification_schema(request_data);
            const response = await process_notifications(notifications);
            res.status(202).json({ message: 'Notifications are being processed', ...response });
        }
        else{
            const validationErrors = result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
            res.status(400).json({
                message: validationErrors.map(e => e.message).join('\n'),
                errors: validationErrors,
            });
            return;
        }
    } catch(err) {
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
            const notifications: notification[] = convert_batch_notification_schema_to_notification_schema(request_data);
            await process_notifications(notifications);
            res.status(202).json({ message: 'Notifications are being processed' });
        }
        else{
            res.status(400).json({
                message: result.error.issues.reduce((accumulator, currmsg)=>{
                    return accumulator + "\n" + currmsg.message;
                },""),
                errors: result.error.issues
            });
            return;
        }
    }
    catch(err) {
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