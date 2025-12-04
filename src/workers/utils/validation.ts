/**
 * Centralized payload validation for outbox entries
 */

import mongoose from "mongoose";
import { 
    OUTBOX_TOPICS,
    type outbox,
    type email_notification,
    type whatsapp_notification,
    type delayed_notification_topic
} from "@src/types/types.js";
import { 
    safeValidateOutbox,
    safeValidateEmailNotification,
    safeValidateWhatsappNotification,
    safeValidateDelayedNotificationTopic
} from "@src/types/schemas.js";
import type { HydratedDocument } from "mongoose";
import { producerLogger as logger } from "./logger.js";

// Type for outbox document from MongoDB
export type OutboxDocument = HydratedDocument<outbox>;

// Union type for all valid payloads
export type ValidPayload = email_notification | whatsapp_notification | delayed_notification_topic;

// Validated outbox entry with typed payload
export interface ValidatedOutboxEntry {
    _id: mongoose.Types.ObjectId;
    notification_id: mongoose.Types.ObjectId;
    topic: OUTBOX_TOPICS;
    payload: ValidPayload;
    status: string;
}

// Payload validators mapped by topic
const PAYLOAD_VALIDATORS: Record<OUTBOX_TOPICS, (payload: unknown) => { success: true; data: ValidPayload } | { success: false; error: { issues: unknown[] } }> = {
    [OUTBOX_TOPICS.email_notification]: safeValidateEmailNotification,
    [OUTBOX_TOPICS.whatsapp_notification]: safeValidateWhatsappNotification,
    [OUTBOX_TOPICS.delayed_notification]: safeValidateDelayedNotificationTopic,
};

/**
 * Validate an outbox entry and its payload based on topic
 * @returns ValidatedOutboxEntry if valid, null if validation fails
 */
export const validateOutboxEntry = (entry: OutboxDocument): ValidatedOutboxEntry | null => {
    const plainEntry = entry.toObject();
    
    // Validate the outbox schema
    const outboxResult = safeValidateOutbox(plainEntry);
    if (!outboxResult.success) {
        logger.error(`Invalid outbox entry ${plainEntry._id}:`, outboxResult.error.issues);
        return null;
    }

    const { topic, payload, notification_id, status } = outboxResult.data;

    // Get the appropriate validator for this topic
    const validator = PAYLOAD_VALIDATORS[topic];
    if (!validator) {
        logger.error(`Unknown topic: ${topic}`);
        return null;
    }

    // Validate the payload
    const payloadResult = validator(payload);
    if (!payloadResult.success) {
        logger.error(`Invalid ${topic} payload for outbox ${plainEntry._id}:`, payloadResult.error.issues);
        return null;
    }

    return {
        _id: plainEntry._id as mongoose.Types.ObjectId,
        notification_id,
        topic,
        payload: payloadResult.data,
        status
    };
};

/**
 * Validate and group outbox entries by topic
 * @returns Map of topic to validated entries, plus count of validation failures
 */
export const validateAndGroupByTopic = (entries: OutboxDocument[]): {
    groupedByTopic: Map<OUTBOX_TOPICS, ValidatedOutboxEntry[]>;
    validationFailedCount: number;
} => {
    const groupedByTopic = new Map<OUTBOX_TOPICS, ValidatedOutboxEntry[]>();
    let validationFailedCount = 0;

    for (const entry of entries) {
        const validated = validateOutboxEntry(entry);
        if (!validated) {
            validationFailedCount++;
            continue;
        }

        const existing = groupedByTopic.get(validated.topic) ?? [];
        existing.push(validated);
        groupedByTopic.set(validated.topic, existing);
    }

    return { groupedByTopic, validationFailedCount };
};
