/**
 * Alerts API - Returns list of system alerts from recovery cron
 * 
 * GET: List alerts with filtering (unresolved by default)
 * PATCH: Resolve an alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AlertModel } from '@/lib/models/alert';
import { ALERT_TYPE, ALERT_SEVERITY, type AlertResponse } from '@/lib/types/alert';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const resolved = searchParams.get('resolved');
        const type = searchParams.get('type') as ALERT_TYPE | null;
        const severity = searchParams.get('severity') as ALERT_SEVERITY | null;
        const limit = parseInt(searchParams.get('limit') || '50');

        // Build filter - show unresolved by default
        const filter: Record<string, unknown> = {};

        if (resolved !== null) {
            filter.resolved = resolved === 'true';
        } else {
            filter.resolved = false; // Default to unresolved
        }

        if (type) {
            filter.type = type;
        }

        if (severity) {
            filter.severity = severity;
        }

        const alerts = await AlertModel.find(filter)
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();

        // Get counts by severity for unresolved alerts
        const [warningCount, errorCount, criticalCount, totalUnresolved] = await Promise.all([
            AlertModel.countDocuments({ resolved: false, severity: ALERT_SEVERITY.warning }),
            AlertModel.countDocuments({ resolved: false, severity: ALERT_SEVERITY.error }),
            AlertModel.countDocuments({ resolved: false, severity: ALERT_SEVERITY.critical }),
            AlertModel.countDocuments({ resolved: false })
        ]);

        // Transform MongoDB documents
        const data: AlertResponse[] = alerts.map((doc) => ({
            _id: doc._id.toString(),
            type: doc.type,
            notification_id: doc.notification_id?.toString(),
            message: doc.message,
            severity: doc.severity,
            metadata: doc.metadata,
            resolved: doc.resolved,
            resolved_at: doc.resolved_at,
            resolved_by: doc.resolved_by,
            created_at: doc.created_at,
            updated_at: doc.updated_at
        }));

        return NextResponse.json({
            data,
            counts: {
                warning: warningCount,
                error: errorCount,
                critical: criticalCount,
                total: totalUnresolved
            }
        });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch alerts' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { alertId, resolved, resolved_by } = body;

        if (!alertId) {
            return NextResponse.json(
                { error: 'Alert ID is required' },
                { status: 400 }
            );
        }

        const update: Record<string, unknown> = {
            resolved: resolved ?? true,
            resolved_at: new Date()
        };

        if (resolved_by) {
            update.resolved_by = resolved_by;
        }

        const updated = await AlertModel.findByIdAndUpdate(
            alertId,
            update,
            { new: true }
        );

        if (!updated) {
            return NextResponse.json(
                { error: 'Alert not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, alert: updated });
    } catch (error) {
        console.error('Error updating alert:', error);
        return NextResponse.json(
            { error: 'Failed to update alert' },
            { status: 500 }
        );
    }
}
