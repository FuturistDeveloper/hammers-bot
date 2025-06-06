import { z } from 'zod';

export const CreateTaskResponseSchema = z.object({
  Id: z.number(),
  Success: z.boolean(),
  TotalCount: z.number(),
  CreateDate: z.string().datetime(),
});

export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

export const CustomerSchema = z.object({
  lotCustomerShortName: z.string(),
});

export const TenderSchema = z.object({
  regNumber: z.string(),
  name: z.string(),
  beginPrice: z.number(),
  publishDate: z.string(),
  endDate: z.string(),
  region: z.string(),
  typeName: z.string(),
  lotCategories: z.array(z.string()).optional(),
  files: z.string().url(),
  module: z.string(),
  etpLink: z.string(),
  customers: z.array(CustomerSchema),
});

export const TenderItemSchema = z.object({
  ordinalNumber: z.number(),
  tender: TenderSchema,
});

export type TenderType = z.infer<typeof TenderSchema>;

export const TendersResponseSchema = z.object({
  items: z.array(TenderItemSchema),
});

export type TendersResponse = z.infer<typeof TendersResponseSchema>;
