import { z } from 'zod';

const ImageSchema = z.object({
  id: z.number().positive(),
  src: z.string().optional(),
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

export const ImportProductSchema = z.object({
  id: z.number().positive(),
  slug: z.string().optional(),
  name: z.string().min(1).optional(),
  sku: z.string().optional(),
  title: z.string().optional(),
  meta_title: z.string().max(70).optional(),
  meta_description: z.string().optional().transform(val => {
    if (val && val.length > 160) {
      console.warn(`⚠️ meta_description обрезан с ${val.length} до 160 символов`);
      return val.slice(0, 157) + '...';
    }
    return val;
  }),
  focus_keyword: z.union([z.string(), z.array(z.string())]).optional().transform(val => {
    if (val === undefined || val === null) return undefined;
    let str = '';
    if (Array.isArray(val)) {
      str = val.join(', ');
      console.warn(`🔄 focus_keyword преобразован из массива (${val.length} элементов) в строку: "${str.slice(0, 50)}${str.length > 50 ? '…' : ''}"`);
    } else if (typeof val === 'string') {
      str = val;
    } else {
      return undefined;
    }
    // Обрезаем до 100 символов, если превышает (Rank Math рекомендует не более 100)
    if (str.length > 100) {
      console.warn(`⚠️ focus_keyword обрезан с ${str.length} до 100 символов`);
      str = str.slice(0, 97) + '...';
    }
    return str;
  }),
  description: z.string().optional(),
  short_description: z.string().optional(),
  images: z.array(ImageSchema).optional(),
});

export const ImportDataSchema = z.array(ImportProductSchema);