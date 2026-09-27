// ============================================
// Shared Constants - Single Source of Truth
// ============================================
// This file contains all constants shared across the application
// to prevent drift between Frontend and Backend

export const ORDER_STATUSES = {
    PENDING: 'pending',
    PHONE_CONFIRMATION: 'phone_confirmation',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    READY_TO_SHIP: 'ready_to_ship',
    SHIPPED: 'shipped',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    RETURNED: 'returned',
    REFUNDED: 'refunded'
};

export const PAYMENT_STATUSES = {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'partially_refunded'
};

export const PAYMENT_METHODS = {
    CASH_ON_DELIVERY: 'cash_on_delivery',
    CREDIT_CARD: 'credit_card',
    BANK_TRANSFER: 'bank_transfer',
    MOBILE_PAYMENT: 'mobile_payment'
};

export const USER_ROLES = {
    CUSTOMER: 'customer',
    ADMIN: 'admin',
    WAREHOUSE_STAFF: 'warehouse_staff',
    SUPPORT: 'support'
};

export const PRODUCT_STATUSES = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    OUT_OF_STOCK: 'out_of_stock',
    DISCONTINUED: 'discontinued'
};

export const REVIEW_STATUSES = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

export const RETURN_STATUSES = {
    REQUESTED: 'requested',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    IN_TRANSIT: 'in_transit',
    RECEIVED: 'received',
    REFUNDED: 'refunded',
    COMPLETED: 'completed'
};

export const SHIPMENT_STATUSES = {
    PENDING: 'pending',
    PICKED_UP: 'picked_up',
    IN_TRANSIT: 'in_transit',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED: 'delivered',
    FAILED_DELIVERY: 'failed_delivery',
    RETURNED_TO_SENDER: 'returned_to_sender'
};

export const DELIVERY_TYPES = {
    HOME: 'home',
    PICKUP_POINT: 'pickup_point',
    OFFICE: 'office'
};

// Validation helpers
export const isValidOrderStatus = (status) => {
    return Object.values(ORDER_STATUSES).includes(status);
};

export const isValidPaymentStatus = (status) => {
    return Object.values(PAYMENT_STATUSES).includes(status);
};

export const isValidUserRole = (role) => {
    return Object.values(USER_ROLES).includes(role);
};

// Display helpers
export const getOrderStatusLabel = (status) => {
    const labels = {
        [ORDER_STATUSES.PENDING]: 'Pending',
        [ORDER_STATUSES.PHONE_CONFIRMATION]: 'Phone Confirmation',
        [ORDER_STATUSES.CONFIRMED]: 'Confirmed',
        [ORDER_STATUSES.PROCESSING]: 'Processing',
        [ORDER_STATUSES.READY_TO_SHIP]: 'Ready to Ship',
        [ORDER_STATUSES.SHIPPED]: 'Shipped',
        [ORDER_STATUSES.OUT_FOR_DELIVERY]: 'Out for Delivery',
        [ORDER_STATUSES.DELIVERED]: 'Delivered',
        [ORDER_STATUSES.CANCELLED]: 'Cancelled',
        [ORDER_STATUSES.RETURNED]: 'Returned',
        [ORDER_STATUSES.REFUNDED]: 'Refunded'
    };
    return labels[status] || status;
};

export const getPaymentStatusLabel = (status) => {
    const labels = {
        [PAYMENT_STATUSES.PENDING]: 'Pending',
        [PAYMENT_STATUSES.PAID]: 'Paid',
        [PAYMENT_STATUSES.FAILED]: 'Failed',
        [PAYMENT_STATUSES.REFUNDED]: 'Refunded',
        [PAYMENT_STATUSES.PARTIALLY_REFUNDED]: 'Partially Refunded'
    };
    return labels[status] || status;
};

// Export all constants as a single object for convenience
export default {
    ORDER_STATUSES,
    PAYMENT_STATUSES,
    PAYMENT_METHODS,
    USER_ROLES,
    PRODUCT_STATUSES,
    REVIEW_STATUSES,
    RETURN_STATUSES,
    SHIPMENT_STATUSES,
    DELIVERY_TYPES,
    isValidOrderStatus,
    isValidPaymentStatus,
    isValidUserRole,
    getOrderStatusLabel,
    getPaymentStatusLabel
};
