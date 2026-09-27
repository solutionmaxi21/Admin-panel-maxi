/**
 * Social Media Links Configuration
 * Centralized social media URLs for consistent usage across the application
 */

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
  ariaLabel: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: 'Facebook',
    url: 'https://www.facebook.com/SolutionMaxiAlgerie/',
    icon: 'facebook',
    ariaLabel: 'Suivez-nous sur Facebook',
  },
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/company/solution-maxi',
    icon: 'linkedin',
    ariaLabel: 'Connectez-vous avec nous sur LinkedIn',
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/solutionmaxi',
    icon: 'instagram',
    ariaLabel: 'Suivez-nous sur Instagram',
  },
  {
    name: 'WhatsApp',
    url: `https://wa.me/213550363036`,
    icon: 'whatsapp',
    ariaLabel: 'Contactez-nous sur WhatsApp',
  },
] as const;

export const getSocialLink = (name: string): SocialLink | undefined => {
  return SOCIAL_LINKS.find((link) => link.name === name);
};

export const getWhatsAppLink = (message?: string): string => {
  const baseUrl = `https://wa.me/213550363036`;
  if (message) {
    return `${baseUrl}?text=${encodeURIComponent(message)}`;
  }
  return baseUrl;
};
