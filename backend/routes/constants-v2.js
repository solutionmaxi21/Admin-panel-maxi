import express from 'express';
import constants from '../src/shared/constants.js';

const router = express.Router();

/**
 * GET /api/constants
 * Returns all shared constants for frontend consumption
 */
router.get('/', (req, res) => {
    res.json({
        success: true,
        data: {
            ORDER_STATUSES: constants.ORDER_STATUSES,
            PAYMENT_STATUSES: constants.PAYMENT_STATUSES,
            PAYMENT_METHODS: constants.PAYMENT_METHODS,
            USER_ROLES: constants.USER_ROLES,
            PRODUCT_STATUSES: constants.PRODUCT_STATUSES,
            REVIEW_STATUSES: constants.REVIEW_STATUSES,
            RETURN_STATUSES: constants.RETURN_STATUSES,
            SHIPMENT_STATUSES: constants.SHIPMENT_STATUSES,
            DELIVERY_TYPES: constants.DELIVERY_TYPES
        }
    });
});

/**
 * GET /api/constants/order-statuses
 * Returns order status constants with labels
 */
router.get('/order-statuses', (req, res) => {
    const statuses = Object.entries(constants.ORDER_STATUSES).map(([key, value]) => ({
        key,
        value,
        label: constants.getOrderStatusLabel(value)
    }));

    res.json({
        success: true,
        data: statuses
    });
});

/**
 * GET /api/constants/payment-statuses
 * Returns payment status constants with labels
 */
router.get('/payment-statuses', (req, res) => {
    const statuses = Object.entries(constants.PAYMENT_STATUSES).map(([key, value]) => ({
        key,
        value,
        label: constants.getPaymentStatusLabel(value)
    }));

    res.json({
        success: true,
        data: statuses
    });
});

export default router;
