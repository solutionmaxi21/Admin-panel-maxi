// Shared Constants for Storefront
// TypeScript definitions for constants fetched from backend

import { getApiBaseUrl } from '@/lib/api/base-url'

export interface OrderStatuses {
    PENDING: string;
    PHONE_CONFIRMATION: string;
    CONFIRMED: string;
    PROCESSING: string;
    READY_TO_SHIP: string;
    SHIPPED: string;
    OUT_FOR_DELIVERY: string;
    DELIVERED: string;
    CANCELLED: string;
    RETURNED: string;
    REFUNDED: string;
}

export interface PaymentStatuses {
    PENDING: string;
    PAID: string;
    FAILED: string;
    REFUNDED: string;
    PARTIALLY_REFUNDED: string;
}

export interface Constants {
    ORDER_STATUSES: OrderStatuses;
    PAYMENT_STATUSES: PaymentStatuses;
    PAYMENT_METHODS: Record<string, string>;
    USER_ROLES: Record<string, string>;
    PRODUCT_STATUSES: Record<string, string>;
    REVIEW_STATUSES: Record<string, string>;
    RETURN_STATUSES: Record<string, string>;
    SHIPMENT_STATUSES: Record<string, string>;
    DELIVERY_TYPES: Record<string, string>;
}

// Fetch constants from backend
let constantsCache: Constants | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function getConstants(): Promise<Constants> {
    // Return cached constants if still valid
    if (constantsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        return constantsCache;
    }

    try {
        const apiUrl = getApiBaseUrl()
        const response = await fetch(`${apiUrl}/constants`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch constants');
        }

        const result = await response.json();
        constantsCache = result.data;
        cacheTimestamp = Date.now();

        return constantsCache!;
    } catch (error) {
        console.error('Error fetching constants:', error);

        // Return fallback constants if API fails
        return getFallbackConstants();
    }
}

// Fallback constants in case API is unavailable
function getFallbackConstants(): Constants {
    return {
        ORDER_STATUSES: {
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
        },
        PAYMENT_STATUSES: {
            PENDING: 'pending',
            PAID: 'paid',
            FAILED: 'failed',
            REFUNDED: 'refunded',
            PARTIALLY_REFUNDED: 'partially_refunded'
        },
        PAYMENT_METHODS: {
            CASH_ON_DELIVERY: 'cash_on_delivery',
            CREDIT_CARD: 'credit_card',
            BANK_TRANSFER: 'bank_transfer',
            MOBILE_PAYMENT: 'mobile_payment'
        },
        USER_ROLES: {
            CUSTOMER: 'customer',
            ADMIN: 'admin',
            WAREHOUSE_STAFF: 'warehouse_staff',
            SUPPORT: 'support'
        },
        PRODUCT_STATUSES: {
            ACTIVE: 'active',
            INACTIVE: 'inactive',
            OUT_OF_STOCK: 'out_of_stock',
            DISCONTINUED: 'discontinued'
        },
        REVIEW_STATUSES: {
            PENDING: 'pending',
            APPROVED: 'approved',
            REJECTED: 'rejected'
        },
        RETURN_STATUSES: {
            REQUESTED: 'requested',
            APPROVED: 'approved',
            REJECTED: 'rejected',
            IN_TRANSIT: 'in_transit',
            RECEIVED: 'received',
            REFUNDED: 'refunded',
            COMPLETED: 'completed'
        },
        SHIPMENT_STATUSES: {
            PENDING: 'pending',
            PICKED_UP: 'picked_up',
            IN_TRANSIT: 'in_transit',
            OUT_FOR_DELIVERY: 'out_for_delivery',
            DELIVERED: 'delivered',
            FAILED_DELIVERY: 'failed_delivery',
            RETURNED_TO_SENDER: 'returned_to_sender'
        },
        DELIVERY_TYPES: {
            HOME: 'home',
            PICKUP_POINT: 'pickup_point',
            OFFICE: 'office'
        }
    };
}

// Helper to get order status label
export function getOrderStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: 'Pending',
        phone_confirmation: 'Phone Confirmation',
        confirmed: 'Confirmed',
        processing: 'Processing',
        ready_to_ship: 'Ready to Ship',
        shipped: 'Shipped',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled',
        returned: 'Returned',
        refunded: 'Refunded'
    };
    return labels[status] || status;
}

// Helper to get payment status label
export function getPaymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: 'Pending',
        paid: 'Paid',
        failed: 'Failed',
        refunded: 'Refunded',
        partially_refunded: 'Partially Refunded'
    };
    return labels[status] || status;
}
