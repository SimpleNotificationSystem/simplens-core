import type {Request, Response} from 'express';
import notification_model from '@src/database/models/notification.models.js';
import outbox_model from '@src/database/models/outbox.models.js';
import { safeValidateNotificationRequest } from '@src/types/schemas.js';
import { convert_notification_request_to_notification_schema, convert_notification_schema_to_outbox_schema } from '../utils/utils.js';
import { notification } from '@src/types/types.js';
import mongoose from 'mongoose';


export const notification_controller = async (req: Request, res: Response)=>{
    try{
        const data = req.body;
        const result = safeValidateNotificationRequest(data);
        if(result.success){
            const request_data = result.data;
            const notifications: notification[] = convert_notification_request_to_notification_schema(request_data);
            const session = await mongoose.startSession();
            try{
                await session.withTransaction(async()=>{
                    const created_notifications = await notification_model.create(notifications, {session, ordered: true});
                    const outboxes = created_notifications.map((created)=>{
                        return convert_notification_schema_to_outbox_schema(created as notification, created._id as mongoose.Types.ObjectId);
                    });
                    await outbox_model.create(outboxes, {session, ordered: true});
                });
                console.log("Successfully added notifactions to MongoDB");
                res.status(202).json({
                    message: "Notifications are being processed"
                });
            }catch(err){
                console.error("Transaction failed:", err);
            res.status(500).json({ message: "Failed to create notifications", errors: err });
            return;
            } finally {
            await session.endSession();
            }
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
    }catch(err){
        console.log(`Error in notification controller: ${err}`);
        res.status(500).json({
            message: "Internal Server Error",
            errors: err
        });
        return;
    }
}