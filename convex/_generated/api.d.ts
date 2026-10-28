/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as extraction from "../extraction.js";
import type * as google from "../google.js";
import type * as master from "../master.js";
import type * as organizations from "../organizations.js";
import type * as snapshots from "../snapshots.js";
import type * as sources from "../sources.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  crons: typeof crons;
  events: typeof events;
  extraction: typeof extraction;
  google: typeof google;
  master: typeof master;
  organizations: typeof organizations;
  snapshots: typeof snapshots;
  sources: typeof sources;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
