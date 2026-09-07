export interface InquiryContact {
  contactName: string;
  company: string;
  email: string;
  phone: string | null;
  country: string;
  targetDelivery: string | null;
  message: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseInquiryForm(
  form: FormData,
): { data: InquiryContact } | { error: string } {
  // Honeypot: bots tend to fill every field. Report success to the route without
  // spending writes; humans never see this field.
  if (String(form.get('website') ?? '').trim()) return { error: 'spam' };

  const contactName = String(form.get('contact_name') ?? '').trim().slice(0, 120);
  const company = String(form.get('company') ?? '').trim().slice(0, 180);
  const email = String(form.get('email') ?? '').trim().toLowerCase().slice(0, 254);
  const country = String(form.get('country') ?? '').trim().slice(0, 120);
  if (!contactName) return { error: 'Please enter your name.' };
  if (!company) return { error: 'Please enter your company name.' };
  if (!EMAIL.test(email)) return { error: 'Please enter a valid business email.' };
  if (!country) return { error: 'Please enter your country or region.' };

  const optional = (name: string, max: number) => {
    const value = String(form.get(name) ?? '').trim().slice(0, max);
    return value || null;
  };
  return {
    data: {
      contactName,
      company,
      email,
      country,
      phone: optional('phone', 120),
      targetDelivery: optional('target_delivery', 120),
      message: optional('message', 3000),
    },
  };
}
