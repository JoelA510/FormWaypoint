import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/////////////////////////////////////////
// HELPER FUNCTIONS
/////////////////////////////////////////


/////////////////////////////////////////
// ENUMS
/////////////////////////////////////////

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted','ReadCommitted','RepeatableRead','Serializable']);

export const ShipmentScalarFieldEnumSchema = z.enum(['id']);

export const SortOrderSchema = z.enum(['asc','desc']);

export const QueryModeSchema = z.enum(['default','insensitive']);
/////////////////////////////////////////
// MODELS
/////////////////////////////////////////

/////////////////////////////////////////
// SHIPMENT SCHEMA
/////////////////////////////////////////

export const ShipmentSchema = z.object({
  id: z.string().uuid(),
})

export type Shipment = z.infer<typeof ShipmentSchema>

/////////////////////////////////////////
// SELECT & INCLUDE
/////////////////////////////////////////

// SHIPMENT
//------------------------------------------------------

export const ShipmentSelectSchema: z.ZodType<Prisma.ShipmentSelect> = z.object({
  id: z.boolean().optional(),
}).strict()


/////////////////////////////////////////
// INPUT TYPES
/////////////////////////////////////////

export const ShipmentWhereInputSchema: z.ZodType<Prisma.ShipmentWhereInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringFilterSchema), z.string() ]).optional(),
}).strict();

export const ShipmentOrderByWithRelationInputSchema: z.ZodType<Prisma.ShipmentOrderByWithRelationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentWhereUniqueInputSchema: z.ZodType<Prisma.ShipmentWhereUniqueInput> = z.object({
  id: z.string().uuid(),
})
.and(z.object({
  id: z.string().uuid().optional(),
  AND: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentWhereInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentWhereInputSchema), z.lazy(() => ShipmentWhereInputSchema).array() ]).optional(),
}).strict());

export const ShipmentOrderByWithAggregationInputSchema: z.ZodType<Prisma.ShipmentOrderByWithAggregationInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
  _count: z.lazy(() => ShipmentCountOrderByAggregateInputSchema).optional(),
  _max: z.lazy(() => ShipmentMaxOrderByAggregateInputSchema).optional(),
  _min: z.lazy(() => ShipmentMinOrderByAggregateInputSchema).optional(),
}).strict();

export const ShipmentScalarWhereWithAggregatesInputSchema: z.ZodType<Prisma.ShipmentScalarWhereWithAggregatesInput> = z.object({
  AND: z.union([ z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  OR: z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array().optional(),
  NOT: z.union([ z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema), z.lazy(() => ShipmentScalarWhereWithAggregatesInputSchema).array() ]).optional(),
  id: z.union([ z.lazy(() => StringWithAggregatesFilterSchema), z.string() ]).optional(),
}).strict();

export const ShipmentCreateInputSchema: z.ZodType<Prisma.ShipmentCreateInput> = z.object({
  id: z.string().uuid().optional(),
}).strict();

export const ShipmentUncheckedCreateInputSchema: z.ZodType<Prisma.ShipmentUncheckedCreateInput> = z.object({
  id: z.string().uuid().optional(),
}).strict();

export const ShipmentUpdateInputSchema: z.ZodType<Prisma.ShipmentUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentUncheckedUpdateInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentCreateManyInputSchema: z.ZodType<Prisma.ShipmentCreateManyInput> = z.object({
  id: z.string().uuid().optional(),
}).strict();

export const ShipmentUpdateManyMutationInputSchema: z.ZodType<Prisma.ShipmentUpdateManyMutationInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
}).strict();

export const ShipmentUncheckedUpdateManyInputSchema: z.ZodType<Prisma.ShipmentUncheckedUpdateManyInput> = z.object({
  id: z.union([ z.string().uuid(),z.lazy(() => StringFieldUpdateOperationsInputSchema) ]).optional(),
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

export const ShipmentCountOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentCountOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentMaxOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentMaxOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
}).strict();

export const ShipmentMinOrderByAggregateInputSchema: z.ZodType<Prisma.ShipmentMinOrderByAggregateInput> = z.object({
  id: z.lazy(() => SortOrderSchema).optional(),
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

export const StringFieldUpdateOperationsInputSchema: z.ZodType<Prisma.StringFieldUpdateOperationsInput> = z.object({
  set: z.string().optional(),
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

/////////////////////////////////////////
// ARGS
/////////////////////////////////////////

export const ShipmentFindFirstArgsSchema: z.ZodType<Prisma.ShipmentFindFirstArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentScalarFieldEnumSchema, ShipmentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentFindFirstOrThrowArgsSchema: z.ZodType<Prisma.ShipmentFindFirstOrThrowArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  where: ShipmentWhereInputSchema.optional(), 
  orderBy: z.union([ ShipmentOrderByWithRelationInputSchema.array(), ShipmentOrderByWithRelationInputSchema ]).optional(),
  cursor: ShipmentWhereUniqueInputSchema.optional(), 
  take: z.number().optional(),
  skip: z.number().optional(),
  distinct: z.union([ ShipmentScalarFieldEnumSchema, ShipmentScalarFieldEnumSchema.array() ]).optional(),
}).strict();

export const ShipmentFindManyArgsSchema: z.ZodType<Prisma.ShipmentFindManyArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
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
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentFindUniqueOrThrowArgsSchema: z.ZodType<Prisma.ShipmentFindUniqueOrThrowArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentCreateArgsSchema: z.ZodType<Prisma.ShipmentCreateArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
  data: z.union([ ShipmentCreateInputSchema, ShipmentUncheckedCreateInputSchema ]).optional(),
}).strict();

export const ShipmentUpsertArgsSchema: z.ZodType<Prisma.ShipmentUpsertArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
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
  where: ShipmentWhereUniqueInputSchema, 
}).strict();

export const ShipmentUpdateArgsSchema: z.ZodType<Prisma.ShipmentUpdateArgs> = z.object({
  select: ShipmentSelectSchema.optional(),
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