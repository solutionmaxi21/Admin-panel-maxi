"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { reviewsApi, type CreateReviewRequest, type UpdateReviewRequest, type ReviewEligibility } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Star, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/lib/language-context"

interface ReviewFormProps {
  productId: number
  onReviewSubmitted: () => void
  autoOpen?: boolean
}

export function ReviewForm({ productId, onReviewSubmitted, autoOpen = false }: ReviewFormProps) {
  const { user } = useAuth()
  const { t, language } = useLanguage()
  const [isOpen, setIsOpen] = useState(autoOpen)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(false)
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [reviewText, setReviewText] = useState("")
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; description: string } | null>(null)

  const localT = {
    fr: {
      stars: "étoiles",
      star: "étoile",
      minChars: "Minimum 10 caractères"
    },
    ar: {
      stars: "نجوم",
      star: "نجمة",
      minChars: "10 أحرف على الأقل"
    }
  }
  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  // Check eligibility when component mounts or user changes
  useEffect(() => {
    if (user) {
      checkEligibility()
    }
  }, [user, productId])

  const checkEligibility = async () => {
    setIsLoadingEligibility(true)
    try {
      const result = await reviewsApi.checkEligibility(productId)
      if (result.data) {
        setEligibility(result.data)

        // If user has existing review, pre-fill for edit mode
        if (result.data.existingReview) {
          setRating(result.data.existingReview.rating)
          setReviewText(result.data.existingReview.review_text)
        }
      } else if (result.error) {
        console.error('Failed to check eligibility:', result.error)
      }
    } catch (error) {
      console.error('Error checking eligibility:', error)
    } finally {
      setIsLoadingEligibility(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.loginRequired.title,
        description: t.reviewForm.loginReq
      })
      return
    }

    if (rating === 0) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.reviewError.title,
        description: t.reviewForm.selectRating
      })
      return
    }

    if (reviewText.trim().length < 10) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.reviewError.title,
        description: t.reviewForm.minChars
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (isEditMode && eligibility?.existingReview) {
        // Update existing review
        const updateData: UpdateReviewRequest = {
          rating,
          comment: reviewText.trim(),
        }

        const result = await reviewsApi.update(eligibility.existingReview.review_id, updateData)

        if (result.data) {
          toast.success(t.reviewForm.success)
          setIsOpen(false)
          setIsEditMode(false)
          await checkEligibility()
          onReviewSubmitted()
        } else if (result.error) {
          setErrorDialog({
            open: true,
            title: t.alertDialogs.reviewError.title,
            description: result.error,
          })
        }
      } else {
        // Create new review
        const reviewData: CreateReviewRequest = {
          productId,
          rating,
          comment: reviewText.trim(),
        }

        const result = await reviewsApi.create(reviewData)

        if (result.data) {
          toast.success(t.reviewForm.success)
          setIsOpen(false)
          setRating(0)
          setReviewText("")
          await checkEligibility()
          onReviewSubmitted()
        } else if (result.error) {
          setErrorDialog({
            open: true,
            title: t.alertDialogs.reviewError.title,
            description: result.error,
          })
        }
      }
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.reviewError.title,
        description: error.message || t.reviewForm.error,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditClick = () => {
    if (eligibility?.existingReview) {
      setRating(eligibility.existingReview.rating)
      setReviewText(eligibility.existingReview.review_text)
      setIsEditMode(true)
      setIsOpen(true)
    }
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">
            {t.reviewForm.loginReq}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isLoadingEligibility) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">
            {t.reviewForm.checking}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!eligibility) {
    return null
  }

  // User has already reviewed - show status
  if (eligibility.existingReview) {
    const review = eligibility.existingReview
    const isPending = review.status === 'pending'
    const isRejected = review.status === 'rejected'
    const isApproved = review.status === 'approved'

    return (
      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t.productPage.tabs.reviews}</h3>
                {isPending && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {t.reviewForm.pending}
                  </Badge>
                )}
                {isApproved && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t.reviewForm.approved}
                  </Badge>
                )}
                {isRejected && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {t.reviewForm.rejected}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1" style={{ direction: 'ltr' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${star <= review.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-muted text-muted"
                      }`}
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">
                  {review.rating} {t.productPage.reviews.stars}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">{review.review_text}</p>

              {isRejected && review.rejection_reason && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>{t.reviewForm.rejectionReason}:</strong> {review.rejection_reason}
                  </AlertDescription>
                </Alert>
              )}

              {review.edit_count !== undefined && review.edit_count > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t.reviewForm.edited} {new Date(review.edited_at!).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-FR')}
                </p>
              )}
            </div>
          </div>

          {eligibility.canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditClick}
              className="w-full"
            >
              {t.reviewForm.edit}
            </Button>
          )}

          {!eligibility.canEdit && review.edit_count! > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              {t.reviewForm.usedEdit}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // Not eligible to review
  if (!eligibility.eligible) {
    let message = ""
    let icon = null

    switch (eligibility.reason) {
      case 'not_purchased':
        message = t.reviewForm.reasons.notPurchased
        icon = <AlertCircle className="h-5 w-5 text-muted-foreground" />
        break
      case 'no_delivered_orders':
        message = t.reviewForm.reasons.noDelivered
        icon = <Clock className="h-5 w-5 text-muted-foreground" />
        break
      case 'time_expired':
        message = t.reviewForm.reasons.expired
        icon = <XCircle className="h-5 w-5 text-muted-foreground" />
        break
      default:
        message = t.reviewForm.reasons.default
        icon = <AlertCircle className="h-5 w-5 text-muted-foreground" />
    }

    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3 justify-center text-center">
            {icon}
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Eligible to write review
  return (
    <div className="space-y-2">
      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) setIsEditMode(false)
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="lg" className="w-full">
            {t.reviewForm.title}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? t.reviewForm.edit : t.reviewForm.title}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? t.reviewForm.update
                : t.reviewForm.placeholder}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t.reviewForm.rating} *</Label>
              <div className="flex items-center gap-2" style={{ direction: 'ltr', justifyContent: language === 'ar' ? 'flex-end' : 'flex-start' }}>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="focus:outline-none transition-transform hover:scale-110"
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => setRating(star)}
                    >
                      <Star
                        className={`h-8 w-8 ${star <= (hoveredRating || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "fill-muted text-muted"
                          }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <span className="ml-2 text-sm font-medium">
                    {rating} {rating === 1 ? txt.star : txt.stars}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reviewText">{t.reviewForm.comment} *</Label>
              <Textarea
                id="reviewText"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={t.reviewForm.placeholder}
                className="min-h-[150px]"
                required
              />
              <p className="text-xs text-muted-foreground">
                {txt.minChars} ({reviewText.length}/10)
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsOpen(false)
                  setIsEditMode(false)
                }}
                disabled={isSubmitting}
              >
                {t.reviewForm.cancel}
              </Button>
              <Button type="submit" disabled={isSubmitting || rating === 0}>
                {isSubmitting ? t.reviewForm.submitting : (isEditMode ? t.reviewForm.update : t.reviewForm.submit)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {errorDialog && (
        <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog(open ? errorDialog : null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{errorDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{errorDialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setErrorDialog(null)}>
                {t.alertDialogs.common.ok}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {eligibility.daysRemaining > 0 && (
        <p className="text-xs text-center text-muted-foreground">
          <Clock className={`h-3 w-3 inline ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
          {eligibility.daysRemaining} {t.reviewForm.daysLeft}
        </p>
      )}
    </div>
  )
}
