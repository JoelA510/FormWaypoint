import { z } from 'zod';
import { Prisma } from '@prisma/client';

/////////////////////////////////////////
// HELPER FUNCTIONS
/////////////////////////////////////////

// JSON
//------------------------------------------------------

export type NullableJsonInput = Prisma.JsonValue | null | 'JsonNull' | 'DbNull' | Prisma.NullTypes.DbNull | Prisma.NullTypes.JsonNull;

export const transformJsonNull = (v?: NullableJsonInput) => {
  if (!v || v === 'DbNull') return Prisma.NullTypes.DbNull;
  if (v === 'JsonNull') return Prisma.NullTypes.JsonNull;
  return v;
};

export const JsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.literal(null),
    z.record(z.string(), z.lazy(() => JsonValueSchema.optional())),
    z.array(z.lazy(() => JsonValueSchema)),
  ])
);

export type JsonValueType = z.infer<typeof JsonValueSchema>;

export const NullableJsonValue = z
  .union([JsonValueSchema, z.literal('DbNull'), z.literal('JsonNull')])
  .nullable()
  .transform((v) => transformJsonNull(v));

export type NullableJsonValueType = z.infer<typeof NullableJsonValue>;

export const InputJsonValueSchema: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({ toJSON: z.any() }),
    z.record(z.string(), z.lazy(() => z.union([InputJsonValueSchema, z.literal(null)]))),
    z.array(z.lazy(() => z.union([InputJsonValueSchema, z.literal(null)]))),
  ])
);

export type InputJsonValueType = z.infer<typeof InputJsonValueSchema>;

// DECIMAL
//------------------------------------------------------

export const DecimalJsLikeSchema: z.ZodType<Prisma.DecimalJsLike> = z.object({
  d: z.array(z.number()),
  e: z.number(),
  s: z.number(),
  toFixed: z.any(),
})

export const DECIMAL_STRING_REGEX = /^(?:-?Infinity|NaN|-?(?:0[bB][01]+(?:\.[01]+)?(?:[pP][-+]?\d+)?|0[oO][0-7]+(?:\.[0-7]+)?(?:[pP][-+]?\d+)?|0[xX][\da-fA-F]+(?:\.[\da-fA-F]+)?(?:[pP][-+]?\d+)?|(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?))$/;

export const isValidDecimalInput =
  (v?: null | string | number | Prisma.DecimalJsLike): v is string | number | Prisma.DecimalJsLike => {
    if (v === undefined || v === null) return false;
    return (
      (typeof v === 'object' && 'd' in v && 'e' in v && 's' in v && 'toFixed' in v) ||
      (typeof v === 'string' && DECIMAL_STRING_REGEX.test(v)) ||
      typeof v === 'number'
    )
  };

/////////////////////////////////////////
// ENUMS
/////////////////////////////////////////

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted','ReadCommitted','RepeatableRead','Serializable']);

export const PartyScalarFieldEnumSchema = z.enum(['id','name','address','city','country','contactName','phone','email','taxIdOrEori','isAddressBookEntry','createdByUserId']);

export const ShipmentScalarFieldEnumSchema = z.enum(['id','shipperId','consigneeId','shipperSnapshot','consigneeSnapshot','incoterm','currency','totalValue','totalWeight','numPackages','originCountry','destinationCountry','status','trackingNumber','createdAt','updatedAt']);

export const CarrierAccountScalarFieldEnumSchema = z.enum(['id','provider','credentials','accountNumber','description','isActive','userId','createdAt','updatedAt']);

export const ShipmentCarrierMetaScalarFieldEnumSchema = z.enum(['id','shipmentId','rateQuoteJson','bookingResponseJson','labelUrl','carrierCode','serviceLevelCode','trackingNumber','bookedAt']);

export const ForwarderProfileScalarFieldEnumSchema = z.enum(['id','name','emailToJson','emailSubjectTemplate','dataBundleFormat','userId']);

export const ProductScalarFieldEnumSchema = z.enum(['id','sku','description','htsCode','originCountry','unitWeight','unitValue','createdByUserId','createdAt','updatedAt']);

export const SanctionsCheckResultScalarFieldEnumSchema = z.enum(['id','shipmentId','status','responseJson','checkDate']);

export const ShipmentTemplateScalarFieldEnumSchema = z.enum(['id','name','description','incoterm','originCountry','destinationCountry','shipperId','consigneeId','lineItemsJson','userId','createdAt','updatedAt']);

export const DocumentScalarFieldEnumSchema = z.enum(['id','shipmentId','filename','type','status','storageKey','meta','createdAt']);

export const UserScalarFieldEnumSchema = z.enum(['id','username','password','role','createdAt','updatedAt']);

export const ErpExportConfigScalarFieldEnumSchema = z.enum(['id','destination','httpHeadersJson','endpointUrl','userId','createdAt']);

export const ErpExportJobScalarFieldEnumSchema = z.enum(['id','configId','status','fromDate','toDate','resultSummaryJson','createdAt']);

export const SortOrderSchema = z.enum(['asc','desc']);

export const NullableJsonNullValueInputSchema = z.enum(['DbNull','JsonNull',]).transform((value) => value === 'JsonNull' ? Prisma.JsonNull : value === 'DbNull' ? Prisma.DbNull : value);

export const QueryModeSchema = z.enum(['default','insensitive']);

export const NullsOrderSchema = z.enum(['first','last']);

export const JsonNullValueFilterSchema = z.enum(['DbNull','JsonNull','AnyNull',]).transform((value) => value === 'JsonNull' ? Prisma.JsonNull : value === 'DbNull' ? Prisma.DbNull : value === 'AnyNull' ? Prisma.AnyNull : value);
/////////////////////////////////////////
// MODELS
/////////////////////////////////////////

/////////////////////////////////////////
// PARTY SCHEMA
/////////////////////////////////////////

export const PartySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  taxIdOrEori: z.string().nullable(),
  isAddressBookEntry: z.boolean(),
  createdByUserId: z.string().nullable(),
})

export type Party = z.infer<typeof PartySchema>

/////////////////////////////////////////
// SHIPMENT SCHEMA
/////////////////////////////////////////

export const ShipmentSchema = z.object({
  id: z.string().uuid(),
  shipperId: z.string().nullable(),
  consigneeId: z.string().nullable(),
  shipperSnapshot: JsonValueSchema.nullable(),
  consigneeSnapshot: JsonValueSchema.nullable(),
  incoterm: z.string().nullable(),
  currency: z.string().nullable(),
  totalValue: z.instanceof(Prisma.Decimal, { message: "Field 'totalValue' must be a Decimal. Location: ['Models', 'Shipment']"}).nullable(),
  totalWeight: z.number().nullable(),
  numPackages: z.number().int().nullable(),
  originCountry: z.string().nullable(),
  destinationCountry: z.string().nullable(),
  status: z.string(),
  trackingNumber: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Shipment = z.infer<typeof ShipmentSchema>

/////////////////////////////////////////
// CARRIER ACCOUNT SCHEMA
/////////////////////////////////////////

export const CarrierAccountSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  credentials: z.string(),
  accountNumber: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  userId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type CarrierAccount = z.infer<typeof CarrierAccountSchema>

/////////////////////////////////////////
// SHIPMENT CARRIER META SCHEMA
/////////////////////////////////////////

export const ShipmentCarrierMetaSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string(),
  rateQuoteJson: z.string().nullable(),
  bookingResponseJson: z.string().nullable(),
  labelUrl: z.string().nullable(),
  carrierCode: z.string().nullable(),
  serviceLevelCode: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  bookedAt: z.coerce.date().nullable(),
})

export type ShipmentCarrierMeta = z.infer<typeof ShipmentCarrierMetaSchema>

/////////////////////////////////////////
// FORWARDER PROFILE SCHEMA
/////////////////////////////////////////

export const ForwarderProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  emailToJson: z.string(),
  emailSubjectTemplate: z.string(),
  dataBundleFormat: z.string(),
  userId: z.string(),
})

export type ForwarderProfile = z.infer<typeof ForwarderProfileSchema>

/////////////////////////////////////////
// PRODUCT SCHEMA
/////////////////////////////////////////

export const ProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  description: z.string().nullable(),
  htsCode: z.string().nullable(),
  originCountry: z.string().nullable(),
  unitWeight: z.number().nullable(),
  unitValue: z.instanceof(Prisma.Decimal, { message: "Field 'unitValue' must be a Decimal. Location: ['Models', 'Product']"}).nullable(),
  createdByUserId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Product = z.infer<typeof ProductSchema>

/////////////////////////////////////////
// SANCTIONS CHECK RESULT SCHEMA
/////////////////////////////////////////

export const SanctionsCheckResultSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string(),
  status: z.string(),
  responseJson: z.string(),
  checkDate: z.coerce.date(),
})

export type SanctionsCheckResult = z.infer<typeof SanctionsCheckResultSchema>

/////////////////////////////////////////
// SHIPMENT TEMPLATE SCHEMA
/////////////////////////////////////////

export const ShipmentTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  incoterm: z.string().nullable(),
  originCountry: z.string().nullable(),
  destinationCountry: z.string().nullable(),
  shipperId: z.string().nullable(),
  consigneeId: z.string().nullable(),
  lineItemsJson: z.string().nullable(),
  userId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type ShipmentTemplate = z.infer<typeof ShipmentTemplateSchema>

/////////////////////////////////////////
// DOCUMENT SCHEMA
/////////////////////////////////////////

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string(),
  filename: z.string(),
  type: z.string(),
  status: z.string(),
  storageKey: z.string(),
  meta: z.string().nullable(),
  createdAt: z.coerce.date(),
})

export type Document = z.infer<typeof DocumentSchema>

/////////////////////////////////////////
// USER SCHEMA
/////////////////////////////////////////

export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  password: z.string(),
  role: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type User = z.infer<typeof UserSchema>

/////////////////////////////////////////
// ERP EXPORT CONFIG SCHEMA
/////////////////////////////////////////

export const ErpExportConfigSchema = z.object({
  id: z.string().uuid(),
  destination: z.string(),
  httpHeadersJson: z.string().nullable(),
  endpointUrl: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date(),
})

export type ErpExportConfig = z.infer<typeof ErpExportConfigSchema>

/////////////////////////////////////////
// ERP EXPORT JOB SCHEMA
/////////////////////////////////////////

export const ErpExportJobSchema = z.object({
  id: z.string().uuid(),
  configId: z.string(),
  status: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  resultSummaryJson: z.string().nullable(),
  createdAt: z.coerce.date(),
})

export type ErpExportJob = z.infer<typeof ErpExportJobSchema>

/////////////////////////////////////////
// SELECT & INCLUDE
/////////////////////////////////////////

// PARTY
//------------------------------------------------------

export const PartyIncludeSchema: z.ZodType<Prisma.PartyInclude> = z.object({
  shipmentsAsShipper: z.union([z.boolean(),z.lazy(() => ShipmentFindManyArgsSchema)]).optional(),
  shipmentsAsConsignee: z.union([z.boolean(),z.lazy(() => ShipmentFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => PartyCountOutputTypeArgsSchema)]).optional(),
}).strict();

export const PartyArgsSchema: z.ZodType<Prisma.PartyDefaultArgs> = z.object({
  select: z.lazy(() => PartySelectSchema).optional(),
  include: z.lazy(() => PartyIncludeSchema).optional(),
}).strict();

export const PartyCountOutputTypeArgsSchema: z.ZodType<Prisma.PartyCountOutputTypeDefaultArgs> = z.object({
  select: z.lazy(() => PartyCountOutputTypeSelectSchema).nullish(),
}).strict();

export const PartyCountOutputTypeSelectSchema: z.ZodType<Prisma.PartyCountOutputTypeSelect> = z.object({
  shipmentsAsShipper: z.boolean().optional(),
  shipmentsAsConsignee: z.boolean().optional(),
}).strict();

export const PartySelectSchema: z.ZodType<Prisma.PartySelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  address: z.boolean().optional(),
  city: z.boolean().optional(),
  country: z.boolean().optional(),
  contactName: z.boolean().optional(),
  phone: z.boolean().optional(),
  email: z.boolean().optional(),
  taxIdOrEori: z.boolean().optional(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.boolean().optional(),
  shipmentsAsShipper: z.union([z.boolean(),z.lazy(() => ShipmentFindManyArgsSchema)]).optional(),
  shipmentsAsConsignee: z.union([z.boolean(),z.lazy(() => ShipmentFindManyArgsSchema)]).optional(),
  _count: z.union([z.boolean(),z.lazy(() => PartyCountOutputTypeArgsSchema)]).optional(),
}).strict()

// SHIPMENT
//------------------------------------------------------

export const ShipmentIncludeSchema: z.ZodType<Prisma.ShipmentInclude> = z.object({
  shipper: z.union([z.boolean(),z.lazy(() => PartyArgsSchema)]).optional(),
  consignee: z.union([z.boolean(),z.lazy(() => PartyArgsSchema)]).optional(),
  carrierMeta: z.union([z.boolean(),z.lazy(() => ShipmentCarrierMetaArgsSchema)]).optional(),
}).strict();

export const ShipmentArgsSchema: z.ZodType<Prisma.ShipmentDefaultArgs> = z.object({
  select: z.lazy(() => ShipmentSelectSchema).optional(),
  include: z.lazy(() => ShipmentIncludeSchema).optional(),
}).strict();

export const ShipmentSelectSchema: z.ZodType<Prisma.ShipmentSelect> = z.object({
  id: z.boolean().optional(),
  shipperId: z.boolean().optional(),
  consigneeId: z.boolean().optional(),
  shipperSnapshot: z.boolean().optional(),
  consigneeSnapshot: z.boolean().optional(),
  incoterm: z.boolean().optional(),
  currency: z.boolean().optional(),
  totalValue: z.boolean().optional(),
  totalWeight: z.boolean().optional(),
  numPackages: z.boolean().optional(),
  originCountry: z.boolean().optional(),
  destinationCountry: z.boolean().optional(),
  status: z.boolean().optional(),
  trackingNumber: z.boolean().optional(),
  createdAt: z.boolean().optional(),
  updatedAt: z.boolean().optional(),
  shipper: z.union([z.boolean(),z.lazy(() => PartyArgsSchema)]).optional(),
  consignee: z.union([z.boolean(),z.lazy(() => PartyArgsSchema)]).optional(),
  carrierMeta: z.union([z.boolean(),z.lazy(() => ShipmentCarrierMetaArgsSchema)]).optional(),
}).strict()

// CARRIER ACCOUNT
//------------------------------------------------------

export const CarrierAccountSelectSchema: z.ZodType<Prisma.CarrierAccountSelect> = z.object({
  id: z.boolean().optional(),
  provider: z.boolean().optional(),
  credentials: z.boolean().optional(),
  accountNumber: z.boolean().optional(),
  description: z.boolean().optional(),
  isActive: z.boolean().optional(),
  userId: z.boolean().optional(),
  createdAt: z.boolean().optional(),
  updatedAt: z.boolean().optional(),
}).strict()

// SHIPMENT CARRIER META
//------------------------------------------------------

export const ShipmentCarrierMetaIncludeSchema: z.ZodType<Prisma.ShipmentCarrierMetaInclude> = z.object({
  shipment: z.union([z.boolean(),z.lazy(() => ShipmentArgsSchema)]).optional(),
}).strict();

export const ShipmentCarrierMetaArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaDefaultArgs> = z.object({
  select: z.lazy(() => ShipmentCarrierMetaSelectSchema).optional(),
  include: z.lazy(() => ShipmentCarrierMetaIncludeSchema).optional(),
}).strict();

export const ShipmentCarrierMetaSelectSchema: z.ZodType<Prisma.ShipmentCarrierMetaSelect> = z.object({
  id: z.boolean().optional(),
  shipmentId: z.boolean().optional(),
  rateQuoteJson: z.boolean().optional(),
  bookingResponseJson: z.boolean().optional(),
  labelUrl: z.boolean().optional(),
  carrierCode: z.boolean().optional(),
  serviceLevelCode: z.boolean().optional(),
  trackingNumber: z.boolean().optional(),
  bookedAt: z.boolean().optional(),
  shipment: z.union([z.boolean(),z.lazy(() => ShipmentArgsSchema)]).optional(),
}).strict()

// FORWARDER PROFILE
//------------------------------------------------------

export const ForwarderProfileSelectSchema: z.ZodType<Prisma.ForwarderProfileSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  emailToJson: z.boolean().optional(),
  emailSubjectTemplate: z.boolean().optional(),
  dataBundleFormat: z.boolean().optional(),
  userId: z.boolean().optional(),
}).strict()

// PRODUCT
//------------------------------------------------------

export const ProductSelectSchema: z.ZodType<Prisma.ProductSelect> = z.object({
  id: z.boolean().optional(),
  sku: z.boolean().optional(),
  description: z.boolean().optional(),
  htsCode: z.boolean().optional(),
  originCountry: z.boolean().optional(),
  unitWeight: z.boolean().optional(),
  unitValue: z.boolean().optional(),
  createdByUserId: z.boolean().optional(),
  createdAt: z.boolean().optional(),
  updatedAt: z.boolean().optional(),
}).strict()

// SANCTIONS CHECK RESULT
//------------------------------------------------------

export const SanctionsCheckResultSelectSchema: z.ZodType<Prisma.SanctionsCheckResultSelect> = z.object({
  id: z.boolean().optional(),
  shipmentId: z.boolean().optional(),
  status: z.boolean().optional(),
  responseJson: z.boolean().optional(),
  checkDate: z.boolean().optional(),
}).strict()

// SHIPMENT TEMPLATE
//------------------------------------------------------

export const ShipmentTemplateSelectSchema: z.ZodType<Prisma.ShipmentTemplateSelect> = z.object({
  id: z.boolean().optional(),
  name: z.boolean().optional(),
  description: z.boolean().optional(),
  incoterm: z.boolean().optional(),
  originCountry: z.boolean().optional(),
  destinationCountry: z.boolean().optional(),
  shipperId: z.boolean().optional(),
  consigneeId: z.boolean().optional(),
  lineItemsJson: z.boolean().optional(),
  userId: z.boolean().optional(),
  createdAt: z.boolean().optional(),
  updatedAt: z.boolean().optional(),
}).strict()

// DOCUMENT
//------------------------------------------------------

export const DocumentSelectSchema: z.ZodType<Prisma.DocumentSelect> = z.object({
  id: z.boolean().optional(),
  shipmentId: z.boolean().optional(),
  filename: z.boolean().optional(),
  type: z.boolean().optional(),
  status: z.boolean().optional(),
  storageKey: z.boolean().optional(),
  meta: z.boolean().optional(),
  createdAt: z.boolean().optional(),
}).strict()

// USER
//------------------------------------------------------

export const UserSelectSchema: z.ZodType<Prisma.UserSelect> = z.object({
  id: z.boolean().optional(),
  username: z.boolean().optional(),
  password: z.boolean().optional(),
  role: z.boolean().optional(),
  createdAt: z.boolean().optional(),
  updatedAt: z.boolean().optional(),
}).strict()

// ERP EXPORT CONFIG
//------------------------------------------------------

export const ErpExportConfigSelectSchema: z.ZodType<Prisma.ErpExportConfigSelect> = z.object({
  id: z.boolean().optional(),
  destination: z.boolean().optional(),
  httpHeadersJson: z.boolean().optional(),
  endpointUrl: z.boolean().optional(),
  userId: z.boolean().optional(),
  createdAt: z.boolean().optional(),
}).strict()

// ERP EXPORT JOB
//------------------------------------------------------

export const ErpExportJobSelectSchema: z.ZodType<Prisma.ErpExportJobSelect> = z.object({
  id: z.boolean().optional(),
  configId: z.boolean().optional(),
  status: z.boolean().optional(),
  fromDate: z.boolean().optional(),
  toDate: z.boolean().optional(),
  resultSummaryJson: z.boolean().optional(),
  createdAt: z.boolean().optional(),
}).strict()


/////////////////////////////////////////
// INPUT TYPES
/////////////////////////////////////////

export const PartyWhereInputSchema: z.ZodType<Prisma.PartyWhereInput> = z.object({
  AND: z.union([ z.lazy(() => PartyWhereInputSchema), z.lazy(() => PartyWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => PartyWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => PartyWhereInputSchema), z.lazy(() => PartyWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  address: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  city: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  country: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  contactName: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  phone: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  email: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  taxIdOrEori: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.lazy(() => BoolFilterSchema), z.boolean() ]).optional(),
  createdByUserId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentListRelationFilterSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentListRelationFilterSchema).optional(),
}).strict();

export const PartyOrderByWithRelationInputSchema: z.ZodType<Prisma.PartyOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  address: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  city: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  country: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  contactName: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  phone: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  email: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  taxIdOrEori: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  isAddressBookEntry: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipmentsAsShipper: z.lazy(() => ShipmentOrderByRelationAggregateInputSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentOrderByRelationAggregateInputSchema).optional(),
}).strict();

export const PartyWhereUniqueInputSchema: z.ZodType<Prisma.PartyWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => PartyWhereInputSchema), z.lazy(() => PartyWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => PartyWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => PartyWhereInputSchema), z.lazy(() => PartyWhereInputSchema).array() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  address: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  city: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  country: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  contactName: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  phone: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  email: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  taxIdOrEori: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.lazy(() => BoolFilterSchema), z.boolean() ]).optional(),
  createdByUserId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentListRelationFilterSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentListRelationFilterSchema).optional(),
}).strict());

export const PartyOrderByWithAggregationInputSchema: z.ZodType<Prisma.PartyOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  address: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  city: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  country: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  contactName: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  phone: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  email: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  taxIdOrEori: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  isAddressBookEntry: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  _count: z.lazy(() => PartyCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => PartyMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => PartyMinOrderByAggregateInputSchema).optional(),
}).strict();

export const PartyScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.PartyScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => PartyScalarWhereWithAggregatesInputSchema), z.lazy(() => PartyScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => PartyScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => PartyScalarWhereWithAggregatesInputSchema), z.lazy(() => PartyScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  address: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  city: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  country: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  contactName: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  phone: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  email: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  taxIdOrEori: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.lazy(() => BoolWithAggregatesFilterSchema), z.boolean() ]).optional(),
  createdByUserId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
}).strict();

export const ShipmentWhereInputSchema: z.ZodType<Prisma.ShipmentWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  shipperId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipperSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  consigneeSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  incoterm: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  currency: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  totalValue: z.union([ z.lazy(() => DecimalNullableFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  totalWeight: z.union([ z.lazy(() => FloatNullableFilterSchema), z.number() ]).optional().nullable(),
  numPackages: z.union([ z.lazy(() => IntNullableFilterSchema), z.number() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  trackingNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  shipper: z.union([ z.lazy(() => PartyNullableScalarRelationFilterSchema), z.lazy(() => PartyWhereInputSchema) ]).optional().nullable(),
  consignee: z.union([ z.lazy(() => PartyNullableScalarRelationFilterSchema), z.lazy(() => PartyWhereInputSchema) ]).optional().nullable(),
  carrierMeta: z.union([ z.lazy(() => ShipmentCarrierMetaNullableScalarRelationFilterSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentOrderByWithRelationInputSchema: z.ZodType<Prisma.ShipmentOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  incoterm: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  currency: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  totalValue: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  totalWeight: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  numPackages: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  destinationCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  shipper: z.lazy(() => PartyOrderByWithRelationInputSchema).optional(),
  consignee: z.lazy(() => PartyOrderByWithRelationInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaOrderByWithRelationInputSchema).optional(),
}).strict();

export const ShipmentWhereUniqueInputSchema: z.ZodType<Prisma.ShipmentWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  shipperId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipperSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  consigneeSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  incoterm: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  currency: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  totalValue: z.union([ z.lazy(() => DecimalNullableFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  totalWeight: z.union([ z.lazy(() => FloatNullableFilterSchema), z.number() ]).optional().nullable(),
  numPackages: z.union([ z.lazy(() => IntNullableFilterSchema), z.number().int() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  trackingNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  shipper: z.union([ z.lazy(() => PartyNullableScalarRelationFilterSchema), z.lazy(() => PartyWhereInputSchema) ]).optional().nullable(),
  consignee: z.union([ z.lazy(() => PartyNullableScalarRelationFilterSchema), z.lazy(() => PartyWhereInputSchema) ]).optional().nullable(),
  carrierMeta: z.union([ z.lazy(() => ShipmentCarrierMetaNullableScalarRelationFilterSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional().nullable(),
}).strict());

export const ShipmentOrderByWithAggregationInputSchema: z.ZodType<Prisma.ShipmentOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  incoterm: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  currency: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  totalValue: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  totalWeight: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  numPackages: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  destinationCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ShipmentCountOrderByAggregateInputSchema).optional(),
  _avg: z.lazy(() => ShipmentAvgOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ShipmentMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ShipmentMinOrderByAggregateInputSchema).optional(),
  _sum: z.lazy(() => ShipmentSumOrderByAggregateInputSchema).optional(),
}).strict();

export const ShipmentScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ShipmentScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  shipperId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  shipperSnapshot: z.lazy(() => JsonNullableWithAggregatesFilterSchema).optional(),
  consigneeSnapshot: z.lazy(() => JsonNullableWithAggregatesFilterSchema).optional(),
  incoterm: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  currency: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  totalValue: z.union([ z.lazy(() => DecimalNullableWithAggregatesFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  totalWeight: z.union([ z.lazy(() => FloatNullableWithAggregatesFilterSchema), z.number() ]).optional().nullable(),
  numPackages: z.union([ z.lazy(() => IntNullableWithAggregatesFilterSchema), z.number() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  status: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  trackingNumber: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const CarrierAccountWhereInputSchema: z.ZodType<Prisma.CarrierAccountWhereInput> = z.object({
  AND: z.union([ z.lazy(() => CarrierAccountWhereInputSchema), z.lazy(() => CarrierAccountWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => CarrierAccountWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => CarrierAccountWhereInputSchema), z.lazy(() => CarrierAccountWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  provider: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  credentials: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  accountNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  isActive: z.union([ z.lazy(() => BoolFilterSchema), z.boolean() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const CarrierAccountOrderByWithRelationInputSchema: z.ZodType<Prisma.CarrierAccountOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  provider: z.lazy(() => SortOrderSchema).optional(),
  credentials: z.lazy(() => SortOrderSchema).optional(),
  accountNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  isActive: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const CarrierAccountWhereUniqueInputSchema: z.ZodType<Prisma.CarrierAccountWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => CarrierAccountWhereInputSchema), z.lazy(() => CarrierAccountWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => CarrierAccountWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => CarrierAccountWhereInputSchema), z.lazy(() => CarrierAccountWhereInputSchema).array() ]).optional(),
  provider: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  credentials: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  accountNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  isActive: z.union([ z.lazy(() => BoolFilterSchema), z.boolean() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const CarrierAccountOrderByWithAggregationInputSchema: z.ZodType<Prisma.CarrierAccountOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  provider: z.lazy(() => SortOrderSchema).optional(),
  credentials: z.lazy(() => SortOrderSchema).optional(),
  accountNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  isActive: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => CarrierAccountCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => CarrierAccountMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => CarrierAccountMinOrderByAggregateInputSchema).optional(),
}).strict();

export const CarrierAccountScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.CarrierAccountScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => CarrierAccountScalarWhereWithAggregatesInputSchema), z.lazy(() => CarrierAccountScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => CarrierAccountScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => CarrierAccountScalarWhereWithAggregatesInputSchema), z.lazy(() => CarrierAccountScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  provider: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  credentials: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  accountNumber: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  description: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  isActive: z.union([ z.lazy(() => BoolWithAggregatesFilterSchema), z.boolean() ]).optional(),
  userId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ShipmentCarrierMetaWhereInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentCarrierMetaWhereInputSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentCarrierMetaWhereInputSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  rateQuoteJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  bookingResponseJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  labelUrl: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  carrierCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  serviceLevelCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  trackingNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  bookedAt: z.union([ z.lazy(() => DateTimeNullableFilterSchema), z.coerce.date() ]).optional().nullable(),
  shipment: z.union([ z.lazy(() => ShipmentScalarRelationFilterSchema), z.lazy(() => ShipmentWhereInputSchema) ]).optional(),
}).strict();

export const ShipmentCarrierMetaOrderByWithRelationInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  rateQuoteJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  bookingResponseJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  labelUrl: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  carrierCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  serviceLevelCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  trackingNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  bookedAt: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipment: z.lazy(() => ShipmentOrderByWithRelationInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaWhereUniqueInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaWhereUniqueInput> = z.union([
  z.object({
    id: z.uuid(),
    shipmentId: z.string(),
  }),
  z.object({
    id: z.uuid(),
  }),
  z.object({
    shipmentId: z.string(),
  }),
])
.and(z.object({
  id: z.uuid().optional(),
  shipmentId: z.string().optional(),
  AND: z.union([ z.lazy(() => ShipmentCarrierMetaWhereInputSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentCarrierMetaWhereInputSchema), z.lazy(() => ShipmentCarrierMetaWhereInputSchema).array() ]).optional(),
  rateQuoteJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  bookingResponseJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  labelUrl: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  carrierCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  serviceLevelCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  trackingNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  bookedAt: z.union([ z.lazy(() => DateTimeNullableFilterSchema), z.coerce.date() ]).optional().nullable(),
  shipment: z.union([ z.lazy(() => ShipmentScalarRelationFilterSchema), z.lazy(() => ShipmentWhereInputSchema) ]).optional(),
}).strict());

export const ShipmentCarrierMetaOrderByWithAggregationInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  rateQuoteJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  bookingResponseJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  labelUrl: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  carrierCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  serviceLevelCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  trackingNumber: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  bookedAt: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  _count: z.lazy(() => ShipmentCarrierMetaCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ShipmentCarrierMetaMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ShipmentCarrierMetaMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  rateQuoteJson: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  bookingResponseJson: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  labelUrl: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  carrierCode: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  serviceLevelCode: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  trackingNumber: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  bookedAt: z.union([ z.lazy(() => DateTimeNullableWithAggregatesFilterSchema), z.coerce.date() ]).optional().nullable(),
}).strict();

export const ForwarderProfileWhereInputSchema: z.ZodType<Prisma.ForwarderProfileWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ForwarderProfileWhereInputSchema), z.lazy(() => ForwarderProfileWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ForwarderProfileWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ForwarderProfileWhereInputSchema), z.lazy(() => ForwarderProfileWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  emailToJson: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  emailSubjectTemplate: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  dataBundleFormat: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
}).strict();

export const ForwarderProfileOrderByWithRelationInputSchema: z.ZodType<Prisma.ForwarderProfileOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  emailToJson: z.lazy(() => SortOrderSchema).optional(),
  emailSubjectTemplate: z.lazy(() => SortOrderSchema).optional(),
  dataBundleFormat: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ForwarderProfileWhereUniqueInputSchema: z.ZodType<Prisma.ForwarderProfileWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => ForwarderProfileWhereInputSchema), z.lazy(() => ForwarderProfileWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ForwarderProfileWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ForwarderProfileWhereInputSchema), z.lazy(() => ForwarderProfileWhereInputSchema).array() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  emailToJson: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  emailSubjectTemplate: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  dataBundleFormat: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
}).strict());

export const ForwarderProfileOrderByWithAggregationInputSchema: z.ZodType<Prisma.ForwarderProfileOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  emailToJson: z.lazy(() => SortOrderSchema).optional(),
  emailSubjectTemplate: z.lazy(() => SortOrderSchema).optional(),
  dataBundleFormat: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ForwarderProfileCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ForwarderProfileMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ForwarderProfileMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ForwarderProfileScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ForwarderProfileScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ForwarderProfileScalarWhereWithAggregatesInputSchema), z.lazy(() => ForwarderProfileScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ForwarderProfileScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ForwarderProfileScalarWhereWithAggregatesInputSchema), z.lazy(() => ForwarderProfileScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  emailToJson: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  emailSubjectTemplate: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  dataBundleFormat: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
}).strict();

export const ProductWhereInputSchema: z.ZodType<Prisma.ProductWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ProductWhereInputSchema), z.lazy(() => ProductWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProductWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProductWhereInputSchema), z.lazy(() => ProductWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  sku: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  htsCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  unitWeight: z.union([ z.lazy(() => FloatNullableFilterSchema), z.number() ]).optional().nullable(),
  unitValue: z.union([ z.lazy(() => DecimalNullableFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  createdByUserId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ProductOrderByWithRelationInputSchema: z.ZodType<Prisma.ProductOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  sku: z.lazy(() => SortOrderSchema).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  htsCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  unitWeight: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  unitValue: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdByUserId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductWhereUniqueInputSchema: z.ZodType<Prisma.ProductWhereUniqueInput> = z.union([
  z.object({
    id: z.uuid(),
    sku: z.string(),
  }),
  z.object({
    id: z.uuid(),
  }),
  z.object({
    sku: z.string(),
  }),
])
.and(z.object({
  id: z.uuid().optional(),
  sku: z.string().optional(),
  AND: z.union([ z.lazy(() => ProductWhereInputSchema), z.lazy(() => ProductWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProductWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProductWhereInputSchema), z.lazy(() => ProductWhereInputSchema).array() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  htsCode: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  unitWeight: z.union([ z.lazy(() => FloatNullableFilterSchema), z.number() ]).optional().nullable(),
  unitValue: z.union([ z.lazy(() => DecimalNullableFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  createdByUserId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const ProductOrderByWithAggregationInputSchema: z.ZodType<Prisma.ProductOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  sku: z.lazy(() => SortOrderSchema).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  htsCode: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  unitWeight: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  unitValue: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdByUserId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ProductCountOrderByAggregateInputSchema).optional(),
  _avg: z.lazy(() => ProductAvgOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ProductMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ProductMinOrderByAggregateInputSchema).optional(),
  _sum: z.lazy(() => ProductSumOrderByAggregateInputSchema).optional(),
}).strict();

export const ProductScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ProductScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ProductScalarWhereWithAggregatesInputSchema), z.lazy(() => ProductScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ProductScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ProductScalarWhereWithAggregatesInputSchema), z.lazy(() => ProductScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  sku: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  htsCode: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  unitWeight: z.union([ z.lazy(() => FloatNullableWithAggregatesFilterSchema), z.number() ]).optional().nullable(),
  unitValue: z.union([ z.lazy(() => DecimalNullableWithAggregatesFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  createdByUserId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const SanctionsCheckResultWhereInputSchema: z.ZodType<Prisma.SanctionsCheckResultWhereInput> = z.object({
  AND: z.union([ z.lazy(() => SanctionsCheckResultWhereInputSchema), z.lazy(() => SanctionsCheckResultWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => SanctionsCheckResultWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => SanctionsCheckResultWhereInputSchema), z.lazy(() => SanctionsCheckResultWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  responseJson: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  checkDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const SanctionsCheckResultOrderByWithRelationInputSchema: z.ZodType<Prisma.SanctionsCheckResultOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  responseJson: z.lazy(() => SortOrderSchema).optional(),
  checkDate: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const SanctionsCheckResultWhereUniqueInputSchema: z.ZodType<Prisma.SanctionsCheckResultWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => SanctionsCheckResultWhereInputSchema), z.lazy(() => SanctionsCheckResultWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => SanctionsCheckResultWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => SanctionsCheckResultWhereInputSchema), z.lazy(() => SanctionsCheckResultWhereInputSchema).array() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  responseJson: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  checkDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const SanctionsCheckResultOrderByWithAggregationInputSchema: z.ZodType<Prisma.SanctionsCheckResultOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  responseJson: z.lazy(() => SortOrderSchema).optional(),
  checkDate: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => SanctionsCheckResultCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => SanctionsCheckResultMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => SanctionsCheckResultMinOrderByAggregateInputSchema).optional(),
}).strict();

export const SanctionsCheckResultScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.SanctionsCheckResultScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => SanctionsCheckResultScalarWhereWithAggregatesInputSchema), z.lazy(() => SanctionsCheckResultScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => SanctionsCheckResultScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => SanctionsCheckResultScalarWhereWithAggregatesInputSchema), z.lazy(() => SanctionsCheckResultScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  responseJson: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  checkDate: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ShipmentTemplateWhereInputSchema: z.ZodType<Prisma.ShipmentTemplateWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentTemplateWhereInputSchema), z.lazy(() => ShipmentTemplateWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentTemplateWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentTemplateWhereInputSchema), z.lazy(() => ShipmentTemplateWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  incoterm: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipperId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  lineItemsJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ShipmentTemplateOrderByWithRelationInputSchema: z.ZodType<Prisma.ShipmentTemplateOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  incoterm: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  destinationCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipperId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  lineItemsJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentTemplateWhereUniqueInputSchema: z.ZodType<Prisma.ShipmentTemplateWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => ShipmentTemplateWhereInputSchema), z.lazy(() => ShipmentTemplateWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentTemplateWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentTemplateWhereInputSchema), z.lazy(() => ShipmentTemplateWhereInputSchema).array() ]).optional(),
  name: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  incoterm: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipperId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  lineItemsJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const ShipmentTemplateOrderByWithAggregationInputSchema: z.ZodType<Prisma.ShipmentTemplateOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  incoterm: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  originCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  destinationCountry: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  shipperId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  consigneeId: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  lineItemsJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ShipmentTemplateCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ShipmentTemplateMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ShipmentTemplateMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ShipmentTemplateScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ShipmentTemplateScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentTemplateScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentTemplateScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentTemplateScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentTemplateScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentTemplateScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  name: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  description: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  incoterm: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  shipperId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  lineItemsJson: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  userId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const DocumentWhereInputSchema: z.ZodType<Prisma.DocumentWhereInput> = z.object({
  AND: z.union([ z.lazy(() => DocumentWhereInputSchema), z.lazy(() => DocumentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => DocumentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => DocumentWhereInputSchema), z.lazy(() => DocumentWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  filename: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  storageKey: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  meta: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const DocumentOrderByWithRelationInputSchema: z.ZodType<Prisma.DocumentOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  filename: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  storageKey: z.lazy(() => SortOrderSchema).optional(),
  meta: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DocumentWhereUniqueInputSchema: z.ZodType<Prisma.DocumentWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => DocumentWhereInputSchema), z.lazy(() => DocumentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => DocumentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => DocumentWhereInputSchema), z.lazy(() => DocumentWhereInputSchema).array() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  filename: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  storageKey: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  meta: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const DocumentOrderByWithAggregationInputSchema: z.ZodType<Prisma.DocumentOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  filename: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  storageKey: z.lazy(() => SortOrderSchema).optional(),
  meta: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => DocumentCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => DocumentMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => DocumentMinOrderByAggregateInputSchema).optional(),
}).strict();

export const DocumentScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.DocumentScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => DocumentScalarWhereWithAggregatesInputSchema), z.lazy(() => DocumentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => DocumentScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => DocumentScalarWhereWithAggregatesInputSchema), z.lazy(() => DocumentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  shipmentId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  filename: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  type: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  storageKey: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  meta: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const UserWhereInputSchema: z.ZodType<Prisma.UserWhereInput> = z.object({
  AND: z.union([ z.lazy(() => UserWhereInputSchema), z.lazy(() => UserWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => UserWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => UserWhereInputSchema), z.lazy(() => UserWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  username: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  password: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const UserOrderByWithRelationInputSchema: z.ZodType<Prisma.UserOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  username: z.lazy(() => SortOrderSchema).optional(),
  password: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const UserWhereUniqueInputSchema: z.ZodType<Prisma.UserWhereUniqueInput> = z.union([
  z.object({
    id: z.uuid(),
    username: z.string(),
  }),
  z.object({
    id: z.uuid(),
  }),
  z.object({
    username: z.string(),
  }),
])
.and(z.object({
  id: z.uuid().optional(),
  username: z.string().optional(),
  AND: z.union([ z.lazy(() => UserWhereInputSchema), z.lazy(() => UserWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => UserWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => UserWhereInputSchema), z.lazy(() => UserWhereInputSchema).array() ]).optional(),
  password: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const UserOrderByWithAggregationInputSchema: z.ZodType<Prisma.UserOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  username: z.lazy(() => SortOrderSchema).optional(),
  password: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => UserCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => UserMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => UserMinOrderByAggregateInputSchema).optional(),
}).strict();

export const UserScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.UserScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => UserScalarWhereWithAggregatesInputSchema), z.lazy(() => UserScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => UserScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => UserScalarWhereWithAggregatesInputSchema), z.lazy(() => UserScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  username: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  password: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  role: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ErpExportConfigWhereInputSchema: z.ZodType<Prisma.ErpExportConfigWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ErpExportConfigWhereInputSchema), z.lazy(() => ErpExportConfigWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportConfigWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportConfigWhereInputSchema), z.lazy(() => ErpExportConfigWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  destination: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  httpHeadersJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  endpointUrl: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ErpExportConfigOrderByWithRelationInputSchema: z.ZodType<Prisma.ErpExportConfigOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  destination: z.lazy(() => SortOrderSchema).optional(),
  httpHeadersJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  endpointUrl: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportConfigWhereUniqueInputSchema: z.ZodType<Prisma.ErpExportConfigWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => ErpExportConfigWhereInputSchema), z.lazy(() => ErpExportConfigWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportConfigWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportConfigWhereInputSchema), z.lazy(() => ErpExportConfigWhereInputSchema).array() ]).optional(),
  destination: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  httpHeadersJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  endpointUrl: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const ErpExportConfigOrderByWithAggregationInputSchema: z.ZodType<Prisma.ErpExportConfigOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  destination: z.lazy(() => SortOrderSchema).optional(),
  httpHeadersJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  endpointUrl: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ErpExportConfigCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ErpExportConfigMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ErpExportConfigMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ErpExportConfigScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ErpExportConfigScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ErpExportConfigScalarWhereWithAggregatesInputSchema), z.lazy(() => ErpExportConfigScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportConfigScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportConfigScalarWhereWithAggregatesInputSchema), z.lazy(() => ErpExportConfigScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  destination: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  httpHeadersJson: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  endpointUrl: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  userId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ErpExportJobWhereInputSchema: z.ZodType<Prisma.ErpExportJobWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ErpExportJobWhereInputSchema), z.lazy(() => ErpExportJobWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportJobWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportJobWhereInputSchema), z.lazy(() => ErpExportJobWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  configId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  fromDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  toDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  resultSummaryJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ErpExportJobOrderByWithRelationInputSchema: z.ZodType<Prisma.ErpExportJobOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  configId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  fromDate: z.lazy(() => SortOrderSchema).optional(),
  toDate: z.lazy(() => SortOrderSchema).optional(),
  resultSummaryJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportJobWhereUniqueInputSchema: z.ZodType<Prisma.ErpExportJobWhereUniqueInput> = z.object({
  id: z.uuid(),
})
.and(z.object({
  id: z.uuid().optional(),
  AND: z.union([ z.lazy(() => ErpExportJobWhereInputSchema), z.lazy(() => ErpExportJobWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportJobWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportJobWhereInputSchema), z.lazy(() => ErpExportJobWhereInputSchema).array() ]).optional(),
  configId: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  fromDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  toDate: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  resultSummaryJson: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict());

export const ErpExportJobOrderByWithAggregationInputSchema: z.ZodType<Prisma.ErpExportJobOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  configId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  fromDate: z.lazy(() => SortOrderSchema).optional(),
  toDate: z.lazy(() => SortOrderSchema).optional(),
  resultSummaryJson: z.union([ z.lazy(() => SortOrderSchema), z.lazy(() => SortOrderInputSchema) ]).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ErpExportJobCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ErpExportJobMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ErpExportJobMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ErpExportJobScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ErpExportJobScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ErpExportJobScalarWhereWithAggregatesInputSchema), z.lazy(() => ErpExportJobScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ErpExportJobScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ErpExportJobScalarWhereWithAggregatesInputSchema), z.lazy(() => ErpExportJobScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  configId: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  status: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
  fromDate: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  toDate: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
  resultSummaryJson: z.union([ z.lazy(() => StringNullableWithAggregatesFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeWithAggregatesFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const PartyCreateInputSchema: z.ZodType<Prisma.PartyCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentCreateNestedManyWithoutShipperInputSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentCreateNestedManyWithoutConsigneeInputSchema).optional(),
}).strict();

export const PartyUncheckedCreateInputSchema: z.ZodType<Prisma.PartyUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUncheckedCreateNestedManyWithoutShipperInputSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUncheckedCreateNestedManyWithoutConsigneeInputSchema).optional(),
}).strict();

export const PartyUpdateInputSchema: z.ZodType<Prisma.PartyUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUpdateManyWithoutShipperNestedInputSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUpdateManyWithoutConsigneeNestedInputSchema).optional(),
}).strict();

export const PartyUncheckedUpdateInputSchema: z.ZodType<Prisma.PartyUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUncheckedUpdateManyWithoutShipperNestedInputSchema).optional(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUncheckedUpdateManyWithoutConsigneeNestedInputSchema).optional(),
}).strict();

export const PartyCreateManyInputSchema: z.ZodType<Prisma.PartyCreateManyInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
}).strict();

export const PartyUpdateManyMutationInputSchema: z.ZodType<Prisma.PartyUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const PartyUncheckedUpdateManyInputSchema: z.ZodType<Prisma.PartyUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentCreateInputSchema: z.ZodType<Prisma.ShipmentCreateInput> = z.object({
  id: z.uuid().optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  shipper: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsShipperInputSchema).optional(),
  consignee: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsConsigneeInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentUncheckedCreateInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentUpdateInputSchema: z.ZodType<Prisma.ShipmentUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  shipper: z.lazy(() => PartyUpdateOneWithoutShipmentsAsShipperNestedInputSchema).optional(),
  consignee: z.lazy(() => PartyUpdateOneWithoutShipmentsAsConsigneeNestedInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentCreateManyInputSchema: z.ZodType<Prisma.ShipmentCreateManyInput> = z.object({
  id: z.uuid().optional(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentUpdateManyMutationInputSchema: z.ZodType<Prisma.ShipmentUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const CarrierAccountCreateInputSchema: z.ZodType<Prisma.CarrierAccountCreateInput> = z.object({
  id: z.uuid().optional(),
  provider: z.string(),
  credentials: z.string(),
  accountNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const CarrierAccountUncheckedCreateInputSchema: z.ZodType<Prisma.CarrierAccountUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  provider: z.string(),
  credentials: z.string(),
  accountNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const CarrierAccountUpdateInputSchema: z.ZodType<Prisma.CarrierAccountUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  provider: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  credentials: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  accountNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isActive: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const CarrierAccountUncheckedUpdateInputSchema: z.ZodType<Prisma.CarrierAccountUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  provider: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  credentials: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  accountNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isActive: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const CarrierAccountCreateManyInputSchema: z.ZodType<Prisma.CarrierAccountCreateManyInput> = z.object({
  id: z.uuid().optional(),
  provider: z.string(),
  credentials: z.string(),
  accountNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const CarrierAccountUpdateManyMutationInputSchema: z.ZodType<Prisma.CarrierAccountUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  provider: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  credentials: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  accountNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isActive: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const CarrierAccountUncheckedUpdateManyInputSchema: z.ZodType<Prisma.CarrierAccountUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  provider: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  credentials: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  accountNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isActive: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentCarrierMetaCreateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateInput> = z.object({
  id: z.uuid().optional(),
  rateQuoteJson: z.string().optional().nullable(),
  bookingResponseJson: z.string().optional().nullable(),
  labelUrl: z.string().optional().nullable(),
  carrierCode: z.string().optional().nullable(),
  serviceLevelCode: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  bookedAt: z.coerce.date().optional().nullable(),
  shipment: z.lazy(() => ShipmentCreateNestedOneWithoutCarrierMetaInputSchema),
}).strict();

export const ShipmentCarrierMetaUncheckedCreateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  rateQuoteJson: z.string().optional().nullable(),
  bookingResponseJson: z.string().optional().nullable(),
  labelUrl: z.string().optional().nullable(),
  carrierCode: z.string().optional().nullable(),
  serviceLevelCode: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  bookedAt: z.coerce.date().optional().nullable(),
}).strict();

export const ShipmentCarrierMetaUpdateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipment: z.lazy(() => ShipmentUpdateOneRequiredWithoutCarrierMetaNestedInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaUncheckedUpdateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentCarrierMetaCreateManyInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateManyInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  rateQuoteJson: z.string().optional().nullable(),
  bookingResponseJson: z.string().optional().nullable(),
  labelUrl: z.string().optional().nullable(),
  carrierCode: z.string().optional().nullable(),
  serviceLevelCode: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  bookedAt: z.coerce.date().optional().nullable(),
}).strict();

export const ShipmentCarrierMetaUpdateManyMutationInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentCarrierMetaUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ForwarderProfileCreateInputSchema: z.ZodType<Prisma.ForwarderProfileCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  emailToJson: z.string(),
  emailSubjectTemplate: z.string(),
  dataBundleFormat: z.string(),
  userId: z.string(),
}).strict();

export const ForwarderProfileUncheckedCreateInputSchema: z.ZodType<Prisma.ForwarderProfileUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  emailToJson: z.string(),
  emailSubjectTemplate: z.string(),
  dataBundleFormat: z.string(),
  userId: z.string(),
}).strict();

export const ForwarderProfileUpdateInputSchema: z.ZodType<Prisma.ForwarderProfileUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailToJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailSubjectTemplate: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  dataBundleFormat: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ForwarderProfileUncheckedUpdateInputSchema: z.ZodType<Prisma.ForwarderProfileUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailToJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailSubjectTemplate: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  dataBundleFormat: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ForwarderProfileCreateManyInputSchema: z.ZodType<Prisma.ForwarderProfileCreateManyInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  emailToJson: z.string(),
  emailSubjectTemplate: z.string(),
  dataBundleFormat: z.string(),
  userId: z.string(),
}).strict();

export const ForwarderProfileUpdateManyMutationInputSchema: z.ZodType<Prisma.ForwarderProfileUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailToJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailSubjectTemplate: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  dataBundleFormat: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ForwarderProfileUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ForwarderProfileUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailToJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  emailSubjectTemplate: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  dataBundleFormat: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ProductCreateInputSchema: z.ZodType<Prisma.ProductCreateInput> = z.object({
  id: z.uuid().optional(),
  sku: z.string(),
  description: z.string().optional().nullable(),
  htsCode: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  unitWeight: z.number().optional().nullable(),
  unitValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  createdByUserId: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ProductUncheckedCreateInputSchema: z.ZodType<Prisma.ProductUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  sku: z.string(),
  description: z.string().optional().nullable(),
  htsCode: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  unitWeight: z.number().optional().nullable(),
  unitValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  createdByUserId: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ProductUpdateInputSchema: z.ZodType<Prisma.ProductUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  sku: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  htsCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ProductUncheckedUpdateInputSchema: z.ZodType<Prisma.ProductUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  sku: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  htsCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ProductCreateManyInputSchema: z.ZodType<Prisma.ProductCreateManyInput> = z.object({
  id: z.uuid().optional(),
  sku: z.string(),
  description: z.string().optional().nullable(),
  htsCode: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  unitWeight: z.number().optional().nullable(),
  unitValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  createdByUserId: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ProductUpdateManyMutationInputSchema: z.ZodType<Prisma.ProductUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  sku: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  htsCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ProductUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ProductUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  sku: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  htsCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  unitValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const SanctionsCheckResultCreateInputSchema: z.ZodType<Prisma.SanctionsCheckResultCreateInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  status: z.string(),
  responseJson: z.string(),
  checkDate: z.coerce.date().optional(),
}).strict();

export const SanctionsCheckResultUncheckedCreateInputSchema: z.ZodType<Prisma.SanctionsCheckResultUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  status: z.string(),
  responseJson: z.string(),
  checkDate: z.coerce.date().optional(),
}).strict();

export const SanctionsCheckResultUpdateInputSchema: z.ZodType<Prisma.SanctionsCheckResultUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  responseJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  checkDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const SanctionsCheckResultUncheckedUpdateInputSchema: z.ZodType<Prisma.SanctionsCheckResultUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  responseJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  checkDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const SanctionsCheckResultCreateManyInputSchema: z.ZodType<Prisma.SanctionsCheckResultCreateManyInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  status: z.string(),
  responseJson: z.string(),
  checkDate: z.coerce.date().optional(),
}).strict();

export const SanctionsCheckResultUpdateManyMutationInputSchema: z.ZodType<Prisma.SanctionsCheckResultUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  responseJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  checkDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const SanctionsCheckResultUncheckedUpdateManyInputSchema: z.ZodType<Prisma.SanctionsCheckResultUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  responseJson: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  checkDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentTemplateCreateInputSchema: z.ZodType<Prisma.ShipmentTemplateCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  description: z.string().optional().nullable(),
  incoterm: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  lineItemsJson: z.string().optional().nullable(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentTemplateUncheckedCreateInputSchema: z.ZodType<Prisma.ShipmentTemplateUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  description: z.string().optional().nullable(),
  incoterm: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  lineItemsJson: z.string().optional().nullable(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentTemplateUpdateInputSchema: z.ZodType<Prisma.ShipmentTemplateUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  lineItemsJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentTemplateUncheckedUpdateInputSchema: z.ZodType<Prisma.ShipmentTemplateUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  lineItemsJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentTemplateCreateManyInputSchema: z.ZodType<Prisma.ShipmentTemplateCreateManyInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  description: z.string().optional().nullable(),
  incoterm: z.string().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  lineItemsJson: z.string().optional().nullable(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentTemplateUpdateManyMutationInputSchema: z.ZodType<Prisma.ShipmentTemplateUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  lineItemsJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentTemplateUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ShipmentTemplateUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  description: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  lineItemsJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const DocumentCreateInputSchema: z.ZodType<Prisma.DocumentCreateInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  filename: z.string(),
  type: z.string(),
  status: z.string(),
  storageKey: z.string(),
  meta: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const DocumentUncheckedCreateInputSchema: z.ZodType<Prisma.DocumentUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  filename: z.string(),
  type: z.string(),
  status: z.string(),
  storageKey: z.string(),
  meta: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const DocumentUpdateInputSchema: z.ZodType<Prisma.DocumentUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  filename: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  storageKey: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  meta: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const DocumentUncheckedUpdateInputSchema: z.ZodType<Prisma.DocumentUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  filename: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  storageKey: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  meta: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const DocumentCreateManyInputSchema: z.ZodType<Prisma.DocumentCreateManyInput> = z.object({
  id: z.uuid().optional(),
  shipmentId: z.string(),
  filename: z.string(),
  type: z.string(),
  status: z.string(),
  storageKey: z.string(),
  meta: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const DocumentUpdateManyMutationInputSchema: z.ZodType<Prisma.DocumentUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  filename: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  storageKey: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  meta: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const DocumentUncheckedUpdateManyInputSchema: z.ZodType<Prisma.DocumentUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipmentId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  filename: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  type: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  storageKey: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  meta: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const UserCreateInputSchema: z.ZodType<Prisma.UserCreateInput> = z.object({
  id: z.uuid().optional(),
  username: z.string(),
  password: z.string(),
  role: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const UserUncheckedCreateInputSchema: z.ZodType<Prisma.UserUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  username: z.string(),
  password: z.string(),
  role: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const UserUpdateInputSchema: z.ZodType<Prisma.UserUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  username: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  password: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const UserUncheckedUpdateInputSchema: z.ZodType<Prisma.UserUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  username: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  password: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const UserCreateManyInputSchema: z.ZodType<Prisma.UserCreateManyInput> = z.object({
  id: z.uuid().optional(),
  username: z.string(),
  password: z.string(),
  role: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const UserUpdateManyMutationInputSchema: z.ZodType<Prisma.UserUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  username: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  password: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const UserUncheckedUpdateManyInputSchema: z.ZodType<Prisma.UserUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  username: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  password: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  role: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportConfigCreateInputSchema: z.ZodType<Prisma.ErpExportConfigCreateInput> = z.object({
  id: z.uuid().optional(),
  destination: z.string(),
  httpHeadersJson: z.string().optional().nullable(),
  endpointUrl: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportConfigUncheckedCreateInputSchema: z.ZodType<Prisma.ErpExportConfigUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  destination: z.string(),
  httpHeadersJson: z.string().optional().nullable(),
  endpointUrl: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportConfigUpdateInputSchema: z.ZodType<Prisma.ErpExportConfigUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  destination: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  httpHeadersJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  endpointUrl: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportConfigUncheckedUpdateInputSchema: z.ZodType<Prisma.ErpExportConfigUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  destination: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  httpHeadersJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  endpointUrl: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportConfigCreateManyInputSchema: z.ZodType<Prisma.ErpExportConfigCreateManyInput> = z.object({
  id: z.uuid().optional(),
  destination: z.string(),
  httpHeadersJson: z.string().optional().nullable(),
  endpointUrl: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportConfigUpdateManyMutationInputSchema: z.ZodType<Prisma.ErpExportConfigUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  destination: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  httpHeadersJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  endpointUrl: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportConfigUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ErpExportConfigUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  destination: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  httpHeadersJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  endpointUrl: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  userId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportJobCreateInputSchema: z.ZodType<Prisma.ErpExportJobCreateInput> = z.object({
  id: z.uuid().optional(),
  configId: z.string(),
  status: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  resultSummaryJson: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportJobUncheckedCreateInputSchema: z.ZodType<Prisma.ErpExportJobUncheckedCreateInput> = z.object({
  id: z.uuid().optional(),
  configId: z.string(),
  status: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  resultSummaryJson: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportJobUpdateInputSchema: z.ZodType<Prisma.ErpExportJobUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  configId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  fromDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  toDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  resultSummaryJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportJobUncheckedUpdateInputSchema: z.ZodType<Prisma.ErpExportJobUncheckedUpdateInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  configId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  fromDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  toDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  resultSummaryJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportJobCreateManyInputSchema: z.ZodType<Prisma.ErpExportJobCreateManyInput> = z.object({
  id: z.uuid().optional(),
  configId: z.string(),
  status: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  resultSummaryJson: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
}).strict();

export const ErpExportJobUpdateManyMutationInputSchema: z.ZodType<Prisma.ErpExportJobUpdateManyMutationInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  configId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  fromDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  toDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  resultSummaryJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ErpExportJobUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ErpExportJobUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  configId: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  fromDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  toDate: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  resultSummaryJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const StringFilterSchema: z.ZodType<Prisma.StringFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const StringNullableFilterSchema: z.ZodType<Prisma.StringNullableFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const BoolFilterSchema: z.ZodType<Prisma.BoolFilter> = z.object({
  equals: z.boolean().optional(),
  not: z.union([ z.boolean(),z.lazy(() => NestedBoolFilterSchema) ]).optional(),
}).strict();

export const ShipmentListRelationFilterSchema: z.ZodType<Prisma.ShipmentListRelationFilter> = z.object({
  every: z.lazy(() => ShipmentWhereInputSchema).optional(),
  some: z.lazy(() => ShipmentWhereInputSchema).optional(),
  none: z.lazy(() => ShipmentWhereInputSchema).optional(),
}).strict();

export const SortOrderInputSchema: z.ZodType<Prisma.SortOrderInput> = z.object({
  sort: z.lazy(() => SortOrderSchema),
  nulls: z.lazy(() => NullsOrderSchema).optional(),
}).strict();

export const ShipmentOrderByRelationAggregateInputSchema: z.ZodType<Prisma.ShipmentOrderByRelationAggregateInput> = z.object({
  _count: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const PartyCountOrderByAggregateInputSchema: z.ZodType<Prisma.PartyCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  address: z.lazy(() => SortOrderSchema).optional(),
  city: z.lazy(() => SortOrderSchema).optional(),
  country: z.lazy(() => SortOrderSchema).optional(),
  contactName: z.lazy(() => SortOrderSchema).optional(),
  phone: z.lazy(() => SortOrderSchema).optional(),
  email: z.lazy(() => SortOrderSchema).optional(),
  taxIdOrEori: z.lazy(() => SortOrderSchema).optional(),
  isAddressBookEntry: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const PartyMaxOrderByAggregateInputSchema: z.ZodType<Prisma.PartyMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  address: z.lazy(() => SortOrderSchema).optional(),
  city: z.lazy(() => SortOrderSchema).optional(),
  country: z.lazy(() => SortOrderSchema).optional(),
  contactName: z.lazy(() => SortOrderSchema).optional(),
  phone: z.lazy(() => SortOrderSchema).optional(),
  email: z.lazy(() => SortOrderSchema).optional(),
  taxIdOrEori: z.lazy(() => SortOrderSchema).optional(),
  isAddressBookEntry: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const PartyMinOrderByAggregateInputSchema: z.ZodType<Prisma.PartyMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  address: z.lazy(() => SortOrderSchema).optional(),
  city: z.lazy(() => SortOrderSchema).optional(),
  country: z.lazy(() => SortOrderSchema).optional(),
  contactName: z.lazy(() => SortOrderSchema).optional(),
  phone: z.lazy(() => SortOrderSchema).optional(),
  email: z.lazy(() => SortOrderSchema).optional(),
  taxIdOrEori: z.lazy(() => SortOrderSchema).optional(),
  isAddressBookEntry: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const StringWithAggregatesFilterSchema: z.ZodType<Prisma.StringWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional(),
}).strict();

export const StringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.StringNullableWithAggregatesFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional(),
}).strict();

export const BoolWithAggregatesFilterSchema: z.ZodType<Prisma.BoolWithAggregatesFilter> = z.object({
  equals: z.boolean().optional(),
  not: z.union([ z.boolean(),z.lazy(() => NestedBoolWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedBoolFilterSchema).optional(),
  _max: z.lazy(() => NestedBoolFilterSchema).optional(),
}).strict();

export const JsonNullableFilterSchema: z.ZodType<Prisma.JsonNullableFilter> = z.object({
  equals: InputJsonValueSchema.optional(),
  path: z.string().array().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  string_contains: z.string().optional(),
  string_starts_with: z.string().optional(),
  string_ends_with: z.string().optional(),
  array_starts_with: InputJsonValueSchema.optional().nullable(),
  array_ends_with: InputJsonValueSchema.optional().nullable(),
  array_contains: InputJsonValueSchema.optional().nullable(),
  lt: InputJsonValueSchema.optional(),
  lte: InputJsonValueSchema.optional(),
  gt: InputJsonValueSchema.optional(),
  gte: InputJsonValueSchema.optional(),
  not: InputJsonValueSchema.optional(),
}).strict();

export const DecimalNullableFilterSchema: z.ZodType<Prisma.DecimalNullableFilter> = z.object({
  equals: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  in: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  notIn: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  lt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  lte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  not: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NestedDecimalNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const FloatNullableFilterSchema: z.ZodType<Prisma.FloatNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const IntNullableFilterSchema: z.ZodType<Prisma.IntNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const DateTimeFilterSchema: z.ZodType<Prisma.DateTimeFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const PartyNullableScalarRelationFilterSchema: z.ZodType<Prisma.PartyNullableScalarRelationFilter> = z.object({
  is: z.lazy(() => PartyWhereInputSchema).optional().nullable(),
  isNot: z.lazy(() => PartyWhereInputSchema).optional().nullable(),
}).strict();

export const ShipmentCarrierMetaNullableScalarRelationFilterSchema: z.ZodType<Prisma.ShipmentCarrierMetaNullableScalarRelationFilter> = z.object({
  is: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).optional().nullable(),
  isNot: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).optional().nullable(),
}).strict();

export const ShipmentCountOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  shipperSnapshot: z.lazy(() => SortOrderSchema).optional(),
  consigneeSnapshot: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  currency: z.lazy(() => SortOrderSchema).optional(),
  totalValue: z.lazy(() => SortOrderSchema).optional(),
  totalWeight: z.lazy(() => SortOrderSchema).optional(),
  numPackages: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentAvgOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentAvgOrderByAggregateInput> = z.object({
  totalValue: z.lazy(() => SortOrderSchema).optional(),
  totalWeight: z.lazy(() => SortOrderSchema).optional(),
  numPackages: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  currency: z.lazy(() => SortOrderSchema).optional(),
  totalValue: z.lazy(() => SortOrderSchema).optional(),
  totalWeight: z.lazy(() => SortOrderSchema).optional(),
  numPackages: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentMinOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  currency: z.lazy(() => SortOrderSchema).optional(),
  totalValue: z.lazy(() => SortOrderSchema).optional(),
  totalWeight: z.lazy(() => SortOrderSchema).optional(),
  numPackages: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentSumOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentSumOrderByAggregateInput> = z.object({
  totalValue: z.lazy(() => SortOrderSchema).optional(),
  totalWeight: z.lazy(() => SortOrderSchema).optional(),
  numPackages: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const JsonNullableWithAggregatesFilterSchema: z.ZodType<Prisma.JsonNullableWithAggregatesFilter> = z.object({
  equals: InputJsonValueSchema.optional(),
  path: z.string().array().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  string_contains: z.string().optional(),
  string_starts_with: z.string().optional(),
  string_ends_with: z.string().optional(),
  array_starts_with: InputJsonValueSchema.optional().nullable(),
  array_ends_with: InputJsonValueSchema.optional().nullable(),
  array_contains: InputJsonValueSchema.optional().nullable(),
  lt: InputJsonValueSchema.optional(),
  lte: InputJsonValueSchema.optional(),
  gt: InputJsonValueSchema.optional(),
  gte: InputJsonValueSchema.optional(),
  not: InputJsonValueSchema.optional(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedJsonNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedJsonNullableFilterSchema).optional(),
}).strict();

export const DecimalNullableWithAggregatesFilterSchema: z.ZodType<Prisma.DecimalNullableWithAggregatesFilter> = z.object({
  equals: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  in: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  notIn: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  lt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  lte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  not: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NestedDecimalNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
}).strict();

export const FloatNullableWithAggregatesFilterSchema: z.ZodType<Prisma.FloatNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
}).strict();

export const IntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.IntNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional(),
}).strict();

export const DateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional(),
}).strict();

export const CarrierAccountCountOrderByAggregateInputSchema: z.ZodType<Prisma.CarrierAccountCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  provider: z.lazy(() => SortOrderSchema).optional(),
  credentials: z.lazy(() => SortOrderSchema).optional(),
  accountNumber: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  isActive: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const CarrierAccountMaxOrderByAggregateInputSchema: z.ZodType<Prisma.CarrierAccountMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  provider: z.lazy(() => SortOrderSchema).optional(),
  credentials: z.lazy(() => SortOrderSchema).optional(),
  accountNumber: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  isActive: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const CarrierAccountMinOrderByAggregateInputSchema: z.ZodType<Prisma.CarrierAccountMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  provider: z.lazy(() => SortOrderSchema).optional(),
  credentials: z.lazy(() => SortOrderSchema).optional(),
  accountNumber: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  isActive: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DateTimeNullableFilterSchema: z.ZodType<Prisma.DateTimeNullableFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const ShipmentScalarRelationFilterSchema: z.ZodType<Prisma.ShipmentScalarRelationFilter> = z.object({
  is: z.lazy(() => ShipmentWhereInputSchema).optional(),
  isNot: z.lazy(() => ShipmentWhereInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaCountOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  rateQuoteJson: z.lazy(() => SortOrderSchema).optional(),
  bookingResponseJson: z.lazy(() => SortOrderSchema).optional(),
  labelUrl: z.lazy(() => SortOrderSchema).optional(),
  carrierCode: z.lazy(() => SortOrderSchema).optional(),
  serviceLevelCode: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  bookedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentCarrierMetaMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  rateQuoteJson: z.lazy(() => SortOrderSchema).optional(),
  bookingResponseJson: z.lazy(() => SortOrderSchema).optional(),
  labelUrl: z.lazy(() => SortOrderSchema).optional(),
  carrierCode: z.lazy(() => SortOrderSchema).optional(),
  serviceLevelCode: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  bookedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentCarrierMetaMinOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  rateQuoteJson: z.lazy(() => SortOrderSchema).optional(),
  bookingResponseJson: z.lazy(() => SortOrderSchema).optional(),
  labelUrl: z.lazy(() => SortOrderSchema).optional(),
  carrierCode: z.lazy(() => SortOrderSchema).optional(),
  serviceLevelCode: z.lazy(() => SortOrderSchema).optional(),
  trackingNumber: z.lazy(() => SortOrderSchema).optional(),
  bookedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.DateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
}).strict();

export const ForwarderProfileCountOrderByAggregateInputSchema: z.ZodType<Prisma.ForwarderProfileCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  emailToJson: z.lazy(() => SortOrderSchema).optional(),
  emailSubjectTemplate: z.lazy(() => SortOrderSchema).optional(),
  dataBundleFormat: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ForwarderProfileMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ForwarderProfileMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  emailToJson: z.lazy(() => SortOrderSchema).optional(),
  emailSubjectTemplate: z.lazy(() => SortOrderSchema).optional(),
  dataBundleFormat: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ForwarderProfileMinOrderByAggregateInputSchema: z.ZodType<Prisma.ForwarderProfileMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  emailToJson: z.lazy(() => SortOrderSchema).optional(),
  emailSubjectTemplate: z.lazy(() => SortOrderSchema).optional(),
  dataBundleFormat: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductCountOrderByAggregateInputSchema: z.ZodType<Prisma.ProductCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  sku: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  htsCode: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  unitWeight: z.lazy(() => SortOrderSchema).optional(),
  unitValue: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductAvgOrderByAggregateInputSchema: z.ZodType<Prisma.ProductAvgOrderByAggregateInput> = z.object({
  unitWeight: z.lazy(() => SortOrderSchema).optional(),
  unitValue: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ProductMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  sku: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  htsCode: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  unitWeight: z.lazy(() => SortOrderSchema).optional(),
  unitValue: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductMinOrderByAggregateInputSchema: z.ZodType<Prisma.ProductMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  sku: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  htsCode: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  unitWeight: z.lazy(() => SortOrderSchema).optional(),
  unitValue: z.lazy(() => SortOrderSchema).optional(),
  createdByUserId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ProductSumOrderByAggregateInputSchema: z.ZodType<Prisma.ProductSumOrderByAggregateInput> = z.object({
  unitWeight: z.lazy(() => SortOrderSchema).optional(),
  unitValue: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const SanctionsCheckResultCountOrderByAggregateInputSchema: z.ZodType<Prisma.SanctionsCheckResultCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  responseJson: z.lazy(() => SortOrderSchema).optional(),
  checkDate: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const SanctionsCheckResultMaxOrderByAggregateInputSchema: z.ZodType<Prisma.SanctionsCheckResultMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  responseJson: z.lazy(() => SortOrderSchema).optional(),
  checkDate: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const SanctionsCheckResultMinOrderByAggregateInputSchema: z.ZodType<Prisma.SanctionsCheckResultMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  responseJson: z.lazy(() => SortOrderSchema).optional(),
  checkDate: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentTemplateCountOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentTemplateCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  lineItemsJson: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentTemplateMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentTemplateMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  lineItemsJson: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentTemplateMinOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentTemplateMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  name: z.lazy(() => SortOrderSchema).optional(),
  description: z.lazy(() => SortOrderSchema).optional(),
  incoterm: z.lazy(() => SortOrderSchema).optional(),
  originCountry: z.lazy(() => SortOrderSchema).optional(),
  destinationCountry: z.lazy(() => SortOrderSchema).optional(),
  shipperId: z.lazy(() => SortOrderSchema).optional(),
  consigneeId: z.lazy(() => SortOrderSchema).optional(),
  lineItemsJson: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DocumentCountOrderByAggregateInputSchema: z.ZodType<Prisma.DocumentCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  filename: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  storageKey: z.lazy(() => SortOrderSchema).optional(),
  meta: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DocumentMaxOrderByAggregateInputSchema: z.ZodType<Prisma.DocumentMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  filename: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  storageKey: z.lazy(() => SortOrderSchema).optional(),
  meta: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const DocumentMinOrderByAggregateInputSchema: z.ZodType<Prisma.DocumentMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  shipmentId: z.lazy(() => SortOrderSchema).optional(),
  filename: z.lazy(() => SortOrderSchema).optional(),
  type: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  storageKey: z.lazy(() => SortOrderSchema).optional(),
  meta: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const UserCountOrderByAggregateInputSchema: z.ZodType<Prisma.UserCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  username: z.lazy(() => SortOrderSchema).optional(),
  password: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const UserMaxOrderByAggregateInputSchema: z.ZodType<Prisma.UserMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  username: z.lazy(() => SortOrderSchema).optional(),
  password: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const UserMinOrderByAggregateInputSchema: z.ZodType<Prisma.UserMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  username: z.lazy(() => SortOrderSchema).optional(),
  password: z.lazy(() => SortOrderSchema).optional(),
  role: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
  updatedAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportConfigCountOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportConfigCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  destination: z.lazy(() => SortOrderSchema).optional(),
  httpHeadersJson: z.lazy(() => SortOrderSchema).optional(),
  endpointUrl: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportConfigMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportConfigMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  destination: z.lazy(() => SortOrderSchema).optional(),
  httpHeadersJson: z.lazy(() => SortOrderSchema).optional(),
  endpointUrl: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportConfigMinOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportConfigMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  destination: z.lazy(() => SortOrderSchema).optional(),
  httpHeadersJson: z.lazy(() => SortOrderSchema).optional(),
  endpointUrl: z.lazy(() => SortOrderSchema).optional(),
  userId: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportJobCountOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportJobCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  configId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  fromDate: z.lazy(() => SortOrderSchema).optional(),
  toDate: z.lazy(() => SortOrderSchema).optional(),
  resultSummaryJson: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportJobMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportJobMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  configId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  fromDate: z.lazy(() => SortOrderSchema).optional(),
  toDate: z.lazy(() => SortOrderSchema).optional(),
  resultSummaryJson: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ErpExportJobMinOrderByAggregateInputSchema: z.ZodType<Prisma.ErpExportJobMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  configId: z.lazy(() => SortOrderSchema).optional(),
  status: z.lazy(() => SortOrderSchema).optional(),
  fromDate: z.lazy(() => SortOrderSchema).optional(),
  toDate: z.lazy(() => SortOrderSchema).optional(),
  resultSummaryJson: z.lazy(() => SortOrderSchema).optional(),
  createdAt: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentCreateNestedManyWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentCreateNestedManyWithoutShipperInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentCreateWithoutShipperInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyShipperInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const ShipmentCreateNestedManyWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentCreateNestedManyWithoutConsigneeInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyConsigneeInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const ShipmentUncheckedCreateNestedManyWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateNestedManyWithoutShipperInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentCreateWithoutShipperInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyShipperInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const ShipmentUncheckedCreateNestedManyWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateNestedManyWithoutConsigneeInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyConsigneeInputEnvelopeSchema).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
}).strict();

export const StringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional(),
}).strict();

export const NullableStringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableStringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional().nullable(),
}).strict();

export const BoolFieldUpdateOperationsInputSchema: z.ZodType<Prisma.BoolFieldUpdateOperationsInput> = z.object({
  set: z.boolean().optional(),
}).strict();

export const ShipmentUpdateManyWithoutShipperNestedInputSchema: z.ZodType<Prisma.ShipmentUpdateManyWithoutShipperNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentCreateWithoutShipperInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutShipperInputSchema), z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutShipperInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyShipperInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutShipperInputSchema), z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutShipperInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => ShipmentUpdateManyWithWhereWithoutShipperInputSchema), z.lazy(() => ShipmentUpdateManyWithWhereWithoutShipperInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const ShipmentUpdateManyWithoutConsigneeNestedInputSchema: z.ZodType<Prisma.ShipmentUpdateManyWithoutConsigneeNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutConsigneeInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyConsigneeInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutConsigneeInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => ShipmentUpdateManyWithWhereWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpdateManyWithWhereWithoutConsigneeInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyWithoutShipperNestedInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyWithoutShipperNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentCreateWithoutShipperInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutShipperInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutShipperInputSchema), z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutShipperInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyShipperInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutShipperInputSchema), z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutShipperInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => ShipmentUpdateManyWithWhereWithoutShipperInputSchema), z.lazy(() => ShipmentUpdateManyWithWhereWithoutShipperInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyWithoutConsigneeNestedInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyWithoutConsigneeNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema).array(), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema).array() ]).optional(),
  connectOrCreate: z.union([ z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema), z.lazy(() => ShipmentCreateOrConnectWithoutConsigneeInputSchema).array() ]).optional(),
  upsert: z.union([ z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpsertWithWhereUniqueWithoutConsigneeInputSchema).array() ]).optional(),
  createMany: z.lazy(() => ShipmentCreateManyConsigneeInputEnvelopeSchema).optional(),
  set: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  disconnect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  delete: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  connect: z.union([ z.lazy(() => ShipmentWhereUniqueInputSchema), z.lazy(() => ShipmentWhereUniqueInputSchema).array() ]).optional(),
  update: z.union([ z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpdateWithWhereUniqueWithoutConsigneeInputSchema).array() ]).optional(),
  updateMany: z.union([ z.lazy(() => ShipmentUpdateManyWithWhereWithoutConsigneeInputSchema), z.lazy(() => ShipmentUpdateManyWithWhereWithoutConsigneeInputSchema).array() ]).optional(),
  deleteMany: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
}).strict();

export const PartyCreateNestedOneWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyCreateNestedOneWithoutShipmentsAsShipperInput> = z.object({
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsShipperInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => PartyCreateOrConnectWithoutShipmentsAsShipperInputSchema).optional(),
  connect: z.lazy(() => PartyWhereUniqueInputSchema).optional(),
}).strict();

export const PartyCreateNestedOneWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyCreateNestedOneWithoutShipmentsAsConsigneeInput> = z.object({
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsConsigneeInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => PartyCreateOrConnectWithoutShipmentsAsConsigneeInputSchema).optional(),
  connect: z.lazy(() => PartyWhereUniqueInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaCreateNestedOneWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateNestedOneWithoutShipmentInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCarrierMetaCreateOrConnectWithoutShipmentInputSchema).optional(),
  connect: z.lazy(() => ShipmentCarrierMetaWhereUniqueInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaUncheckedCreateNestedOneWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedCreateNestedOneWithoutShipmentInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCarrierMetaCreateOrConnectWithoutShipmentInputSchema).optional(),
  connect: z.lazy(() => ShipmentCarrierMetaWhereUniqueInputSchema).optional(),
}).strict();

export const NullableDecimalFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableDecimalFieldUpdateOperationsInput> = z.object({
  set: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  increment: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  decrement: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  multiply: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  divide: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
}).strict();

export const NullableFloatFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableFloatFieldUpdateOperationsInput> = z.object({
  set: z.number().optional().nullable(),
  increment: z.number().optional(),
  decrement: z.number().optional(),
  multiply: z.number().optional(),
  divide: z.number().optional(),
}).strict();

export const NullableIntFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableIntFieldUpdateOperationsInput> = z.object({
  set: z.number().optional().nullable(),
  increment: z.number().optional(),
  decrement: z.number().optional(),
  multiply: z.number().optional(),
  divide: z.number().optional(),
}).strict();

export const DateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.DateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional(),
}).strict();

export const PartyUpdateOneWithoutShipmentsAsShipperNestedInputSchema: z.ZodType<Prisma.PartyUpdateOneWithoutShipmentsAsShipperNestedInput> = z.object({
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsShipperInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => PartyCreateOrConnectWithoutShipmentsAsShipperInputSchema).optional(),
  upsert: z.lazy(() => PartyUpsertWithoutShipmentsAsShipperInputSchema).optional(),
  disconnect: z.union([ z.boolean(),z.lazy(() => PartyWhereInputSchema) ]).optional(),
  delete: z.union([ z.boolean(),z.lazy(() => PartyWhereInputSchema) ]).optional(),
  connect: z.lazy(() => PartyWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => PartyUpdateToOneWithWhereWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUpdateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsShipperInputSchema) ]).optional(),
}).strict();

export const PartyUpdateOneWithoutShipmentsAsConsigneeNestedInputSchema: z.ZodType<Prisma.PartyUpdateOneWithoutShipmentsAsConsigneeNestedInput> = z.object({
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsConsigneeInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => PartyCreateOrConnectWithoutShipmentsAsConsigneeInputSchema).optional(),
  upsert: z.lazy(() => PartyUpsertWithoutShipmentsAsConsigneeInputSchema).optional(),
  disconnect: z.union([ z.boolean(),z.lazy(() => PartyWhereInputSchema) ]).optional(),
  delete: z.union([ z.boolean(),z.lazy(() => PartyWhereInputSchema) ]).optional(),
  connect: z.lazy(() => PartyWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => PartyUpdateToOneWithWhereWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUpdateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsConsigneeInputSchema) ]).optional(),
}).strict();

export const ShipmentCarrierMetaUpdateOneWithoutShipmentNestedInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateOneWithoutShipmentNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCarrierMetaCreateOrConnectWithoutShipmentInputSchema).optional(),
  upsert: z.lazy(() => ShipmentCarrierMetaUpsertWithoutShipmentInputSchema).optional(),
  disconnect: z.union([ z.boolean(),z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional(),
  delete: z.union([ z.boolean(),z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional(),
  connect: z.lazy(() => ShipmentCarrierMetaWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ShipmentCarrierMetaUpdateToOneWithWhereWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUpdateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInputSchema) ]).optional(),
}).strict();

export const ShipmentCarrierMetaUncheckedUpdateOneWithoutShipmentNestedInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedUpdateOneWithoutShipmentNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCarrierMetaCreateOrConnectWithoutShipmentInputSchema).optional(),
  upsert: z.lazy(() => ShipmentCarrierMetaUpsertWithoutShipmentInputSchema).optional(),
  disconnect: z.union([ z.boolean(),z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional(),
  delete: z.union([ z.boolean(),z.lazy(() => ShipmentCarrierMetaWhereInputSchema) ]).optional(),
  connect: z.lazy(() => ShipmentCarrierMetaWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ShipmentCarrierMetaUpdateToOneWithWhereWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUpdateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInputSchema) ]).optional(),
}).strict();

export const ShipmentCreateNestedOneWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentCreateNestedOneWithoutCarrierMetaInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutCarrierMetaInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCreateOrConnectWithoutCarrierMetaInputSchema).optional(),
  connect: z.lazy(() => ShipmentWhereUniqueInputSchema).optional(),
}).strict();

export const NullableDateTimeFieldUpdateOperationsInputSchema: z.ZodType<Prisma.NullableDateTimeFieldUpdateOperationsInput> = z.object({
  set: z.coerce.date().optional().nullable(),
}).strict();

export const ShipmentUpdateOneRequiredWithoutCarrierMetaNestedInputSchema: z.ZodType<Prisma.ShipmentUpdateOneRequiredWithoutCarrierMetaNestedInput> = z.object({
  create: z.union([ z.lazy(() => ShipmentCreateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutCarrierMetaInputSchema) ]).optional(),
  connectOrCreate: z.lazy(() => ShipmentCreateOrConnectWithoutCarrierMetaInputSchema).optional(),
  upsert: z.lazy(() => ShipmentUpsertWithoutCarrierMetaInputSchema).optional(),
  connect: z.lazy(() => ShipmentWhereUniqueInputSchema).optional(),
  update: z.union([ z.lazy(() => ShipmentUpdateToOneWithWhereWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUpdateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutCarrierMetaInputSchema) ]).optional(),
}).strict();

export const NestedStringFilterSchema: z.ZodType<Prisma.NestedStringFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringFilterSchema) ]).optional(),
}).strict();

export const NestedStringNullableFilterSchema: z.ZodType<Prisma.NestedStringNullableFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedBoolFilterSchema: z.ZodType<Prisma.NestedBoolFilter> = z.object({
  equals: z.boolean().optional(),
  not: z.union([ z.boolean(),z.lazy(() => NestedBoolFilterSchema) ]).optional(),
}).strict();

export const NestedStringWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringWithAggregatesFilter> = z.object({
  equals: z.string().optional(),
  in: z.string().array().optional(),
  notIn: z.string().array().optional(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedStringFilterSchema).optional(),
  _max: z.lazy(() => NestedStringFilterSchema).optional(),
}).strict();

export const NestedIntFilterSchema: z.ZodType<Prisma.NestedIntFilter> = z.object({
  equals: z.number().optional(),
  in: z.number().array().optional(),
  notIn: z.number().array().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntFilterSchema) ]).optional(),
}).strict();

export const NestedStringNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedStringNullableWithAggregatesFilter> = z.object({
  equals: z.string().optional().nullable(),
  in: z.string().array().optional().nullable(),
  notIn: z.string().array().optional().nullable(),
  lt: z.string().optional(),
  lte: z.string().optional(),
  gt: z.string().optional(),
  gte: z.string().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  not: z.union([ z.string(),z.lazy(() => NestedStringNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedStringNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedStringNullableFilterSchema).optional(),
}).strict();

export const NestedIntNullableFilterSchema: z.ZodType<Prisma.NestedIntNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedBoolWithAggregatesFilterSchema: z.ZodType<Prisma.NestedBoolWithAggregatesFilter> = z.object({
  equals: z.boolean().optional(),
  not: z.union([ z.boolean(),z.lazy(() => NestedBoolWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedBoolFilterSchema).optional(),
  _max: z.lazy(() => NestedBoolFilterSchema).optional(),
}).strict();

export const NestedDecimalNullableFilterSchema: z.ZodType<Prisma.NestedDecimalNullableFilter> = z.object({
  equals: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  in: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  notIn: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  lt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  lte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  not: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NestedDecimalNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedFloatNullableFilterSchema: z.ZodType<Prisma.NestedFloatNullableFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedDateTimeFilterSchema: z.ZodType<Prisma.NestedDateTimeFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeFilterSchema) ]).optional(),
}).strict();

export const NestedJsonNullableFilterSchema: z.ZodType<Prisma.NestedJsonNullableFilter> = z.object({
  equals: InputJsonValueSchema.optional(),
  path: z.string().array().optional(),
  mode: z.lazy(() => QueryModeSchema).optional(),
  string_contains: z.string().optional(),
  string_starts_with: z.string().optional(),
  string_ends_with: z.string().optional(),
  array_starts_with: InputJsonValueSchema.optional().nullable(),
  array_ends_with: InputJsonValueSchema.optional().nullable(),
  array_contains: InputJsonValueSchema.optional().nullable(),
  lt: InputJsonValueSchema.optional(),
  lte: InputJsonValueSchema.optional(),
  gt: InputJsonValueSchema.optional(),
  gte: InputJsonValueSchema.optional(),
  not: InputJsonValueSchema.optional(),
}).strict();

export const NestedDecimalNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDecimalNullableWithAggregatesFilter> = z.object({
  equals: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  in: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  notIn: z.union([z.number().array(),z.string().array(),z.instanceof(Prisma.Decimal).array(),DecimalJsLikeSchema.array(),]).refine((v) => Array.isArray(v) && (v as any[]).every((v) => isValidDecimalInput(v)), { message: 'Must be a Decimal' }).optional().nullable(),
  lt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  lte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gt: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  gte: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional(),
  not: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NestedDecimalNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDecimalNullableFilterSchema).optional(),
}).strict();

export const NestedFloatNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedFloatNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedFloatNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
}).strict();

export const NestedIntNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedIntNullableWithAggregatesFilter> = z.object({
  equals: z.number().optional().nullable(),
  in: z.number().array().optional().nullable(),
  notIn: z.number().array().optional().nullable(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  not: z.union([ z.number(),z.lazy(() => NestedIntNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _avg: z.lazy(() => NestedFloatNullableFilterSchema).optional(),
  _sum: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedIntNullableFilterSchema).optional(),
}).strict();

export const NestedDateTimeWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional(),
  in: z.coerce.date().array().optional(),
  notIn: z.coerce.date().array().optional(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeWithAggregatesFilterSchema) ]).optional(),
  _count: z.lazy(() => NestedIntFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeFilterSchema).optional(),
}).strict();

export const NestedDateTimeNullableFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableFilterSchema) ]).optional().nullable(),
}).strict();

export const NestedDateTimeNullableWithAggregatesFilterSchema: z.ZodType<Prisma.NestedDateTimeNullableWithAggregatesFilter> = z.object({
  equals: z.coerce.date().optional().nullable(),
  in: z.coerce.date().array().optional().nullable(),
  notIn: z.coerce.date().array().optional().nullable(),
  lt: z.coerce.date().optional(),
  lte: z.coerce.date().optional(),
  gt: z.coerce.date().optional(),
  gte: z.coerce.date().optional(),
  not: z.union([ z.coerce.date(),z.lazy(() => NestedDateTimeNullableWithAggregatesFilterSchema) ]).optional().nullable(),
  _count: z.lazy(() => NestedIntNullableFilterSchema).optional(),
  _min: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
  _max: z.lazy(() => NestedDateTimeNullableFilterSchema).optional(),
}).strict();

export const ShipmentCreateWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentCreateWithoutShipperInput> = z.object({
  id: z.uuid().optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  consignee: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsConsigneeInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentUncheckedCreateWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateWithoutShipperInput> = z.object({
  id: z.uuid().optional(),
  consigneeId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentCreateOrConnectWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentCreateOrConnectWithoutShipperInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema) ]),
}).strict();

export const ShipmentCreateManyShipperInputEnvelopeSchema: z.ZodType<Prisma.ShipmentCreateManyShipperInputEnvelope> = z.object({
  data: z.union([ z.lazy(() => ShipmentCreateManyShipperInputSchema), z.lazy(() => ShipmentCreateManyShipperInputSchema).array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentCreateWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentCreateWithoutConsigneeInput> = z.object({
  id: z.uuid().optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  shipper: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsShipperInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentUncheckedCreateWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateWithoutConsigneeInput> = z.object({
  id: z.uuid().optional(),
  shipperId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedCreateNestedOneWithoutShipmentInputSchema).optional(),
}).strict();

export const ShipmentCreateOrConnectWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentCreateOrConnectWithoutConsigneeInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema) ]),
}).strict();

export const ShipmentCreateManyConsigneeInputEnvelopeSchema: z.ZodType<Prisma.ShipmentCreateManyConsigneeInputEnvelope> = z.object({
  data: z.union([ z.lazy(() => ShipmentCreateManyConsigneeInputSchema), z.lazy(() => ShipmentCreateManyConsigneeInputSchema).array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentUpsertWithWhereUniqueWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUpsertWithWhereUniqueWithoutShipperInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => ShipmentUpdateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutShipperInputSchema) ]),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutShipperInputSchema) ]),
}).strict();

export const ShipmentUpdateWithWhereUniqueWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUpdateWithWhereUniqueWithoutShipperInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => ShipmentUpdateWithoutShipperInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutShipperInputSchema) ]),
}).strict();

export const ShipmentUpdateManyWithWhereWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUpdateManyWithWhereWithoutShipperInput> = z.object({
  where: z.lazy(() => ShipmentScalarWhereInputSchema),
  data: z.union([ z.lazy(() => ShipmentUpdateManyMutationInputSchema), z.lazy(() => ShipmentUncheckedUpdateManyWithoutShipperInputSchema) ]),
}).strict();

export const ShipmentScalarWhereInputSchema: z.ZodType<Prisma.ShipmentScalarWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentScalarWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentScalarWhereInputSchema), z.lazy(() => ShipmentScalarWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  shipperId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  consigneeId: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  shipperSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  consigneeSnapshot: z.lazy(() => JsonNullableFilterSchema).optional(),
  incoterm: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  currency: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  totalValue: z.union([ z.lazy(() => DecimalNullableFilterSchema), z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }) ]).optional().nullable(),
  totalWeight: z.union([ z.lazy(() => FloatNullableFilterSchema), z.number() ]).optional().nullable(),
  numPackages: z.union([ z.lazy(() => IntNullableFilterSchema), z.number() ]).optional().nullable(),
  originCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  destinationCountry: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  status: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
  trackingNumber: z.union([ z.lazy(() => StringNullableFilterSchema), z.string() ]).optional().nullable(),
  createdAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
  updatedAt: z.union([ z.lazy(() => DateTimeFilterSchema), z.coerce.date() ]).optional(),
}).strict();

export const ShipmentUpsertWithWhereUniqueWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUpsertWithWhereUniqueWithoutConsigneeInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  update: z.union([ z.lazy(() => ShipmentUpdateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutConsigneeInputSchema) ]),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutConsigneeInputSchema) ]),
}).strict();

export const ShipmentUpdateWithWhereUniqueWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUpdateWithWhereUniqueWithoutConsigneeInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  data: z.union([ z.lazy(() => ShipmentUpdateWithoutConsigneeInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutConsigneeInputSchema) ]),
}).strict();

export const ShipmentUpdateManyWithWhereWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUpdateManyWithWhereWithoutConsigneeInput> = z.object({
  where: z.lazy(() => ShipmentScalarWhereInputSchema),
  data: z.union([ z.lazy(() => ShipmentUpdateManyMutationInputSchema), z.lazy(() => ShipmentUncheckedUpdateManyWithoutConsigneeInputSchema) ]),
}).strict();

export const PartyCreateWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyCreateWithoutShipmentsAsShipperInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsConsignee: z.lazy(() => ShipmentCreateNestedManyWithoutConsigneeInputSchema).optional(),
}).strict();

export const PartyUncheckedCreateWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyUncheckedCreateWithoutShipmentsAsShipperInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUncheckedCreateNestedManyWithoutConsigneeInputSchema).optional(),
}).strict();

export const PartyCreateOrConnectWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyCreateOrConnectWithoutShipmentsAsShipperInput> = z.object({
  where: z.lazy(() => PartyWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsShipperInputSchema) ]),
}).strict();

export const PartyCreateWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyCreateWithoutShipmentsAsConsigneeInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentCreateNestedManyWithoutShipperInputSchema).optional(),
}).strict();

export const PartyUncheckedCreateWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyUncheckedCreateWithoutShipmentsAsConsigneeInput> = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  taxIdOrEori: z.string().optional().nullable(),
  isAddressBookEntry: z.boolean().optional(),
  createdByUserId: z.string().optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUncheckedCreateNestedManyWithoutShipperInputSchema).optional(),
}).strict();

export const PartyCreateOrConnectWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyCreateOrConnectWithoutShipmentsAsConsigneeInput> = z.object({
  where: z.lazy(() => PartyWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsConsigneeInputSchema) ]),
}).strict();

export const ShipmentCarrierMetaCreateWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateWithoutShipmentInput> = z.object({
  id: z.uuid().optional(),
  rateQuoteJson: z.string().optional().nullable(),
  bookingResponseJson: z.string().optional().nullable(),
  labelUrl: z.string().optional().nullable(),
  carrierCode: z.string().optional().nullable(),
  serviceLevelCode: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  bookedAt: z.coerce.date().optional().nullable(),
}).strict();

export const ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedCreateWithoutShipmentInput> = z.object({
  id: z.uuid().optional(),
  rateQuoteJson: z.string().optional().nullable(),
  bookingResponseJson: z.string().optional().nullable(),
  labelUrl: z.string().optional().nullable(),
  carrierCode: z.string().optional().nullable(),
  serviceLevelCode: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  bookedAt: z.coerce.date().optional().nullable(),
}).strict();

export const ShipmentCarrierMetaCreateOrConnectWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateOrConnectWithoutShipmentInput> = z.object({
  where: z.lazy(() => ShipmentCarrierMetaWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]),
}).strict();

export const PartyUpsertWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyUpsertWithoutShipmentsAsShipperInput> = z.object({
  update: z.union([ z.lazy(() => PartyUpdateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsShipperInputSchema) ]),
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsShipperInputSchema) ]),
  where: z.lazy(() => PartyWhereInputSchema).optional(),
}).strict();

export const PartyUpdateToOneWithWhereWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyUpdateToOneWithWhereWithoutShipmentsAsShipperInput> = z.object({
  where: z.lazy(() => PartyWhereInputSchema).optional(),
  data: z.union([ z.lazy(() => PartyUpdateWithoutShipmentsAsShipperInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsShipperInputSchema) ]),
}).strict();

export const PartyUpdateWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyUpdateWithoutShipmentsAsShipperInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUpdateManyWithoutConsigneeNestedInputSchema).optional(),
}).strict();

export const PartyUncheckedUpdateWithoutShipmentsAsShipperInputSchema: z.ZodType<Prisma.PartyUncheckedUpdateWithoutShipmentsAsShipperInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsConsignee: z.lazy(() => ShipmentUncheckedUpdateManyWithoutConsigneeNestedInputSchema).optional(),
}).strict();

export const PartyUpsertWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyUpsertWithoutShipmentsAsConsigneeInput> = z.object({
  update: z.union([ z.lazy(() => PartyUpdateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsConsigneeInputSchema) ]),
  create: z.union([ z.lazy(() => PartyCreateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedCreateWithoutShipmentsAsConsigneeInputSchema) ]),
  where: z.lazy(() => PartyWhereInputSchema).optional(),
}).strict();

export const PartyUpdateToOneWithWhereWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyUpdateToOneWithWhereWithoutShipmentsAsConsigneeInput> = z.object({
  where: z.lazy(() => PartyWhereInputSchema).optional(),
  data: z.union([ z.lazy(() => PartyUpdateWithoutShipmentsAsConsigneeInputSchema), z.lazy(() => PartyUncheckedUpdateWithoutShipmentsAsConsigneeInputSchema) ]),
}).strict();

export const PartyUpdateWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyUpdateWithoutShipmentsAsConsigneeInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUpdateManyWithoutShipperNestedInputSchema).optional(),
}).strict();

export const PartyUncheckedUpdateWithoutShipmentsAsConsigneeInputSchema: z.ZodType<Prisma.PartyUncheckedUpdateWithoutShipmentsAsConsigneeInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  name: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  address: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  city: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  country: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  contactName: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  phone: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  email: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  taxIdOrEori: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  isAddressBookEntry: z.union([ z.boolean(),z.lazy(() => BoolFieldUpdateOperationsInputSchema) ]).optional(),
  createdByUserId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipmentsAsShipper: z.lazy(() => ShipmentUncheckedUpdateManyWithoutShipperNestedInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaUpsertWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpsertWithoutShipmentInput> = z.object({
  update: z.union([ z.lazy(() => ShipmentCarrierMetaUpdateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInputSchema) ]),
  create: z.union([ z.lazy(() => ShipmentCarrierMetaCreateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedCreateWithoutShipmentInputSchema) ]),
  where: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).optional(),
}).strict();

export const ShipmentCarrierMetaUpdateToOneWithWhereWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateToOneWithWhereWithoutShipmentInput> = z.object({
  where: z.lazy(() => ShipmentCarrierMetaWhereInputSchema).optional(),
  data: z.union([ z.lazy(() => ShipmentCarrierMetaUpdateWithoutShipmentInputSchema), z.lazy(() => ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInputSchema) ]),
}).strict();

export const ShipmentCarrierMetaUpdateWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateWithoutShipmentInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInputSchema: z.ZodType<Prisma.ShipmentCarrierMetaUncheckedUpdateWithoutShipmentInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  rateQuoteJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookingResponseJson: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  labelUrl: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  carrierCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  serviceLevelCode: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  bookedAt: z.union([ z.coerce.date(),z.lazy(() => NullableDateTimeFieldUpdateOperationsInputSchema) ]).optional().nullable(),
}).strict();

export const ShipmentCreateWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentCreateWithoutCarrierMetaInput> = z.object({
  id: z.uuid().optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  shipper: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsShipperInputSchema).optional(),
  consignee: z.lazy(() => PartyCreateNestedOneWithoutShipmentsAsConsigneeInputSchema).optional(),
}).strict();

export const ShipmentUncheckedCreateWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateWithoutCarrierMetaInput> = z.object({
  id: z.uuid().optional(),
  shipperId: z.string().optional().nullable(),
  consigneeId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentCreateOrConnectWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentCreateOrConnectWithoutCarrierMetaInput> = z.object({
  where: z.lazy(() => ShipmentWhereUniqueInputSchema),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutCarrierMetaInputSchema) ]),
}).strict();

export const ShipmentUpsertWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentUpsertWithoutCarrierMetaInput> = z.object({
  update: z.union([ z.lazy(() => ShipmentUpdateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutCarrierMetaInputSchema) ]),
  create: z.union([ z.lazy(() => ShipmentCreateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedCreateWithoutCarrierMetaInputSchema) ]),
  where: z.lazy(() => ShipmentWhereInputSchema).optional(),
}).strict();

export const ShipmentUpdateToOneWithWhereWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentUpdateToOneWithWhereWithoutCarrierMetaInput> = z.object({
  where: z.lazy(() => ShipmentWhereInputSchema).optional(),
  data: z.union([ z.lazy(() => ShipmentUpdateWithoutCarrierMetaInputSchema), z.lazy(() => ShipmentUncheckedUpdateWithoutCarrierMetaInputSchema) ]),
}).strict();

export const ShipmentUpdateWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentUpdateWithoutCarrierMetaInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  shipper: z.lazy(() => PartyUpdateOneWithoutShipmentsAsShipperNestedInputSchema).optional(),
  consignee: z.lazy(() => PartyUpdateOneWithoutShipmentsAsConsigneeNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateWithoutCarrierMetaInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateWithoutCarrierMetaInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentCreateManyShipperInputSchema: z.ZodType<Prisma.ShipmentCreateManyShipperInput> = z.object({
  id: z.uuid().optional(),
  consigneeId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentCreateManyConsigneeInputSchema: z.ZodType<Prisma.ShipmentCreateManyConsigneeInput> = z.object({
  id: z.uuid().optional(),
  shipperId: z.string().optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalValue: z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }).optional().nullable(),
  totalWeight: z.number().optional().nullable(),
  numPackages: z.number().int().optional().nullable(),
  originCountry: z.string().optional().nullable(),
  destinationCountry: z.string().optional().nullable(),
  status: z.string().optional(),
  trackingNumber: z.string().optional().nullable(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).strict();

export const ShipmentUpdateWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUpdateWithoutShipperInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  consignee: z.lazy(() => PartyUpdateOneWithoutShipmentsAsConsigneeNestedInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateWithoutShipperInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyWithoutShipperInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyWithoutShipperInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  consigneeId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentUpdateWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUpdateWithoutConsigneeInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  shipper: z.lazy(() => PartyUpdateOneWithoutShipmentsAsShipperNestedInputSchema).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateWithoutConsigneeInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  carrierMeta: z.lazy(() => ShipmentCarrierMetaUncheckedUpdateOneWithoutShipmentNestedInputSchema).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyWithoutConsigneeInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyWithoutConsigneeInput> = z.object({
  id: z.union([ z.uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  shipperId: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  shipperSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  consigneeSnapshot: z.union([ z.lazy(() => NullableJsonNullValueInputSchema), InputJsonValueSchema ]).optional(),
  incoterm: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  currency: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalValue: z.union([ z.union([z.number(),z.string(),z.instanceof(Prisma.Decimal),DecimalJsLikeSchema,]).refine((v) => isValidDecimalInput(v), { message: 'Must be a Decimal' }),z.lazy(() => NullableDecimalFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  totalWeight: z.union([ z.number(),z.lazy(() => NullableFloatFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  numPackages: z.union([ z.number().int(),z.lazy(() => NullableIntFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  originCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  destinationCountry: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  status: z.union([ z.string(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
  trackingNumber: z.union([ z.string(),z.lazy(() => NullableStringFieldUpdateOperationsInputSchema) ]).optional().nullable(),
  createdAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
  updatedAt: z.union([ z.coerce.date(),z.lazy(() => DateTimeFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

/////////////////////////////////////////
// ARGS
/////////////////////////////////////////

export const PartyFindFirstArgsSchema: z.ZodType<Prisma.PartyFindFirstArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereInputSchema.optional(), 
  orderBy: z.union([ PartyOrderByWithRelationInputSchema.array(), PartyOrderByWithRelationInputSchema ]).optional(),
  cursor: PartyWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ PartyScalarFieldEnumSchema, PartyScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const PartyFindFirstOrThrowArgsSchema: z.ZodType<Prisma.PartyFindFirstOrThrowArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereInputSchema.optional(), 
  orderBy: z.union([ PartyOrderByWithRelationInputSchema.array(), PartyOrderByWithRelationInputSchema ]).optional(),
  cursor: PartyWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ PartyScalarFieldEnumSchema, PartyScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const PartyFindManyArgsSchema: z.ZodType<Prisma.PartyFindManyArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereInputSchema.optional(), 
  orderBy: z.union([ PartyOrderByWithRelationInputSchema.array(), PartyOrderByWithRelationInputSchema ]).optional(),
  cursor: PartyWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ PartyScalarFieldEnumSchema, PartyScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const PartyAggregateArgsSchema: z.ZodType<Prisma.PartyAggregateArgs> = z.object({
  where: PartyWhereInputSchema.optional(), 
  orderBy: z.union([ PartyOrderByWithRelationInputSchema.array(), PartyOrderByWithRelationInputSchema ]).optional(),
  cursor: PartyWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const PartyGroupByArgsSchema: z.ZodType<Prisma.PartyGroupByArgs> = z.object({
  where: PartyWhereInputSchema.optional(), 
  orderBy: z.union([ PartyOrderByWithAggregationInputSchema.array(), PartyOrderByWithAggregationInputSchema ]).optional(),
  by: PartyScalarFieldEnumSchema.array(), 
  having: PartyScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const PartyFindUniqueArgsSchema: z.ZodType<Prisma.PartyFindUniqueArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereUniqueInputSchema, 
}).strict();

export const PartyFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.PartyFindUniqueOrThrowArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereUniqueInputSchema, 
}).strict();

export const ShipmentFindFirstArgsSchema: z.ZodType<Prisma.ShipmentFindFirstArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentScalarFieldEnumSchema, ShipmentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ShipmentFindFirstOrThrowArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentScalarFieldEnumSchema, ShipmentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentFindManyArgsSchema: z.ZodType<Prisma.ShipmentFindManyArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentScalarFieldEnumSchema, ShipmentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentAggregateArgsSchema: z.ZodType<Prisma.ShipmentAggregateArgs> = z.object({
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentGroupByArgsSchema: z.ZodType<Prisma.ShipmentGroupByArgs> = z.object({
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithAggregationInputSchema.array(), ShipmentOrderByWithAggregationInputSchema ]).optional(),
  by: ShipmentScalarFieldEnumSchema.array(), 
  having: ShipmentScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentFindUniqueArgsSchema: z.ZodType<Prisma.ShipmentFindUniqueArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ShipmentFindUniqueOrThrowArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const CarrierAccountFindFirstArgsSchema: z.ZodType<Prisma.CarrierAccountFindFirstArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereInputSchema.optional(), 
  orderBy: z.union([ CarrierAccountOrderByWithRelationInputSchema.array(), CarrierAccountOrderByWithRelationInputSchema ]).optional(),
  cursor: CarrierAccountWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ CarrierAccountScalarFieldEnumSchema, CarrierAccountScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const CarrierAccountFindFirstOrThrowArgsSchema: z.ZodType<Prisma.CarrierAccountFindFirstOrThrowArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereInputSchema.optional(), 
  orderBy: z.union([ CarrierAccountOrderByWithRelationInputSchema.array(), CarrierAccountOrderByWithRelationInputSchema ]).optional(),
  cursor: CarrierAccountWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ CarrierAccountScalarFieldEnumSchema, CarrierAccountScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const CarrierAccountFindManyArgsSchema: z.ZodType<Prisma.CarrierAccountFindManyArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereInputSchema.optional(), 
  orderBy: z.union([ CarrierAccountOrderByWithRelationInputSchema.array(), CarrierAccountOrderByWithRelationInputSchema ]).optional(),
  cursor: CarrierAccountWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ CarrierAccountScalarFieldEnumSchema, CarrierAccountScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const CarrierAccountAggregateArgsSchema: z.ZodType<Prisma.CarrierAccountAggregateArgs> = z.object({
  where: CarrierAccountWhereInputSchema.optional(), 
  orderBy: z.union([ CarrierAccountOrderByWithRelationInputSchema.array(), CarrierAccountOrderByWithRelationInputSchema ]).optional(),
  cursor: CarrierAccountWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const CarrierAccountGroupByArgsSchema: z.ZodType<Prisma.CarrierAccountGroupByArgs> = z.object({
  where: CarrierAccountWhereInputSchema.optional(), 
  orderBy: z.union([ CarrierAccountOrderByWithAggregationInputSchema.array(), CarrierAccountOrderByWithAggregationInputSchema ]).optional(),
  by: CarrierAccountScalarFieldEnumSchema.array(), 
  having: CarrierAccountScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const CarrierAccountFindUniqueArgsSchema: z.ZodType<Prisma.CarrierAccountFindUniqueArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereUniqueInputSchema, 
}).strict();

export const CarrierAccountFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.CarrierAccountFindUniqueOrThrowArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereUniqueInputSchema, 
}).strict();

export const ShipmentCarrierMetaFindFirstArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaFindFirstArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentCarrierMetaOrderByWithRelationInputSchema.array(), ShipmentCarrierMetaOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentCarrierMetaWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentCarrierMetaScalarFieldEnumSchema, ShipmentCarrierMetaScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentCarrierMetaFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaFindFirstOrThrowArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentCarrierMetaOrderByWithRelationInputSchema.array(), ShipmentCarrierMetaOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentCarrierMetaWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentCarrierMetaScalarFieldEnumSchema, ShipmentCarrierMetaScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentCarrierMetaFindManyArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaFindManyArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentCarrierMetaOrderByWithRelationInputSchema.array(), ShipmentCarrierMetaOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentCarrierMetaWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentCarrierMetaScalarFieldEnumSchema, ShipmentCarrierMetaScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentCarrierMetaAggregateArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaAggregateArgs> = z.object({
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentCarrierMetaOrderByWithRelationInputSchema.array(), ShipmentCarrierMetaOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentCarrierMetaWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentCarrierMetaGroupByArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaGroupByArgs> = z.object({
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentCarrierMetaOrderByWithAggregationInputSchema.array(), ShipmentCarrierMetaOrderByWithAggregationInputSchema ]).optional(),
  by: ShipmentCarrierMetaScalarFieldEnumSchema.array(), 
  having: ShipmentCarrierMetaScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentCarrierMetaFindUniqueArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaFindUniqueArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereUniqueInputSchema, 
}).strict();

export const ShipmentCarrierMetaFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaFindUniqueOrThrowArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereUniqueInputSchema, 
}).strict();

export const ForwarderProfileFindFirstArgsSchema: z.ZodType<Prisma.ForwarderProfileFindFirstArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereInputSchema.optional(), 
  orderBy: z.union([ ForwarderProfileOrderByWithRelationInputSchema.array(), ForwarderProfileOrderByWithRelationInputSchema ]).optional(),
  cursor: ForwarderProfileWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ForwarderProfileScalarFieldEnumSchema, ForwarderProfileScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ForwarderProfileFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ForwarderProfileFindFirstOrThrowArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereInputSchema.optional(), 
  orderBy: z.union([ ForwarderProfileOrderByWithRelationInputSchema.array(), ForwarderProfileOrderByWithRelationInputSchema ]).optional(),
  cursor: ForwarderProfileWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ForwarderProfileScalarFieldEnumSchema, ForwarderProfileScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ForwarderProfileFindManyArgsSchema: z.ZodType<Prisma.ForwarderProfileFindManyArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereInputSchema.optional(), 
  orderBy: z.union([ ForwarderProfileOrderByWithRelationInputSchema.array(), ForwarderProfileOrderByWithRelationInputSchema ]).optional(),
  cursor: ForwarderProfileWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ForwarderProfileScalarFieldEnumSchema, ForwarderProfileScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ForwarderProfileAggregateArgsSchema: z.ZodType<Prisma.ForwarderProfileAggregateArgs> = z.object({
  where: ForwarderProfileWhereInputSchema.optional(), 
  orderBy: z.union([ ForwarderProfileOrderByWithRelationInputSchema.array(), ForwarderProfileOrderByWithRelationInputSchema ]).optional(),
  cursor: ForwarderProfileWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ForwarderProfileGroupByArgsSchema: z.ZodType<Prisma.ForwarderProfileGroupByArgs> = z.object({
  where: ForwarderProfileWhereInputSchema.optional(), 
  orderBy: z.union([ ForwarderProfileOrderByWithAggregationInputSchema.array(), ForwarderProfileOrderByWithAggregationInputSchema ]).optional(),
  by: ForwarderProfileScalarFieldEnumSchema.array(), 
  having: ForwarderProfileScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ForwarderProfileFindUniqueArgsSchema: z.ZodType<Prisma.ForwarderProfileFindUniqueArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereUniqueInputSchema, 
}).strict();

export const ForwarderProfileFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ForwarderProfileFindUniqueOrThrowArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereUniqueInputSchema, 
}).strict();

export const ProductFindFirstArgsSchema: z.ZodType<Prisma.ProductFindFirstArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereInputSchema.optional(), 
  orderBy: z.union([ ProductOrderByWithRelationInputSchema.array(), ProductOrderByWithRelationInputSchema ]).optional(),
  cursor: ProductWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ProductScalarFieldEnumSchema, ProductScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ProductFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ProductFindFirstOrThrowArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereInputSchema.optional(), 
  orderBy: z.union([ ProductOrderByWithRelationInputSchema.array(), ProductOrderByWithRelationInputSchema ]).optional(),
  cursor: ProductWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ProductScalarFieldEnumSchema, ProductScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ProductFindManyArgsSchema: z.ZodType<Prisma.ProductFindManyArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereInputSchema.optional(), 
  orderBy: z.union([ ProductOrderByWithRelationInputSchema.array(), ProductOrderByWithRelationInputSchema ]).optional(),
  cursor: ProductWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ProductScalarFieldEnumSchema, ProductScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ProductAggregateArgsSchema: z.ZodType<Prisma.ProductAggregateArgs> = z.object({
  where: ProductWhereInputSchema.optional(), 
  orderBy: z.union([ ProductOrderByWithRelationInputSchema.array(), ProductOrderByWithRelationInputSchema ]).optional(),
  cursor: ProductWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ProductGroupByArgsSchema: z.ZodType<Prisma.ProductGroupByArgs> = z.object({
  where: ProductWhereInputSchema.optional(), 
  orderBy: z.union([ ProductOrderByWithAggregationInputSchema.array(), ProductOrderByWithAggregationInputSchema ]).optional(),
  by: ProductScalarFieldEnumSchema.array(), 
  having: ProductScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ProductFindUniqueArgsSchema: z.ZodType<Prisma.ProductFindUniqueArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereUniqueInputSchema, 
}).strict();

export const ProductFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ProductFindUniqueOrThrowArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereUniqueInputSchema, 
}).strict();

export const SanctionsCheckResultFindFirstArgsSchema: z.ZodType<Prisma.SanctionsCheckResultFindFirstArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  orderBy: z.union([ SanctionsCheckResultOrderByWithRelationInputSchema.array(), SanctionsCheckResultOrderByWithRelationInputSchema ]).optional(),
  cursor: SanctionsCheckResultWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ SanctionsCheckResultScalarFieldEnumSchema, SanctionsCheckResultScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const SanctionsCheckResultFindFirstOrThrowArgsSchema: z.ZodType<Prisma.SanctionsCheckResultFindFirstOrThrowArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  orderBy: z.union([ SanctionsCheckResultOrderByWithRelationInputSchema.array(), SanctionsCheckResultOrderByWithRelationInputSchema ]).optional(),
  cursor: SanctionsCheckResultWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ SanctionsCheckResultScalarFieldEnumSchema, SanctionsCheckResultScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const SanctionsCheckResultFindManyArgsSchema: z.ZodType<Prisma.SanctionsCheckResultFindManyArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  orderBy: z.union([ SanctionsCheckResultOrderByWithRelationInputSchema.array(), SanctionsCheckResultOrderByWithRelationInputSchema ]).optional(),
  cursor: SanctionsCheckResultWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ SanctionsCheckResultScalarFieldEnumSchema, SanctionsCheckResultScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const SanctionsCheckResultAggregateArgsSchema: z.ZodType<Prisma.SanctionsCheckResultAggregateArgs> = z.object({
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  orderBy: z.union([ SanctionsCheckResultOrderByWithRelationInputSchema.array(), SanctionsCheckResultOrderByWithRelationInputSchema ]).optional(),
  cursor: SanctionsCheckResultWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const SanctionsCheckResultGroupByArgsSchema: z.ZodType<Prisma.SanctionsCheckResultGroupByArgs> = z.object({
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  orderBy: z.union([ SanctionsCheckResultOrderByWithAggregationInputSchema.array(), SanctionsCheckResultOrderByWithAggregationInputSchema ]).optional(),
  by: SanctionsCheckResultScalarFieldEnumSchema.array(), 
  having: SanctionsCheckResultScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const SanctionsCheckResultFindUniqueArgsSchema: z.ZodType<Prisma.SanctionsCheckResultFindUniqueArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereUniqueInputSchema, 
}).strict();

export const SanctionsCheckResultFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.SanctionsCheckResultFindUniqueOrThrowArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereUniqueInputSchema, 
}).strict();

export const ShipmentTemplateFindFirstArgsSchema: z.ZodType<Prisma.ShipmentTemplateFindFirstArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentTemplateOrderByWithRelationInputSchema.array(), ShipmentTemplateOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentTemplateWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentTemplateScalarFieldEnumSchema, ShipmentTemplateScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentTemplateFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ShipmentTemplateFindFirstOrThrowArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentTemplateOrderByWithRelationInputSchema.array(), ShipmentTemplateOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentTemplateWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentTemplateScalarFieldEnumSchema, ShipmentTemplateScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentTemplateFindManyArgsSchema: z.ZodType<Prisma.ShipmentTemplateFindManyArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentTemplateOrderByWithRelationInputSchema.array(), ShipmentTemplateOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentTemplateWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentTemplateScalarFieldEnumSchema, ShipmentTemplateScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentTemplateAggregateArgsSchema: z.ZodType<Prisma.ShipmentTemplateAggregateArgs> = z.object({
  where: ShipmentTemplateWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentTemplateOrderByWithRelationInputSchema.array(), ShipmentTemplateOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentTemplateWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentTemplateGroupByArgsSchema: z.ZodType<Prisma.ShipmentTemplateGroupByArgs> = z.object({
  where: ShipmentTemplateWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentTemplateOrderByWithAggregationInputSchema.array(), ShipmentTemplateOrderByWithAggregationInputSchema ]).optional(),
  by: ShipmentTemplateScalarFieldEnumSchema.array(), 
  having: ShipmentTemplateScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ShipmentTemplateFindUniqueArgsSchema: z.ZodType<Prisma.ShipmentTemplateFindUniqueArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereUniqueInputSchema, 
}).strict();

export const ShipmentTemplateFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ShipmentTemplateFindUniqueOrThrowArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereUniqueInputSchema, 
}).strict();

export const DocumentFindFirstArgsSchema: z.ZodType<Prisma.DocumentFindFirstArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereInputSchema.optional(), 
  orderBy: z.union([ DocumentOrderByWithRelationInputSchema.array(), DocumentOrderByWithRelationInputSchema ]).optional(),
  cursor: DocumentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ DocumentScalarFieldEnumSchema, DocumentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const DocumentFindFirstOrThrowArgsSchema: z.ZodType<Prisma.DocumentFindFirstOrThrowArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereInputSchema.optional(), 
  orderBy: z.union([ DocumentOrderByWithRelationInputSchema.array(), DocumentOrderByWithRelationInputSchema ]).optional(),
  cursor: DocumentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ DocumentScalarFieldEnumSchema, DocumentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const DocumentFindManyArgsSchema: z.ZodType<Prisma.DocumentFindManyArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereInputSchema.optional(), 
  orderBy: z.union([ DocumentOrderByWithRelationInputSchema.array(), DocumentOrderByWithRelationInputSchema ]).optional(),
  cursor: DocumentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ DocumentScalarFieldEnumSchema, DocumentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const DocumentAggregateArgsSchema: z.ZodType<Prisma.DocumentAggregateArgs> = z.object({
  where: DocumentWhereInputSchema.optional(), 
  orderBy: z.union([ DocumentOrderByWithRelationInputSchema.array(), DocumentOrderByWithRelationInputSchema ]).optional(),
  cursor: DocumentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const DocumentGroupByArgsSchema: z.ZodType<Prisma.DocumentGroupByArgs> = z.object({
  where: DocumentWhereInputSchema.optional(), 
  orderBy: z.union([ DocumentOrderByWithAggregationInputSchema.array(), DocumentOrderByWithAggregationInputSchema ]).optional(),
  by: DocumentScalarFieldEnumSchema.array(), 
  having: DocumentScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const DocumentFindUniqueArgsSchema: z.ZodType<Prisma.DocumentFindUniqueArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereUniqueInputSchema, 
}).strict();

export const DocumentFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.DocumentFindUniqueOrThrowArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereUniqueInputSchema, 
}).strict();

export const UserFindFirstArgsSchema: z.ZodType<Prisma.UserFindFirstArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereInputSchema.optional(), 
  orderBy: z.union([ UserOrderByWithRelationInputSchema.array(), UserOrderByWithRelationInputSchema ]).optional(),
  cursor: UserWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ UserScalarFieldEnumSchema, UserScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const UserFindFirstOrThrowArgsSchema: z.ZodType<Prisma.UserFindFirstOrThrowArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereInputSchema.optional(), 
  orderBy: z.union([ UserOrderByWithRelationInputSchema.array(), UserOrderByWithRelationInputSchema ]).optional(),
  cursor: UserWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ UserScalarFieldEnumSchema, UserScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const UserFindManyArgsSchema: z.ZodType<Prisma.UserFindManyArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereInputSchema.optional(), 
  orderBy: z.union([ UserOrderByWithRelationInputSchema.array(), UserOrderByWithRelationInputSchema ]).optional(),
  cursor: UserWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ UserScalarFieldEnumSchema, UserScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const UserAggregateArgsSchema: z.ZodType<Prisma.UserAggregateArgs> = z.object({
  where: UserWhereInputSchema.optional(), 
  orderBy: z.union([ UserOrderByWithRelationInputSchema.array(), UserOrderByWithRelationInputSchema ]).optional(),
  cursor: UserWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const UserGroupByArgsSchema: z.ZodType<Prisma.UserGroupByArgs> = z.object({
  where: UserWhereInputSchema.optional(), 
  orderBy: z.union([ UserOrderByWithAggregationInputSchema.array(), UserOrderByWithAggregationInputSchema ]).optional(),
  by: UserScalarFieldEnumSchema.array(), 
  having: UserScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const UserFindUniqueArgsSchema: z.ZodType<Prisma.UserFindUniqueArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereUniqueInputSchema, 
}).strict();

export const UserFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.UserFindUniqueOrThrowArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereUniqueInputSchema, 
}).strict();

export const ErpExportConfigFindFirstArgsSchema: z.ZodType<Prisma.ErpExportConfigFindFirstArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportConfigOrderByWithRelationInputSchema.array(), ErpExportConfigOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportConfigWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportConfigScalarFieldEnumSchema, ErpExportConfigScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportConfigFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ErpExportConfigFindFirstOrThrowArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportConfigOrderByWithRelationInputSchema.array(), ErpExportConfigOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportConfigWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportConfigScalarFieldEnumSchema, ErpExportConfigScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportConfigFindManyArgsSchema: z.ZodType<Prisma.ErpExportConfigFindManyArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportConfigOrderByWithRelationInputSchema.array(), ErpExportConfigOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportConfigWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportConfigScalarFieldEnumSchema, ErpExportConfigScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportConfigAggregateArgsSchema: z.ZodType<Prisma.ErpExportConfigAggregateArgs> = z.object({
  where: ErpExportConfigWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportConfigOrderByWithRelationInputSchema.array(), ErpExportConfigOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportConfigWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ErpExportConfigGroupByArgsSchema: z.ZodType<Prisma.ErpExportConfigGroupByArgs> = z.object({
  where: ErpExportConfigWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportConfigOrderByWithAggregationInputSchema.array(), ErpExportConfigOrderByWithAggregationInputSchema ]).optional(),
  by: ErpExportConfigScalarFieldEnumSchema.array(), 
  having: ErpExportConfigScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ErpExportConfigFindUniqueArgsSchema: z.ZodType<Prisma.ErpExportConfigFindUniqueArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereUniqueInputSchema, 
}).strict();

export const ErpExportConfigFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ErpExportConfigFindUniqueOrThrowArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereUniqueInputSchema, 
}).strict();

export const ErpExportJobFindFirstArgsSchema: z.ZodType<Prisma.ErpExportJobFindFirstArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportJobOrderByWithRelationInputSchema.array(), ErpExportJobOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportJobWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportJobScalarFieldEnumSchema, ErpExportJobScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportJobFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ErpExportJobFindFirstOrThrowArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportJobOrderByWithRelationInputSchema.array(), ErpExportJobOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportJobWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportJobScalarFieldEnumSchema, ErpExportJobScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportJobFindManyArgsSchema: z.ZodType<Prisma.ErpExportJobFindManyArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportJobOrderByWithRelationInputSchema.array(), ErpExportJobOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportJobWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ErpExportJobScalarFieldEnumSchema, ErpExportJobScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ErpExportJobAggregateArgsSchema: z.ZodType<Prisma.ErpExportJobAggregateArgs> = z.object({
  where: ErpExportJobWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportJobOrderByWithRelationInputSchema.array(), ErpExportJobOrderByWithRelationInputSchema ]).optional(),
  cursor: ErpExportJobWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ErpExportJobGroupByArgsSchema: z.ZodType<Prisma.ErpExportJobGroupByArgs> = z.object({
  where: ErpExportJobWhereInputSchema.optional(), 
  orderBy: z.union([ ErpExportJobOrderByWithAggregationInputSchema.array(), ErpExportJobOrderByWithAggregationInputSchema ]).optional(),
  by: ErpExportJobScalarFieldEnumSchema.array(), 
  having: ErpExportJobScalarWhereWithAggregatesInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
}).strict();

export const ErpExportJobFindUniqueArgsSchema: z.ZodType<Prisma.ErpExportJobFindUniqueArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereUniqueInputSchema, 
}).strict();

export const ErpExportJobFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ErpExportJobFindUniqueOrThrowArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereUniqueInputSchema, 
}).strict();

export const PartyCreateArgsSchema: z.ZodType<Prisma.PartyCreateArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  data: z.union([ PartyCreateInputSchema, PartyUncheckedCreateInputSchema ]),
}).strict();

export const PartyUpsertArgsSchema: z.ZodType<Prisma.PartyUpsertArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereUniqueInputSchema, 
  create: z.union([ PartyCreateInputSchema, PartyUncheckedCreateInputSchema ]),
  update: z.union([ PartyUpdateInputSchema, PartyUncheckedUpdateInputSchema ]),
}).strict();

export const PartyCreateManyArgsSchema: z.ZodType<Prisma.PartyCreateManyArgs> = z.object({
  data: z.union([ PartyCreateManyInputSchema, PartyCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const PartyCreateManyAndReturnArgsSchema: z.ZodType<Prisma.PartyCreateManyAndReturnArgs> = z.object({
  data: z.union([ PartyCreateManyInputSchema, PartyCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const PartyDeleteArgsSchema: z.ZodType<Prisma.PartyDeleteArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  where: PartyWhereUniqueInputSchema, 
}).strict();

export const PartyUpdateArgsSchema: z.ZodType<Prisma.PartyUpdateArgs> = z.object({
  select: PartySelectSchema.optional(),
  include: PartyIncludeSchema.optional(),
  data: z.union([ PartyUpdateInputSchema, PartyUncheckedUpdateInputSchema ]),
  where: PartyWhereUniqueInputSchema, 
}).strict();

export const PartyUpdateManyArgsSchema: z.ZodType<Prisma.PartyUpdateManyArgs> = z.object({
  data: z.union([ PartyUpdateManyMutationInputSchema, PartyUncheckedUpdateManyInputSchema ]),
  where: PartyWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const PartyUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.PartyUpdateManyAndReturnArgs> = z.object({
  data: z.union([ PartyUpdateManyMutationInputSchema, PartyUncheckedUpdateManyInputSchema ]),
  where: PartyWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const PartyDeleteManyArgsSchema: z.ZodType<Prisma.PartyDeleteManyArgs> = z.object({
  where: PartyWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentCreateArgsSchema: z.ZodType<Prisma.ShipmentCreateArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  data: z.union([ ShipmentCreateInputSchema, ShipmentUncheckedCreateInputSchema ]),
}).strict();

export const ShipmentUpsertArgsSchema: z.ZodType<Prisma.ShipmentUpsertArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereUniqueInputSchema, 
  create: z.union([ ShipmentCreateInputSchema, ShipmentUncheckedCreateInputSchema ]),
  update: z.union([ ShipmentUpdateInputSchema, ShipmentUncheckedUpdateInputSchema ]),
}).strict();

export const ShipmentCreateManyArgsSchema: z.ZodType<Prisma.ShipmentCreateManyArgs> = z.object({
  data: z.union([ ShipmentCreateManyInputSchema, ShipmentCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentCreateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentCreateManyInputSchema, ShipmentCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentDeleteArgsSchema: z.ZodType<Prisma.ShipmentDeleteArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentUpdateArgsSchema: z.ZodType<Prisma.ShipmentUpdateArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  include: ShipmentIncludeSchema.optional(),
  data: z.union([ ShipmentUpdateInputSchema, ShipmentUncheckedUpdateInputSchema ]),
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentUpdateManyArgsSchema: z.ZodType<Prisma.ShipmentUpdateManyArgs> = z.object({
  data: z.union([ ShipmentUpdateManyMutationInputSchema, ShipmentUncheckedUpdateManyInputSchema ]),
  where: ShipmentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentUpdateManyMutationInputSchema, ShipmentUncheckedUpdateManyInputSchema ]),
  where: ShipmentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentDeleteManyArgsSchema: z.ZodType<Prisma.ShipmentDeleteManyArgs> = z.object({
  where: ShipmentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const CarrierAccountCreateArgsSchema: z.ZodType<Prisma.CarrierAccountCreateArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  data: z.union([ CarrierAccountCreateInputSchema, CarrierAccountUncheckedCreateInputSchema ]),
}).strict();

export const CarrierAccountUpsertArgsSchema: z.ZodType<Prisma.CarrierAccountUpsertArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereUniqueInputSchema, 
  create: z.union([ CarrierAccountCreateInputSchema, CarrierAccountUncheckedCreateInputSchema ]),
  update: z.union([ CarrierAccountUpdateInputSchema, CarrierAccountUncheckedUpdateInputSchema ]),
}).strict();

export const CarrierAccountCreateManyArgsSchema: z.ZodType<Prisma.CarrierAccountCreateManyArgs> = z.object({
  data: z.union([ CarrierAccountCreateManyInputSchema, CarrierAccountCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const CarrierAccountCreateManyAndReturnArgsSchema: z.ZodType<Prisma.CarrierAccountCreateManyAndReturnArgs> = z.object({
  data: z.union([ CarrierAccountCreateManyInputSchema, CarrierAccountCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const CarrierAccountDeleteArgsSchema: z.ZodType<Prisma.CarrierAccountDeleteArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  where: CarrierAccountWhereUniqueInputSchema, 
}).strict();

export const CarrierAccountUpdateArgsSchema: z.ZodType<Prisma.CarrierAccountUpdateArgs> = z.object({
  select: CarrierAccountSelectSchema.optional(),
  data: z.union([ CarrierAccountUpdateInputSchema, CarrierAccountUncheckedUpdateInputSchema ]),
  where: CarrierAccountWhereUniqueInputSchema, 
}).strict();

export const CarrierAccountUpdateManyArgsSchema: z.ZodType<Prisma.CarrierAccountUpdateManyArgs> = z.object({
  data: z.union([ CarrierAccountUpdateManyMutationInputSchema, CarrierAccountUncheckedUpdateManyInputSchema ]),
  where: CarrierAccountWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const CarrierAccountUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.CarrierAccountUpdateManyAndReturnArgs> = z.object({
  data: z.union([ CarrierAccountUpdateManyMutationInputSchema, CarrierAccountUncheckedUpdateManyInputSchema ]),
  where: CarrierAccountWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const CarrierAccountDeleteManyArgsSchema: z.ZodType<Prisma.CarrierAccountDeleteManyArgs> = z.object({
  where: CarrierAccountWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentCarrierMetaCreateArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  data: z.union([ ShipmentCarrierMetaCreateInputSchema, ShipmentCarrierMetaUncheckedCreateInputSchema ]),
}).strict();

export const ShipmentCarrierMetaUpsertArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpsertArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereUniqueInputSchema, 
  create: z.union([ ShipmentCarrierMetaCreateInputSchema, ShipmentCarrierMetaUncheckedCreateInputSchema ]),
  update: z.union([ ShipmentCarrierMetaUpdateInputSchema, ShipmentCarrierMetaUncheckedUpdateInputSchema ]),
}).strict();

export const ShipmentCarrierMetaCreateManyArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateManyArgs> = z.object({
  data: z.union([ ShipmentCarrierMetaCreateManyInputSchema, ShipmentCarrierMetaCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentCarrierMetaCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaCreateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentCarrierMetaCreateManyInputSchema, ShipmentCarrierMetaCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentCarrierMetaDeleteArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaDeleteArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  where: ShipmentCarrierMetaWhereUniqueInputSchema, 
}).strict();

export const ShipmentCarrierMetaUpdateArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateArgs> = z.object({
  select: ShipmentCarrierMetaSelectSchema.optional(),
  include: ShipmentCarrierMetaIncludeSchema.optional(),
  data: z.union([ ShipmentCarrierMetaUpdateInputSchema, ShipmentCarrierMetaUncheckedUpdateInputSchema ]),
  where: ShipmentCarrierMetaWhereUniqueInputSchema, 
}).strict();

export const ShipmentCarrierMetaUpdateManyArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateManyArgs> = z.object({
  data: z.union([ ShipmentCarrierMetaUpdateManyMutationInputSchema, ShipmentCarrierMetaUncheckedUpdateManyInputSchema ]),
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentCarrierMetaUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentCarrierMetaUpdateManyMutationInputSchema, ShipmentCarrierMetaUncheckedUpdateManyInputSchema ]),
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentCarrierMetaDeleteManyArgsSchema: z.ZodType<Prisma.ShipmentCarrierMetaDeleteManyArgs> = z.object({
  where: ShipmentCarrierMetaWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ForwarderProfileCreateArgsSchema: z.ZodType<Prisma.ForwarderProfileCreateArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  data: z.union([ ForwarderProfileCreateInputSchema, ForwarderProfileUncheckedCreateInputSchema ]),
}).strict();

export const ForwarderProfileUpsertArgsSchema: z.ZodType<Prisma.ForwarderProfileUpsertArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereUniqueInputSchema, 
  create: z.union([ ForwarderProfileCreateInputSchema, ForwarderProfileUncheckedCreateInputSchema ]),
  update: z.union([ ForwarderProfileUpdateInputSchema, ForwarderProfileUncheckedUpdateInputSchema ]),
}).strict();

export const ForwarderProfileCreateManyArgsSchema: z.ZodType<Prisma.ForwarderProfileCreateManyArgs> = z.object({
  data: z.union([ ForwarderProfileCreateManyInputSchema, ForwarderProfileCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ForwarderProfileCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ForwarderProfileCreateManyAndReturnArgs> = z.object({
  data: z.union([ ForwarderProfileCreateManyInputSchema, ForwarderProfileCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ForwarderProfileDeleteArgsSchema: z.ZodType<Prisma.ForwarderProfileDeleteArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  where: ForwarderProfileWhereUniqueInputSchema, 
}).strict();

export const ForwarderProfileUpdateArgsSchema: z.ZodType<Prisma.ForwarderProfileUpdateArgs> = z.object({
  select: ForwarderProfileSelectSchema.optional(),
  data: z.union([ ForwarderProfileUpdateInputSchema, ForwarderProfileUncheckedUpdateInputSchema ]),
  where: ForwarderProfileWhereUniqueInputSchema, 
}).strict();

export const ForwarderProfileUpdateManyArgsSchema: z.ZodType<Prisma.ForwarderProfileUpdateManyArgs> = z.object({
  data: z.union([ ForwarderProfileUpdateManyMutationInputSchema, ForwarderProfileUncheckedUpdateManyInputSchema ]),
  where: ForwarderProfileWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ForwarderProfileUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ForwarderProfileUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ForwarderProfileUpdateManyMutationInputSchema, ForwarderProfileUncheckedUpdateManyInputSchema ]),
  where: ForwarderProfileWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ForwarderProfileDeleteManyArgsSchema: z.ZodType<Prisma.ForwarderProfileDeleteManyArgs> = z.object({
  where: ForwarderProfileWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ProductCreateArgsSchema: z.ZodType<Prisma.ProductCreateArgs> = z.object({
  select: ProductSelectSchema.optional(),
  data: z.union([ ProductCreateInputSchema, ProductUncheckedCreateInputSchema ]),
}).strict();

export const ProductUpsertArgsSchema: z.ZodType<Prisma.ProductUpsertArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereUniqueInputSchema, 
  create: z.union([ ProductCreateInputSchema, ProductUncheckedCreateInputSchema ]),
  update: z.union([ ProductUpdateInputSchema, ProductUncheckedUpdateInputSchema ]),
}).strict();

export const ProductCreateManyArgsSchema: z.ZodType<Prisma.ProductCreateManyArgs> = z.object({
  data: z.union([ ProductCreateManyInputSchema, ProductCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ProductCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ProductCreateManyAndReturnArgs> = z.object({
  data: z.union([ ProductCreateManyInputSchema, ProductCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ProductDeleteArgsSchema: z.ZodType<Prisma.ProductDeleteArgs> = z.object({
  select: ProductSelectSchema.optional(),
  where: ProductWhereUniqueInputSchema, 
}).strict();

export const ProductUpdateArgsSchema: z.ZodType<Prisma.ProductUpdateArgs> = z.object({
  select: ProductSelectSchema.optional(),
  data: z.union([ ProductUpdateInputSchema, ProductUncheckedUpdateInputSchema ]),
  where: ProductWhereUniqueInputSchema, 
}).strict();

export const ProductUpdateManyArgsSchema: z.ZodType<Prisma.ProductUpdateManyArgs> = z.object({
  data: z.union([ ProductUpdateManyMutationInputSchema, ProductUncheckedUpdateManyInputSchema ]),
  where: ProductWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ProductUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ProductUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ProductUpdateManyMutationInputSchema, ProductUncheckedUpdateManyInputSchema ]),
  where: ProductWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ProductDeleteManyArgsSchema: z.ZodType<Prisma.ProductDeleteManyArgs> = z.object({
  where: ProductWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const SanctionsCheckResultCreateArgsSchema: z.ZodType<Prisma.SanctionsCheckResultCreateArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  data: z.union([ SanctionsCheckResultCreateInputSchema, SanctionsCheckResultUncheckedCreateInputSchema ]),
}).strict();

export const SanctionsCheckResultUpsertArgsSchema: z.ZodType<Prisma.SanctionsCheckResultUpsertArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereUniqueInputSchema, 
  create: z.union([ SanctionsCheckResultCreateInputSchema, SanctionsCheckResultUncheckedCreateInputSchema ]),
  update: z.union([ SanctionsCheckResultUpdateInputSchema, SanctionsCheckResultUncheckedUpdateInputSchema ]),
}).strict();

export const SanctionsCheckResultCreateManyArgsSchema: z.ZodType<Prisma.SanctionsCheckResultCreateManyArgs> = z.object({
  data: z.union([ SanctionsCheckResultCreateManyInputSchema, SanctionsCheckResultCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const SanctionsCheckResultCreateManyAndReturnArgsSchema: z.ZodType<Prisma.SanctionsCheckResultCreateManyAndReturnArgs> = z.object({
  data: z.union([ SanctionsCheckResultCreateManyInputSchema, SanctionsCheckResultCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const SanctionsCheckResultDeleteArgsSchema: z.ZodType<Prisma.SanctionsCheckResultDeleteArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  where: SanctionsCheckResultWhereUniqueInputSchema, 
}).strict();

export const SanctionsCheckResultUpdateArgsSchema: z.ZodType<Prisma.SanctionsCheckResultUpdateArgs> = z.object({
  select: SanctionsCheckResultSelectSchema.optional(),
  data: z.union([ SanctionsCheckResultUpdateInputSchema, SanctionsCheckResultUncheckedUpdateInputSchema ]),
  where: SanctionsCheckResultWhereUniqueInputSchema, 
}).strict();

export const SanctionsCheckResultUpdateManyArgsSchema: z.ZodType<Prisma.SanctionsCheckResultUpdateManyArgs> = z.object({
  data: z.union([ SanctionsCheckResultUpdateManyMutationInputSchema, SanctionsCheckResultUncheckedUpdateManyInputSchema ]),
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const SanctionsCheckResultUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.SanctionsCheckResultUpdateManyAndReturnArgs> = z.object({
  data: z.union([ SanctionsCheckResultUpdateManyMutationInputSchema, SanctionsCheckResultUncheckedUpdateManyInputSchema ]),
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const SanctionsCheckResultDeleteManyArgsSchema: z.ZodType<Prisma.SanctionsCheckResultDeleteManyArgs> = z.object({
  where: SanctionsCheckResultWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentTemplateCreateArgsSchema: z.ZodType<Prisma.ShipmentTemplateCreateArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  data: z.union([ ShipmentTemplateCreateInputSchema, ShipmentTemplateUncheckedCreateInputSchema ]),
}).strict();

export const ShipmentTemplateUpsertArgsSchema: z.ZodType<Prisma.ShipmentTemplateUpsertArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereUniqueInputSchema, 
  create: z.union([ ShipmentTemplateCreateInputSchema, ShipmentTemplateUncheckedCreateInputSchema ]),
  update: z.union([ ShipmentTemplateUpdateInputSchema, ShipmentTemplateUncheckedUpdateInputSchema ]),
}).strict();

export const ShipmentTemplateCreateManyArgsSchema: z.ZodType<Prisma.ShipmentTemplateCreateManyArgs> = z.object({
  data: z.union([ ShipmentTemplateCreateManyInputSchema, ShipmentTemplateCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentTemplateCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentTemplateCreateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentTemplateCreateManyInputSchema, ShipmentTemplateCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ShipmentTemplateDeleteArgsSchema: z.ZodType<Prisma.ShipmentTemplateDeleteArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  where: ShipmentTemplateWhereUniqueInputSchema, 
}).strict();

export const ShipmentTemplateUpdateArgsSchema: z.ZodType<Prisma.ShipmentTemplateUpdateArgs> = z.object({
  select: ShipmentTemplateSelectSchema.optional(),
  data: z.union([ ShipmentTemplateUpdateInputSchema, ShipmentTemplateUncheckedUpdateInputSchema ]),
  where: ShipmentTemplateWhereUniqueInputSchema, 
}).strict();

export const ShipmentTemplateUpdateManyArgsSchema: z.ZodType<Prisma.ShipmentTemplateUpdateManyArgs> = z.object({
  data: z.union([ ShipmentTemplateUpdateManyMutationInputSchema, ShipmentTemplateUncheckedUpdateManyInputSchema ]),
  where: ShipmentTemplateWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentTemplateUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ShipmentTemplateUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ShipmentTemplateUpdateManyMutationInputSchema, ShipmentTemplateUncheckedUpdateManyInputSchema ]),
  where: ShipmentTemplateWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ShipmentTemplateDeleteManyArgsSchema: z.ZodType<Prisma.ShipmentTemplateDeleteManyArgs> = z.object({
  where: ShipmentTemplateWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const DocumentCreateArgsSchema: z.ZodType<Prisma.DocumentCreateArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  data: z.union([ DocumentCreateInputSchema, DocumentUncheckedCreateInputSchema ]),
}).strict();

export const DocumentUpsertArgsSchema: z.ZodType<Prisma.DocumentUpsertArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereUniqueInputSchema, 
  create: z.union([ DocumentCreateInputSchema, DocumentUncheckedCreateInputSchema ]),
  update: z.union([ DocumentUpdateInputSchema, DocumentUncheckedUpdateInputSchema ]),
}).strict();

export const DocumentCreateManyArgsSchema: z.ZodType<Prisma.DocumentCreateManyArgs> = z.object({
  data: z.union([ DocumentCreateManyInputSchema, DocumentCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const DocumentCreateManyAndReturnArgsSchema: z.ZodType<Prisma.DocumentCreateManyAndReturnArgs> = z.object({
  data: z.union([ DocumentCreateManyInputSchema, DocumentCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const DocumentDeleteArgsSchema: z.ZodType<Prisma.DocumentDeleteArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  where: DocumentWhereUniqueInputSchema, 
}).strict();

export const DocumentUpdateArgsSchema: z.ZodType<Prisma.DocumentUpdateArgs> = z.object({
  select: DocumentSelectSchema.optional(),
  data: z.union([ DocumentUpdateInputSchema, DocumentUncheckedUpdateInputSchema ]),
  where: DocumentWhereUniqueInputSchema, 
}).strict();

export const DocumentUpdateManyArgsSchema: z.ZodType<Prisma.DocumentUpdateManyArgs> = z.object({
  data: z.union([ DocumentUpdateManyMutationInputSchema, DocumentUncheckedUpdateManyInputSchema ]),
  where: DocumentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const DocumentUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.DocumentUpdateManyAndReturnArgs> = z.object({
  data: z.union([ DocumentUpdateManyMutationInputSchema, DocumentUncheckedUpdateManyInputSchema ]),
  where: DocumentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const DocumentDeleteManyArgsSchema: z.ZodType<Prisma.DocumentDeleteManyArgs> = z.object({
  where: DocumentWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const UserCreateArgsSchema: z.ZodType<Prisma.UserCreateArgs> = z.object({
  select: UserSelectSchema.optional(),
  data: z.union([ UserCreateInputSchema, UserUncheckedCreateInputSchema ]),
}).strict();

export const UserUpsertArgsSchema: z.ZodType<Prisma.UserUpsertArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereUniqueInputSchema, 
  create: z.union([ UserCreateInputSchema, UserUncheckedCreateInputSchema ]),
  update: z.union([ UserUpdateInputSchema, UserUncheckedUpdateInputSchema ]),
}).strict();

export const UserCreateManyArgsSchema: z.ZodType<Prisma.UserCreateManyArgs> = z.object({
  data: z.union([ UserCreateManyInputSchema, UserCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const UserCreateManyAndReturnArgsSchema: z.ZodType<Prisma.UserCreateManyAndReturnArgs> = z.object({
  data: z.union([ UserCreateManyInputSchema, UserCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const UserDeleteArgsSchema: z.ZodType<Prisma.UserDeleteArgs> = z.object({
  select: UserSelectSchema.optional(),
  where: UserWhereUniqueInputSchema, 
}).strict();

export const UserUpdateArgsSchema: z.ZodType<Prisma.UserUpdateArgs> = z.object({
  select: UserSelectSchema.optional(),
  data: z.union([ UserUpdateInputSchema, UserUncheckedUpdateInputSchema ]),
  where: UserWhereUniqueInputSchema, 
}).strict();

export const UserUpdateManyArgsSchema: z.ZodType<Prisma.UserUpdateManyArgs> = z.object({
  data: z.union([ UserUpdateManyMutationInputSchema, UserUncheckedUpdateManyInputSchema ]),
  where: UserWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const UserUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.UserUpdateManyAndReturnArgs> = z.object({
  data: z.union([ UserUpdateManyMutationInputSchema, UserUncheckedUpdateManyInputSchema ]),
  where: UserWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const UserDeleteManyArgsSchema: z.ZodType<Prisma.UserDeleteManyArgs> = z.object({
  where: UserWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportConfigCreateArgsSchema: z.ZodType<Prisma.ErpExportConfigCreateArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  data: z.union([ ErpExportConfigCreateInputSchema, ErpExportConfigUncheckedCreateInputSchema ]),
}).strict();

export const ErpExportConfigUpsertArgsSchema: z.ZodType<Prisma.ErpExportConfigUpsertArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereUniqueInputSchema, 
  create: z.union([ ErpExportConfigCreateInputSchema, ErpExportConfigUncheckedCreateInputSchema ]),
  update: z.union([ ErpExportConfigUpdateInputSchema, ErpExportConfigUncheckedUpdateInputSchema ]),
}).strict();

export const ErpExportConfigCreateManyArgsSchema: z.ZodType<Prisma.ErpExportConfigCreateManyArgs> = z.object({
  data: z.union([ ErpExportConfigCreateManyInputSchema, ErpExportConfigCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ErpExportConfigCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ErpExportConfigCreateManyAndReturnArgs> = z.object({
  data: z.union([ ErpExportConfigCreateManyInputSchema, ErpExportConfigCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ErpExportConfigDeleteArgsSchema: z.ZodType<Prisma.ErpExportConfigDeleteArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  where: ErpExportConfigWhereUniqueInputSchema, 
}).strict();

export const ErpExportConfigUpdateArgsSchema: z.ZodType<Prisma.ErpExportConfigUpdateArgs> = z.object({
  select: ErpExportConfigSelectSchema.optional(),
  data: z.union([ ErpExportConfigUpdateInputSchema, ErpExportConfigUncheckedUpdateInputSchema ]),
  where: ErpExportConfigWhereUniqueInputSchema, 
}).strict();

export const ErpExportConfigUpdateManyArgsSchema: z.ZodType<Prisma.ErpExportConfigUpdateManyArgs> = z.object({
  data: z.union([ ErpExportConfigUpdateManyMutationInputSchema, ErpExportConfigUncheckedUpdateManyInputSchema ]),
  where: ErpExportConfigWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportConfigUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ErpExportConfigUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ErpExportConfigUpdateManyMutationInputSchema, ErpExportConfigUncheckedUpdateManyInputSchema ]),
  where: ErpExportConfigWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportConfigDeleteManyArgsSchema: z.ZodType<Prisma.ErpExportConfigDeleteManyArgs> = z.object({
  where: ErpExportConfigWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportJobCreateArgsSchema: z.ZodType<Prisma.ErpExportJobCreateArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  data: z.union([ ErpExportJobCreateInputSchema, ErpExportJobUncheckedCreateInputSchema ]),
}).strict();

export const ErpExportJobUpsertArgsSchema: z.ZodType<Prisma.ErpExportJobUpsertArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereUniqueInputSchema, 
  create: z.union([ ErpExportJobCreateInputSchema, ErpExportJobUncheckedCreateInputSchema ]),
  update: z.union([ ErpExportJobUpdateInputSchema, ErpExportJobUncheckedUpdateInputSchema ]),
}).strict();

export const ErpExportJobCreateManyArgsSchema: z.ZodType<Prisma.ErpExportJobCreateManyArgs> = z.object({
  data: z.union([ ErpExportJobCreateManyInputSchema, ErpExportJobCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ErpExportJobCreateManyAndReturnArgsSchema: z.ZodType<Prisma.ErpExportJobCreateManyAndReturnArgs> = z.object({
  data: z.union([ ErpExportJobCreateManyInputSchema, ErpExportJobCreateManyInputSchema.array() ]),
  skipDuplicates: z.boolean().optional(),
}).strict();

export const ErpExportJobDeleteArgsSchema: z.ZodType<Prisma.ErpExportJobDeleteArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  where: ErpExportJobWhereUniqueInputSchema, 
}).strict();

export const ErpExportJobUpdateArgsSchema: z.ZodType<Prisma.ErpExportJobUpdateArgs> = z.object({
  select: ErpExportJobSelectSchema.optional(),
  data: z.union([ ErpExportJobUpdateInputSchema, ErpExportJobUncheckedUpdateInputSchema ]),
  where: ErpExportJobWhereUniqueInputSchema, 
}).strict();

export const ErpExportJobUpdateManyArgsSchema: z.ZodType<Prisma.ErpExportJobUpdateManyArgs> = z.object({
  data: z.union([ ErpExportJobUpdateManyMutationInputSchema, ErpExportJobUncheckedUpdateManyInputSchema ]),
  where: ErpExportJobWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportJobUpdateManyAndReturnArgsSchema: z.ZodType<Prisma.ErpExportJobUpdateManyAndReturnArgs> = z.object({
  data: z.union([ ErpExportJobUpdateManyMutationInputSchema, ErpExportJobUncheckedUpdateManyInputSchema ]),
  where: ErpExportJobWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();

export const ErpExportJobDeleteManyArgsSchema: z.ZodType<Prisma.ErpExportJobDeleteManyArgs> = z.object({
  where: ErpExportJobWhereInputSchema.optional(), 
  limit: z.number().optional(),
}).strict();