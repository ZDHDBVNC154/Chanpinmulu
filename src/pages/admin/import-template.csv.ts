import type { APIRoute } from 'astro';
export const prerender = false;
export const GET: APIRoute = () => {
  const header = 'sku,name,name_zh,category,description,material,dimensions,colors,moq,inner_pack,carton_pack,carton_size,gross_weight,net_weight,sample_lead_time,production_lead_time,certifications,oem_available,is_new,is_featured,show_price,price,active';
  const sample = 'XMAS-001,Lighted Christmas Village,圣诞发光村庄,Christmas Village,Hand-painted polyresin decoration,Polyresin,20 x 15 x 18 cm,Multicolor,500,1 pc / foam box,4 pcs / carton,45 x 35 x 42 cm,8.5 kg,7.2 kg,7 days,45-60 days,CE;RoHS,1,1,1,0,0,1';
  return new Response(`\uFEFF${header}\r\n${sample}\r\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="product-import-template.csv"' } });
};
