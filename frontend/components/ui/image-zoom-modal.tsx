// components/image-zoom-modal.tsx
"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { ZoomIn, X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getImageUrl } from "@/lib/utils"

interface ImageZoomModalProps {
  images: Array<{ image_url: string }>
  selectedIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  productName: string
}

export function ImageZoomModal({ 
  images, 
  selectedIndex, 
  onClose, 
  onNavigate,
  productName 
}: ImageZoomModalProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        onNavigate(selectedIndex - 1)
        resetZoom()
      }
      if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        onNavigate(selectedIndex + 1)
        resetZoom()
      }
    }
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedIndex, images.length, onClose, onNavigate])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.max(1, Math.min(4, prev + delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const resetZoom = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        onClick={onClose}
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:text-white hover:bg-white/10 z-10 h-12 w-12"
      >
        <X className="h-8 w-8" />
      </Button>

      {/* Navigation buttons */}
      {selectedIndex > 0 && (
        <Button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(selectedIndex - 1)
            resetZoom()
          }}
          variant="ghost"
          size="icon"
          className="absolute left-4 text-white hover:text-white hover:bg-white/10 z-10 h-12 w-12"
        >
          <ChevronLeft className="h-10 w-10" />
        </Button>
      )}
      
      {selectedIndex < images.length - 1 && (
        <Button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(selectedIndex + 1)
            resetZoom()
          }}
          variant="ghost"
          size="icon"
          className="absolute right-4 text-white hover:text-white hover:bg-white/10 z-10 h-12 w-12"
        >
          <ChevronRight className="h-10 w-10" />
        </Button>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/70 backdrop-blur-sm rounded-lg p-2 z-10">
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setScale(prev => Math.max(1, prev - 0.25))
          }}
          variant="ghost"
          size="sm"
          className="text-white hover:text-white hover:bg-white/10 px-3"
        >
          -
        </Button>
        <span className="text-white px-2 flex items-center text-sm font-medium">
          {Math.round(scale * 100)}%
        </span>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setScale(prev => Math.min(4, prev + 0.25))
          }}
          variant="ghost"
          size="sm"
          className="text-white hover:text-white hover:bg-white/10 px-3"
        >
          +
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            resetZoom()
          }}
          variant="ghost"
          size="sm"
          className="text-white hover:text-white hover:bg-white/10 px-3 border-l border-white/30 rounded-l-none"
        >
          Reset
        </Button>
      </div>

      {/* Image counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-medium">
        {selectedIndex + 1} / {images.length}
      </div>

      {/* Image */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          className="relative max-w-5xl max-h-[90vh] w-full h-full"
        >
          <Image
            src={getImageUrl(images[selectedIndex]?.image_url || '/placeholder.svg')}
            alt={`${productName} - Image ${selectedIndex + 1}`}
            fill
            className="object-contain select-none"
            draggable={false}
            priority
          />
        </div>
      </div>

      {/* Hint text */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg">
        {scale === 1 ? 'Scroll to zoom • Click and drag when zoomed' : 'Click and drag to pan'}
      </div>
    </div>
  )
}

// Helper component for the main image with zoom indicator
interface ZoomableImageProps {
  src: string
  alt: string
  onClick: () => void
  children?: React.ReactNode
}

export function ZoomableImage({ src, alt, onClick, children }: ZoomableImageProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div 
      className="aspect-square relative bg-muted rounded-xl overflow-hidden group cursor-zoom-in"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain p-8 transition-transform duration-300 group-hover:scale-105"
      />
      {children}
      {/* Zoom indicator */}
      <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all flex items-center justify-center ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-white/90 rounded-full p-3 shadow-lg transform transition-transform group-hover:scale-110">
          <ZoomIn className="h-6 w-6 text-gray-700" />
        </div>
      </div>
    </div>
  )
}