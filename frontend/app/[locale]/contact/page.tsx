"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, MapPin, Phone, Clock, Send } from "lucide-react"
import { toast } from "sonner"
import { CONTACT_INFO, BUSINESS_HOURS } from "@/config/constants"
import { useLanguage } from "@/lib/language-context"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const { language } = useLanguage()

  const localT = {
    fr: {
      title: "Contactez-nous",
      intro: "Vous avez une question ou besoin d'assistance? Nous sommes là pour vous aider! Contactez-nous par l'un des moyens suivants.",
      form: {
        title: "Envoyez-nous un Message",
        subtitle: "Remplissez le formulaire et nous répondrons dans les 24 heures",
        name: "Nom",
        email: "Email",
        subject: "Sujet",
        message: "Message",
        submit: "Envoyer le Message",
        submitting: "Envoi...",
        success: "Message envoyé avec succès! Nous vous répondrons bientôt.",
        error: "Échec de l'envoi du message. Veuillez réessayer."
      },
      info: {
        location: "Notre Emplacement",
        phone: "Téléphone",
        available: "Disponible pendant les heures d'ouverture",
        email: "Email",
        response: "Nous répondons dans les 24 heures",
        hours: "Heures d'Ouverture"
      }
    },
    ar: {
      title: "اتصل بنا",
      intro: "هل لديك سؤال أو تحتاج إلى مساعدة؟ نحن هنا للمساعدة! تواصل معنا عبر إحدى الطرق التالية.",
      form: {
        title: "أرسل لنا رسالة",
        subtitle: "املأ النموذج وسنرد عليك خلال 24 ساعة",
        name: "الاسم",
        email: "البريد الإلكتروني",
        subject: "الموضوع",
        message: "الرسالة",
        submit: "إرسال الرسالة",
        submitting: "جاري الإرسال...",
        success: "تم إرسال الرسالة بنجاح! سنرد عليك قريباً.",
        error: "فشل إرسال الرسالة. يرجى المحاولة مرة أخرى."
      },
      info: {
        location: "موقعنا",
        phone: "الهاتف",
        available: "متاح خلال ساعات العمل",
        email: "البريد الإلكتروني",
        response: "نرد خلال 24 ساعة",
        hours: "ساعات العمل"
      }
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success(txt.form.success)
        setFormData({ name: "", email: "", subject: "", message: "" })
      } else {
        const data = await response.json().catch(() => ({}))
        toast.error(data.error || txt.form.error)
      }
    } catch {
      toast.error(txt.form.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-4xl font-bold mb-6">{txt.title}</h1>
            <p className="text-lg text-muted-foreground mb-12">
              {txt.intro}
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Contact Form */}
              <Card>
                <CardHeader>
                  <CardTitle>{txt.form.title}</CardTitle>
                  <CardDescription>{txt.form.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{txt.form.name}</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{txt.form.email}</Label>
                      <Input
                        id="email"
                        type="email"
                        style={{ direction: 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">{txt.form.subject}</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">{txt.form.message}</Label>
                      <Textarea
                        id="message"
                        rows={5}
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      <Send className={`h-4 w-4 ${language === 'ar' ? 'ml-2 rotate-180' : 'mr-2'}`} />
                      {isSubmitting ? txt.form.submitting : txt.form.submit}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      {txt.info.location}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {CONTACT_INFO.address.street}<br />
                      {CONTACT_INFO.address.city}, {CONTACT_INFO.address.country}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      {txt.info.phone}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-muted-foreground" style={{ direction: 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }}>
                        <a href={`tel:${CONTACT_INFO.phone.primary}`} dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }} className="hover:text-primary">{CONTACT_INFO.phone.display.primary}</a><br />
                        <a href={`tel:${CONTACT_INFO.phone.secondary}`} dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }} className="hover:text-primary">{CONTACT_INFO.phone.display.secondary}</a>
                      </p>
                      <span className="text-sm text-muted-foreground">{txt.info.available}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      {txt.info.email}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        <a href={`mailto:${CONTACT_INFO.email.primary}`} className="hover:text-primary">{CONTACT_INFO.email.primary}</a><br />
                        <a href={`mailto:${CONTACT_INFO.email.support}`} className="hover:text-primary">{CONTACT_INFO.email.support}</a>
                      </p>
                      <span className="text-sm text-muted-foreground">{txt.info.response}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      {txt.info.hours}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-muted-foreground">
                      <p>{BUSINESS_HOURS.weekdays}</p>
                      <p>{BUSINESS_HOURS.weekend}</p>
                      <p>{BUSINESS_HOURS.closed}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
