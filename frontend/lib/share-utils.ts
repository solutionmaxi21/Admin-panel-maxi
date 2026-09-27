// lib/share-utils.ts

interface ShareProductParams {
  productName: string
  productId: number
  price?: number
  imageUrl?: string
}

/**
 * Share product using Web Share API with fallback to clipboard
 */
export async function shareProduct({ 
  productName, 
  productId, 
  price, 
  imageUrl 
}: ShareProductParams): Promise<{ success: boolean; message: string }> {
  // Generate the product URL with locale
  const locale = typeof window !== 'undefined' 
    ? (document.documentElement.lang || 'fr') 
    : 'fr'
  const productUrl = `${window.location.origin}/${locale}/product/${productId}`
  
  // Create share text
  const shareText = price 
    ? `Check out ${productName} for ${price}!`
    : `Check out ${productName}!`

  // Check if Web Share API is supported
  if (navigator.share) {
    try {
      await navigator.share({
        title: productName,
        text: shareText,
        url: productUrl,
      })
      return { success: true, message: 'Product shared successfully!' }
    } catch (error: any) {
      // User cancelled the share or error occurred
      if (error.name === 'AbortError') {
        return { success: false, message: 'Share cancelled' }
      }
      console.error('Error sharing:', error)
      // Fall through to clipboard fallback
    }
  }

  // Fallback: Copy to clipboard
  try {
    await navigator.clipboard.writeText(productUrl)
    return { success: true, message: 'Link copied to clipboard!' }
  } catch (error) {
    console.error('Error copying to clipboard:', error)
    return { success: false, message: 'Failed to share product' }
  }
}

/**
 * Share to specific platform
 */
export function shareToSocial(
  platform: 'facebook' | 'twitter' | 'whatsapp' | 'linkedin',
  { productName, productId, imageUrl }: ShareProductParams
): void {
  const locale = typeof window !== 'undefined' 
    ? (document.documentElement.lang || 'fr') 
    : 'fr'
  const productUrl = encodeURIComponent(`${window.location.origin}/${locale}/product/${productId}`)
  const text = encodeURIComponent(productName)
  
  const urls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${productUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${productUrl}`,
    whatsapp: `https://wa.me/?text=${text}%20${productUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${productUrl}`,
  }

  window.open(urls[platform], '_blank', 'width=600,height=400')
}