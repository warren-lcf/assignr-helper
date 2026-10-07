import { z } from 'zod';

/** Assignr ids may arrive as numbers or strings; normalise to string. */
export const assignr_id_schema = z.union([z.string(), z.number()]).transform(String);
