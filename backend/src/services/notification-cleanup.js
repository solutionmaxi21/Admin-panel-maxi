/**
 * Notification Cleanup Service
 * Automatically removes old notifications to keep the database slim
 */

import NotificationService from './NotificationService.js';

class NotificationCleanupService {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        // Run once every 24 hours
        this.frequencyMs = 24 * 60 * 60 * 1000;
    }

    /**
     * Start the cleanup service
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log('[Notification Cleanup] Service started - running every 24 hours');

        // Run first cleanup after 1 minute of server start (to avoid startup load)
        setTimeout(() => {
            this.runCleanup();
        }, 60000);

        // Then run at intervals
        this.interval = setInterval(() => {
            this.runCleanup();
        }, this.frequencyMs);
    }

    /**
     * Stop the service
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isRunning = false;
            console.log('[Notification Cleanup] Service stopped');
        }
    }

    /**
     * Execute cleanup
     */
    async runCleanup() {
        try {
            console.log('[Notification Cleanup] Starting daily cleanup...');
            // Clean up read notifications older than 30 days
            const result = await NotificationService.cleanupOldNotifications(30);
            console.log(`[Notification Cleanup] Finished: ${result.rowCount || 0} notifications removed`);
        } catch (error) {
            console.error('[Notification Cleanup] Error during cleanup:', error);
        }
    }
}

// Export singleton
const notificationCleanupService = new NotificationCleanupService();
export default notificationCleanupService;
