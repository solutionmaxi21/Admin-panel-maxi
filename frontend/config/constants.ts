/**
 * Application Constants
 * Centralized configuration for contact information and other app-wide constants
 */

export const CONTACT_INFO = {
  phone: {
    primary: '0550363036',
    secondary: '0555507732',
    whatsapp: '213550363036',
    display: {
      primary: '0550 36 30 36',
      secondary: '0555 50 77 32',
    },
  },
  email: {
    primary: 'contact@solutionmaxi.com',
    support: 'support@solutionmaxi.com',
  },
  address: {
    street: '16 Bouchbouk',
    city: 'Dely Ibrahim',
    country: 'Algeria',
    full: '16 Bouchbouk, Dely Ibrahim, Algeria',
  },
} as const;

export const COMPANY_INFO = {
  name: 'Solution Maxi',
  foundedYear: 2006,
  tagline: 'Votre Partenaire Technologique de Confiance',
  description: 'Solutions informatiques et technologiques pour entreprises en Algérie',
} as const;

export const BUSINESS_HOURS = {
  weekdays: 'Dimanche - Jeudi: 9h00 - 17h00',
  weekend: 'Samedi: 9h00 - 13h00',
  closed: 'Vendredi: Fermé',
} as const;
