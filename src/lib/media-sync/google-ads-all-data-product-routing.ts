import {
  GOOGLE_ADS_PRODUCT_FAMILIES,
  type GoogleAdsProductFamily,
} from "./google-ads-authoritative-grain";

type UnknownRecord =
  Record<string, unknown>;

const PRODUCT_ROUTE_FIELD =
  "product_route" as const;

const PRODUCT_INDEX_FIELD =
  "product_index" as const;

const PRODUCT_FAMILY_FIELD =
  "product_family" as const;

export const GOOGLE_ADS_ALL_DATA_CANONICAL_PRODUCT_ROUTE:
  readonly GoogleAdsProductFamily[] =
  Object.freeze([
    ...GOOGLE_ADS_PRODUCT_FAMILIES,
  ]);

export type GoogleAdsAllDataProductRoutingErrorCode =
  | "INVALID_INPUT"
  | "INVALID_ROUTE"
  | "INVALID_INDEX"
  | "ROUTING_CONFLICT";

export class GoogleAdsAllDataProductRoutingError
  extends Error {
  readonly code:
    GoogleAdsAllDataProductRoutingErrorCode;

  constructor(
    code:
      GoogleAdsAllDataProductRoutingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataProductRoutingError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataProductRoutingState =
  Readonly<{
    route:
      readonly GoogleAdsProductFamily[];

    productIndex: number;

    productFamily:
      GoogleAdsProductFamily |
      null;

    complete: boolean;
  }>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function normalizeProductFamily(
  value: unknown,
): GoogleAdsProductFamily {
  if (
    typeof value !==
    "string"
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_ROUTE",
      "Google Ads ALL-DATA product family must be a string.",
    );
  }

  const normalized =
    value.trim();

  if (
    !(
      GOOGLE_ADS_ALL_DATA_CANONICAL_PRODUCT_ROUTE as
        readonly string[]
    ).includes(
      normalized,
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_ROUTE",
      "Google Ads ALL-DATA product family is not supported.",
    );
  }

  return normalized as
    GoogleAdsProductFamily;
}

function normalizeProductIndex(
  value: unknown,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INDEX",
      "Google Ads ALL-DATA product index must be a non-negative safe integer.",
    );
  }

  return value;
}

export function buildGoogleAdsAllDataProductRoute(
  productFamilies:
    readonly unknown[],
): readonly GoogleAdsProductFamily[] {
  if (
    !Array.isArray(
      productFamilies,
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product families must be an array.",
    );
  }

  const selected =
    new Set<GoogleAdsProductFamily>();

  for (
    const value
    of productFamilies
  ) {
    selected.add(
      normalizeProductFamily(
        value,
      ),
    );
  }

  return Object.freeze(
    GOOGLE_ADS_ALL_DATA_CANONICAL_PRODUCT_ROUTE.filter(
      productFamily =>
        selected.has(
          productFamily,
        ),
    ),
  );
}

export function buildGoogleAdsAllDataExecutableProductRoute(
  productFamilies:
    readonly GoogleAdsProductFamily[],
): readonly GoogleAdsProductFamily[] {
  return buildGoogleAdsAllDataProductRoute(
    productFamilies.filter(
      productFamily =>
        productFamily === "search" ||
        productFamily === "demand_gen" ||
        productFamily === "display",
    ),
  );
}

export function validateGoogleAdsAllDataProductRoutingState(
  value: unknown,
): GoogleAdsAllDataProductRoutingState {
  if (
    !isPlainObject(
      value,
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product routing state must be an object.",
    );
  }

  if (
    !Array.isArray(
      value.route,
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_ROUTE",
      "Google Ads ALL-DATA product route must be an array.",
    );
  }

  const rawRoute =
    value.route;

  const canonicalRoute =
    buildGoogleAdsAllDataProductRoute(
      rawRoute,
    );

  if (
    canonicalRoute.length !==
      rawRoute.length ||
    canonicalRoute.some(
      (
        productFamily,
        index,
      ) =>
        productFamily !==
        rawRoute[index],
    )
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_ROUTE",
      "Google Ads ALL-DATA product route must be unique and follow canonical product order.",
    );
  }

  const productIndex =
    normalizeProductIndex(
      value.productIndex,
    );

  if (
    typeof value.complete !==
    "boolean"
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product routing completion flag must be boolean.",
    );
  }

  if (
    value.complete
  ) {
    if (
      productIndex !==
        canonicalRoute.length ||
      value.productFamily !==
        null
    ) {
      throw new GoogleAdsAllDataProductRoutingError(
        "ROUTING_CONFLICT",
        "A completed Google Ads ALL-DATA product route must point immediately after the final product.",
      );
    }

    return Object.freeze({
      route:
        canonicalRoute,

      productIndex,

      productFamily:
        null,

      complete:
        true,
    });
  }

  if (
    canonicalRoute.length ===
      0 ||
    productIndex >=
      canonicalRoute.length
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "A partial Google Ads ALL-DATA product route must point at an available product.",
    );
  }

  const productFamily =
    normalizeProductFamily(
      value.productFamily,
    );

  if (
    productFamily !==
      canonicalRoute[
        productIndex
      ]
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "Google Ads ALL-DATA product family does not match product index.",
    );
  }

  return Object.freeze({
    route:
      canonicalRoute,

    productIndex,

    productFamily,

    complete:
      false,
  });
}

export function advanceGoogleAdsAllDataProductRoutingState(
  input: Readonly<{
    routing:
      GoogleAdsAllDataProductRoutingState;

    completedProduct:
      GoogleAdsProductFamily;
  }>,
): GoogleAdsAllDataProductRoutingState {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product transition input is invalid.",
    );
  }

  const routing =
    validateGoogleAdsAllDataProductRoutingState(
      input.routing,
    );

  if (
    routing.complete ||
    routing.productFamily !==
      input.completedProduct
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "Google Ads ALL-DATA product transition does not match the durable current product.",
    );
  }

  const productIndex =
    routing.productIndex +
    1;

  if (
    productIndex ===
      routing.route.length
  ) {
    return validateGoogleAdsAllDataProductRoutingState({
      route:
        routing.route,

      productIndex,

      productFamily:
        null,

      complete:
        true,
    });
  }

  return validateGoogleAdsAllDataProductRoutingState({
    route:
      routing.route,

    productIndex,

    productFamily:
      routing.route[
        productIndex
      ],

    complete:
      false,
  });
}

export type GoogleAdsAllDataProductCompletionBoundary =
  Readonly<{
    globalComplete: boolean;

    atProductBoundary: boolean;
  }>;

export function resolveGoogleAdsAllDataProductCompletionBoundary(
  input: Readonly<{
    stagingComplete: boolean;

    routing:
      GoogleAdsAllDataProductRoutingState;
  }>,
): GoogleAdsAllDataProductCompletionBoundary {
  if (
    !input ||
    typeof input !==
      "object" ||
    typeof input.stagingComplete !==
      "boolean"
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product completion boundary input is invalid.",
    );
  }

  const routing =
    validateGoogleAdsAllDataProductRoutingState(
      input.routing,
    );

  if (
    routing.complete &&
    !input.stagingComplete
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "A globally completed Google Ads ALL-DATA route cannot persist an incomplete product result.",
    );
  }

  return Object.freeze({
    globalComplete:
      routing.complete,

    atProductBoundary:
      input.stagingComplete &&
      !routing.complete,
  });
}

export function readGoogleAdsAllDataProductRoutingState(
  input: Readonly<{
    collector:
      UnknownRecord;

    complete: boolean;
  }>,
): GoogleAdsAllDataProductRoutingState |
  null {
  if (
    !input ||
    typeof input !==
      "object" ||
    !isPlainObject(
      input.collector,
    ) ||
    typeof input.complete !==
      "boolean"
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product routing checkpoint input is invalid.",
    );
  }

  const hasRoute =
    Object.prototype.hasOwnProperty.call(
      input.collector,
      PRODUCT_ROUTE_FIELD,
    );

  const hasIndex =
    Object.prototype.hasOwnProperty.call(
      input.collector,
      PRODUCT_INDEX_FIELD,
    );

  const hasFamily =
    Object.prototype.hasOwnProperty.call(
      input.collector,
      PRODUCT_FAMILY_FIELD,
    );

  const fieldCount =
    Number(
      hasRoute,
    ) +
    Number(
      hasIndex,
    ) +
    Number(
      hasFamily,
    );

  if (
    fieldCount ===
    0
  ) {
    return null;
  }

  if (
    fieldCount !==
    3
  ) {
    throw new GoogleAdsAllDataProductRoutingError(
      "ROUTING_CONFLICT",
      "Google Ads ALL-DATA product routing checkpoint fields must be persisted together.",
    );
  }

  return validateGoogleAdsAllDataProductRoutingState({
    route:
      input.collector[
        PRODUCT_ROUTE_FIELD
      ],

    productIndex:
      input.collector[
        PRODUCT_INDEX_FIELD
      ],

    productFamily:
      input.collector[
        PRODUCT_FAMILY_FIELD
      ],

    complete:
      input.complete,
  });
}
