# COST-002: Carrier Rate Caching - Summary

**Status**: Completed
**Date**: 2025-12-09
**Author**: Antigravity

## Overview

Implemented a Redis-based caching layer for carrier rate quotes. This reduces the number of expensive calls to external carrier APIs (FedEx, UPS, etc.) by serving cached rates for identical shipment queries within a 10-minute window.

## Changes Implemented

### 1. Shared Infrastructure (`apps/api/src/services/redis.js`)

- Created a centralized Redis service to share the connection between the Job Queue and the Rate Cacher, verifying optimized resource usage.

### 2. Route Refactoring (`apps/api/src/routes/carriers.js`)

- **Key Generation**: Hashes critical shipment parameters (`origin`, `dest`, `weight`, `lineItems`, `carrierAccounts`) to create a unique cache key `rates:{shipmentId}:{hash}`.
- **Logic**:
  - **HIT**: Returns cached JSON (instant response).
  - **MISS**: Calls external gateways, then stores result in Redis with `600s` (10m) TTL.
  - Updates `ShipmentCarrierMeta` regardless of source to ensure audit trail.

## Verification

- Created `apps/api/tests/caching.test.js`.
- Verified that the second request for the same shipment returns cached data and does **not** trigger the Gateway mock.
