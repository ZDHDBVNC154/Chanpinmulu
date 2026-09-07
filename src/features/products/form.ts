import type { ProductFields } from './db';
import { toMinorUnits } from '../../money';
import { toGrams, type WeightUnit } from '../shipping/weight';

export interface ProductFormOptions {
  /** Admin's display unit. Storage is always grams. */
  unit?: WeightUnit;
  /**
   * True when at least one enabled zone prices by weight with no flat fallback —
   * i.e. when a missing weight would make this product unsellable. The merchant is
   * told at the field rather than discovering it as lost checkouts.
   */
  requireWeight?: boolean;
}

/**
 * Parse + validate the scalar product form fields. Prices arrive in major units
 * (e.g. dollars) and are stored as integer minor units, scaled by the product's
 * currency (×100 for USD, ×1 for JPY). Weight arrives in the store's display unit
 * and is stored as integer grams. The image upload is handled by the endpoint, not
 * here. Returns either the clean fields or a user-facing error.
 */
export function parseProductForm(
  form: FormData,
  options: ProductFormOptions = {},
): { data: ProductFields } | { error: string } {
  const { unit = 'g', requireWeight = false } = options;

  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: '请填写英文产品名称。' };
  if (name.length > 160) return { error: '英文产品名称不能超过160个字符。' };

  const sku = nullableText(form, 'sku', 80);
  if ('error' in sku) return sku;
  const nameZh = nullableText(form, 'name_zh', 160);
  if ('error' in nameZh) return nameZh;

  const price = Number(String(form.get('price') ?? '0').trim() || '0');
  if (!Number.isFinite(price) || price < 0) {
    return { error: '参考价格必须是大于或等于0的数字。' };
  }

  const stock = Number(String(form.get('stock') ?? '999999').trim());
  if (!Number.isInteger(stock) || stock < 0) {
    return { error: '内部库存值必须是非负整数。' };
  }

  const currency = String(form.get('currency') ?? 'usd').trim().toLowerCase() || 'usd';
  // Scale by the chosen currency's minor units (so 1000 JPY stores as 1000, not 100000).
  const price_cents = toMinorUnits(price, currency);
  const description = String(form.get('description') ?? '').trim() || null;
  // Unchecked checkboxes submit nothing, so absence means inactive.
  const active = form.get('active') != null ? 1 : 0;
  const requires_shipping = form.get('requires_shipping') != null ? 1 : 0;
  const moq = Number(String(form.get('moq') ?? '1').trim());
  if (!Number.isInteger(moq) || moq < 1 || moq > 100000000) {
    return { error: 'MOQ必须是1到100,000,000之间的整数。' };
  }

  const textFields = {
    material: nullableText(form, 'material', 200),
    dimensions: nullableText(form, 'dimensions', 200),
    colors: nullableText(form, 'colors', 300),
    inner_pack: nullableText(form, 'inner_pack', 200),
    carton_pack: nullableText(form, 'carton_pack', 200),
    carton_size: nullableText(form, 'carton_size', 200),
    gross_weight: nullableText(form, 'gross_weight', 100),
    net_weight: nullableText(form, 'net_weight', 100),
    sample_lead_time: nullableText(form, 'sample_lead_time', 200),
    production_lead_time: nullableText(form, 'production_lead_time', 200),
    certifications: nullableText(form, 'certifications', 500),
  };
  for (const field of Object.values(textFields)) {
    if ('error' in field) return field;
  }
  const textValue = (field: { value: string | null } | { error: string }) =>
    'value' in field ? field.value : null;

  const parsedWeight = toGrams(String(form.get('weight') ?? ''), unit);
  let weight_grams: number | null = null;
  if (parsedWeight.status === 'ok') {
    weight_grams = parsedWeight.grams;
  } else if (parsedWeight.status === 'error') {
    return { error: weightFieldError(parsedWeight.reason, unit) };
  } else if (requireWeight && requires_shipping === 1 && active === 1) {
    return {
      error:
        'This product needs a shipping weight: every shipping zone prices by weight, ' +
        'so without one it cannot be purchased.',
    };
  }

  return {
    data: {
      name,
      name_zh: nameZh.value,
      sku: sku.value?.toUpperCase() ?? null,
      description,
      material: textValue(textFields.material),
      dimensions: textValue(textFields.dimensions),
      colors: textValue(textFields.colors),
      moq,
      inner_pack: textValue(textFields.inner_pack),
      carton_pack: textValue(textFields.carton_pack),
      carton_size: textValue(textFields.carton_size),
      gross_weight: textValue(textFields.gross_weight),
      net_weight: textValue(textFields.net_weight),
      sample_lead_time: textValue(textFields.sample_lead_time),
      production_lead_time: textValue(textFields.production_lead_time),
      certifications: textValue(textFields.certifications),
      oem_available: form.get('oem_available') != null ? 1 : 0,
      is_new: form.get('is_new') != null ? 1 : 0,
      is_featured: form.get('is_featured') != null ? 1 : 0,
      show_price: form.get('show_price') != null ? 1 : 0,
      price_cents,
      currency,
      stock,
      active,
      weight_grams,
      requires_shipping,
    },
  };
}

function nullableText(
  form: FormData,
  name: string,
  max: number,
): { value: string | null } | { error: string } {
  const value = String(form.get(name) ?? '').trim();
  if (value.length > max) return { error: `${name}字段不能超过${max}个字符。` };
  return { value: value || null };
}

function weightFieldError(
  reason: 'not_number' | 'negative' | 'precision' | 'over_limit',
  unit: WeightUnit,
): string {
  switch (reason) {
    case 'negative':
      return 'Weight cannot be negative.';
    case 'precision':
      return `Weight has too many decimal places for ${unit}.`;
    case 'over_limit':
      return 'Weight is too heavy for parcel shipping.';
    default:
      return 'Weight must be a number.';
  }
}
