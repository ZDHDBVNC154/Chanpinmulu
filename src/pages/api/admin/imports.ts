import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { csvObjects } from '../../../features/imports/csv';
import { createProduct, getProductBySku, updateProduct, type ProductInput } from '../../../features/products/db';
import { uniqueSlug } from '../../../features/products/slug';
import { listCategories, setProductCategories } from '../../../features/categories/db';
import { toMinorUnits } from '../../../money';
import { CACHE_TAG } from '../../../features/cache/tags';
import { purgeCacheTags } from '../../../features/cache/purge';

export const prerender = false;
const back = (kind: 'success' | 'error', message: string) => `/admin/imports?${kind}=${encodeURIComponent(message)}`;
const flag = (value: string, fallback: number) => value === '' ? fallback : /^(1|true|yes|y|是)$/i.test(value) ? 1 : 0;
const nullable = (value: string, max: number) => value.trim().slice(0, max) || null;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return redirect(back('error', '请选择 CSV 文件。'), 303);
  if (file.size > 2 * 1024 * 1024) return redirect(back('error', '文件不能超过 2 MB。'), 303);

  let rows: Record<string, string>[];
  try { rows = csvObjects(await file.text()); }
  catch (error) { return redirect(back('error', error instanceof Error ? error.message : 'CSV 格式错误。'), 303); }
  if (rows.length === 0) return redirect(back('error', '文件中没有产品数据。'), 303);
  if (rows.length > 5000) return redirect(back('error', '单次最多导入 5,000 行。'), 303);
  const required = ['sku', 'name'];
  if (!required.every((header) => Object.hasOwn(rows[0], header))) return redirect(back('error', 'CSV 必须包含 sku 和 name 表头。'), 303);

  const normalized: Array<{ input: Omit<ProductInput, 'slug' | 'image_key'>; categoryNames: string[] }> = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const sku = row.sku.trim().toUpperCase();
    const name = row.name.trim();
    if (!sku || !name) return redirect(back('error', `第 ${line} 行缺少 SKU 或英文名称。`), 303);
    if (sku.length > 80 || name.length > 160) return redirect(back('error', `第 ${line} 行的 SKU 或名称过长。`), 303);
    if (seen.has(sku)) return redirect(back('error', `CSV 内 SKU ${sku} 重复。`), 303);
    seen.add(sku);
    const moq = Number(row.moq || '1');
    const price = Number(row.price || '0');
    if (!Number.isInteger(moq) || moq < 1 || moq > 100000000) return redirect(back('error', `第 ${line} 行 MOQ 无效。`), 303);
    if (!Number.isFinite(price) || price < 0) return redirect(back('error', `第 ${line} 行价格无效。`), 303);
    normalized.push({
      input: {
        sku, name, name_zh: nullable(row.name_zh ?? '', 160), description: nullable(row.description ?? '', 5000),
        material: nullable(row.material ?? '', 200), dimensions: nullable(row.dimensions ?? '', 200), colors: nullable(row.colors ?? '', 300), moq,
        inner_pack: nullable(row.inner_pack ?? '', 200), carton_pack: nullable(row.carton_pack ?? '', 200), carton_size: nullable(row.carton_size ?? '', 200),
        gross_weight: nullable(row.gross_weight ?? '', 100), net_weight: nullable(row.net_weight ?? '', 100),
        sample_lead_time: nullable(row.sample_lead_time ?? '', 200), production_lead_time: nullable(row.production_lead_time ?? '', 200), certifications: nullable(row.certifications ?? '', 500),
        oem_available: flag(row.oem_available ?? '', 1), is_new: flag(row.is_new ?? '', 0), is_featured: flag(row.is_featured ?? '', 0), show_price: flag(row.show_price ?? '', 0),
        price_cents: toMinorUnits(price, 'usd'), currency: 'usd', stock: 99_999_999, active: flag(row.active ?? '', 1), weight_grams: null, requires_shipping: 0,
      },
      categoryNames: (row.category ?? '').split(';').map((name) => name.trim().toLocaleLowerCase()).filter(Boolean),
    });
  }

  const categories = await listCategories(env.DB);
  const categoryMap = new Map(categories.map((category) => [category.name.trim().toLocaleLowerCase(), category.id]));
  let created = 0;
  let updated = 0;
  for (const row of normalized) {
    const existing = await getProductBySku(env.DB, row.input.sku!);
    let productId: number;
    if (existing) {
      productId = existing.id;
      await updateProduct(env.DB, existing.id, { ...row.input, slug: existing.slug, image_key: existing.image_key });
      updated += 1;
    } else {
      const slug = await uniqueSlug(env.DB, row.input.name);
      productId = await createProduct(env.DB, { ...row.input, slug, image_key: null });
      created += 1;
    }
    if (row.categoryNames.length > 0) {
      const ids = row.categoryNames.flatMap((name) => categoryMap.has(name) ? [categoryMap.get(name)!] : []);
      await setProductCategories(env.DB, productId, ids);
    }
  }
  await purgeCacheTags([CACHE_TAG.catalog]);
  return redirect(back('success', `导入完成：新增 ${created} 个，更新 ${updated} 个。`), 303);
};
