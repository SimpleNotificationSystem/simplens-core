/**
 * Centralized payload validation for outbox entries
 * 
 * Channel-agnostic - uses base notification schema for all payloads.
 */

import mongoose from "mongoose";
import { type outbox, type delayed_notification_topic } from "@src/types/types.js";
import {
    safeValidateOutbox,
    safeValidateBaseNotification,
    safeValidateDelayedNotificationTopic
} from "@src/types/schemas.js";
import type { HydratedDocument } from "mongoose";
import { producerLogger as logger } from "./logger.js";

// Type for outbox document from MongoDB
export type OutboxDocument = HydratedDocument<outbox>;

// Generic payload type
export type ValidPayload = Record<string, unknown>;

// Validated outbox entry
export interface ValidatedOutboxEntry {
    _id: mongoose.Types.ObjectId;
    notification_id: mongoose.Types.ObjectId | string;
    topic: string;
    payload: ValidPayload;
    status: string;
}

/**
 * Validate an outbox entry and its payload
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

    // Validate payload based on topic
    if (topic === 'delayed_notification') {
        const delayedResult = safeValidateDelayedNotificationTopic(payload);
        if (!delayedResult.success) {
            logger.error(`Invalid delayed_notification payload for outbox ${plainEntry._id}:`, delayedResult.error.issues);
            return null;
        }
        return {
            _id: plainEntry._id as mongoose.Types.ObjectId,
            notification_id,
            topic,
            payload: delayedResult.data as ValidPayload,
            status
        };
    }

    // For channel notifications, validate with base schema
    const notificationResult = safeValidateBaseNotification(payload);
    if (!notificationResult.success) {
        logger.error(`Invalid notification payload for outbox ${plainEntry._id}:`, notificationResult.error.issues);
        return null;
    }

    return {
        _id: plainEntry._id as mongoose.Types.ObjectId,
        notification_id,
        topic,
        payload: notificationResult.data as ValidPayload,
        status
    };
};

/**
 * Validate and group outbox entries by topic
 */
export const validateAndGroupByTopic = (entries: OutboxDocument[]): {
    groupedByTopic: Map<string, ValidatedOutboxEntry[]>;
    validationFailedCount: number;
} => {
    const groupedByTopic = new Map<string, ValidatedOutboxEntry[]>();
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
