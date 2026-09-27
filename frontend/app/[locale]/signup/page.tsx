"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Phone, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

export default function SignupPage() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "" })

  const { register, googleLogin } = useAuth()
  const { t, language } = useLanguage()
  const router = useRouter()

  const localT = {
    fr: {
      createAccount: "Créer un Compte",
      subtitle: "Rejoignez Solution Maxi aujourd'hui",
      pwdMismatch: "Les mots de passe ne correspondent pas",
      pwdLength: "Le mot de passe doit contenir 8+ caractères, majuscule, minuscule et chiffre",
      phoneReq: "Numéro de téléphone invalide (ex: 05 50 12 34 56)",
      acceptTerms: "Veuillez accepter les conditions d'utilisation",
      success: "Vérifiez votre email",
      successDesc: "Nous avons envoyé un lien de confirmation. Veuillez cliquer dessus pour activer votre compte.",
      failure: "Échec de l'inscription",
      creating: "Création...",
      createBtn: "Créer un Compte",
      firstNamePlaceholder: "nom",
      lastNamePlaceholder: "prénom",
      phonePlaceholder: "05 50 12 34 56",
      emailPlaceholder: "nom@exemple.com",
      pwdPlaceholder: "Créer un mot de passe",
      confirmPlaceholder: "Confirmez votre mot de passe",
      termsText: "J'accepte les",
      termsLink: "Conditions d'Utilisation",
      and: "et la",
      privacyLink: "Politique de Confidentialité",
      alreadyHaveAccount: "Vous avez déjà un compte ?",
      loginLink: "Se connecter",
      or: "Ou s'inscrire avec",
      googleBtn: "Continuer avec Google",
      googleError: "L'inscription Google a échoué",
      errors: {
        emailExists: "Cette adresse email est déjà utilisée. Essayez de vous connecter.",
        weakPassword: "Le mot de passe est trop simple. Il faut 8 caractères, 1 majuscule, 1 chiffre.",
        invalidEmail: "L'adresse email semble invalide.",
        generic: "Une erreur est survenue lors de l'inscription. Veuillez vérifier vos informations."
      }
    },
    ar: {
      createAccount: "إنشاء حساب",
      subtitle: "انضم إلى Solution Maxi اليوم",
      pwdMismatch: "كلمات المرور غير متطابقة",
      pwdLength: "يجب أن تحتوي كلمة المرور على 8 أحرف وأرقام وحروف كبيرة وصغيرة",
      phoneReq: "رقم الهاتف غير صالح (مثال: 0550123456)",
      acceptTerms: "يرجى الموافقة على شروط الاستخدام",
      success: "تحقق من بريدك الإلكتروني",
      successDesc: "لقد أرسلنا رابط التأكيد. يرجى النقر عليه لتفعيل حسابك.",
      failure: "فشل التسجيل",
      creating: "جاري الإنشاء...",
      createBtn: "إنشاء حساب",
      firstNamePlaceholder: "الاسم",
      lastNamePlaceholder: "اللقب",
      phonePlaceholder: "05 50 12 34 56",
      emailPlaceholder: "nom@exemple.com",
      pwdPlaceholder: "إنشاء كلمة مرور",
      confirmPlaceholder: "تأكيد كلمة المرور",
      termsText: "أوافق على",
      termsLink: "شروط الاستخدام",
      and: "و",
      privacyLink: "سياسة الخصوصية",
      alreadyHaveAccount: "لديك حساب بالفعل؟",
      loginLink: "تسجيل الدخول",
      or: "أو سجل باستخدام",
      googleBtn: "تابع مع Google",
      googleError: "فشل التسجيل عبر Google",
      errors: {
        emailExists: "هذا البريد الإلكتروني مستخدم بالفعل. حاول تسجيل الدخول.",
        weakPassword: "كلمة المرور ضعيفة جداً. يجب أن تكون 8 أحرف على الأقل مع أرقام وحروف.",
        invalidEmail: "البريد الإلكتروني يبدو غير صالح.",
        generic: "حدث خطأ أثناء التسجيل. يرجى التحقق من معلوماتك."
      }
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  const getFriendlyErrorMessage = (errorMsg: string) => {
    const lowerError = errorMsg.toLowerCase();

    if (lowerError.includes("email") && (lowerError.includes("exist") || lowerError.includes("register"))) {
      return txt.errors.emailExists;
    }
    if (lowerError.includes("password") || lowerError.includes("weak")) {
      return txt.errors.weakPassword;
    }
    if (lowerError.includes("email") && lowerError.includes("invalid")) {
      return txt.errors.invalidEmail;
    }
    if (lowerError.includes("validation")) {
      return txt.errors.generic;
    }

    return errorMsg || txt.errors.generic;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setErrorDialog({ open: true, title: txt.failure, message: txt.pwdMismatch })
      return
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      setErrorDialog({ open: true, title: txt.failure, message: txt.pwdLength })
      return
    }

    const phoneRegex = /^(05|06|07)[0-9]{8}$/;
    const cleanPhone = phone.replace(/\s/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      setErrorDialog({ open: true, title: txt.failure, message: txt.phoneReq })
      return
    }

    if (!agreeTerms) {
      setErrorDialog({ open: true, title: txt.failure, message: txt.acceptTerms })
      return
    }

    setLoading(true)

    const result = await register(email, password, firstName, lastName, cleanPhone)

    if (result.success) {
      setSuccess(true)
      toast.success(txt.success)
    } else {
      const friendlyMsg = getFriendlyErrorMessage(result.error || "");
      setErrorDialog({ open: true, title: txt.failure, message: friendlyMsg })
    }
    setLoading(false)
  }

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse: TokenResponse) => {
      setLoading(true);
      try {
        const result = await googleLogin(tokenResponse.access_token);
        if (result.success) {
          toast.success("Bienvenue!");
          router.push(`/${language}`);
          router.refresh();
        } else {
          setErrorDialog({ open: true, title: txt.failure, message: result.error || txt.googleError });
        }
      } catch (err) {
        setErrorDialog({ open: true, title: txt.failure, message: txt.googleError });
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setErrorDialog({ open: true, title: txt.failure, message: txt.googleError });
    }
  });

  const inputIconClass = `absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${language === 'ar' ? 'right-3' : 'left-3'}`
  const inputClass = language === 'ar' ? 'pr-10' : 'pl-10'

  // SUCCESS STATE
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <Header />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md">
            <div className="bg-card rounded-3xl border border-border/50 p-10 shadow-2xl shadow-primary/5 text-center backdrop-blur-sm">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                <Mail className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-3">{txt.success}</h2>
              <p className="text-muted-foreground mb-2 leading-relaxed">
                {txt.successDesc}
              </p>
              <p className="font-semibold text-lg text-foreground mb-8">{email}</p>
              <Button asChild variant="outline" className="w-full h-12 text-base font-medium hover:bg-accent hover:border-primary/20 transition-all duration-200">
                <Link href="/login">{txt.loginLink}</Link>
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-lg">
          <div className="bg-card rounded-3xl border border-border/50 p-8 md:p-10 shadow-2xl shadow-primary/5 backdrop-blur-sm">

            <div className="text-center mb-10">
              <div className="flex items-center justify-center mx-auto mb-5">
                <Image
                  src="/logo.jpg"
                  alt="Solution Maxi Logo"
                  width={140}
                  height={45}
                  className="h-12 w-auto object-contain"
                  priority
                />
              </div>
              <h1 className="text-3xl font-bold mb-2">{txt.createAccount}</h1>
              <p className="text-muted-foreground">{txt.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm font-medium">{t.auth.firstName}</Label>
                  <div className="relative">
                    <User className={inputIconClass} />
                    <Input
                      id="firstName"
                      placeholder={txt.firstNamePlaceholder}
                      className={`${inputClass} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm font-medium">{t.auth.lastName}</Label>
                  <Input
                    id="lastName"
                    placeholder={txt.lastNamePlaceholder}
                    className="h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">{t.auth.phone || "Téléphone"}</Label>
                <div className="relative">
                  <Phone className={inputIconClass} />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={txt.phonePlaceholder}
                    className={`${inputClass} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">{t.auth.email}</Label>
                <div className="relative">
                  <Mail className={inputIconClass} />
                  <Input
                    id="email"
                    type="email"
                    placeholder={txt.emailPlaceholder}
                    className={`${inputClass} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">{t.auth.password}</Label>
                <div className="relative">
                  <Lock className={inputIconClass} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={txt.pwdPlaceholder}
                    className={`${language === 'ar' ? 'pr-10 pl-10' : 'pl-10 pr-10'} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors ${language === 'ar' ? 'left-3' : 'right-3'}`}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 px-1">
                  8+ caractères, 1 Majuscule, 1 Chiffre
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">{t.auth.confirmPassword}</Label>
                <div className="relative">
                  <Lock className={inputIconClass} />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder={txt.confirmPlaceholder}
                    className={`${inputClass} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="terms"
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                  className="mt-1"
                />
                <Label htmlFor="terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                  {txt.termsText}{" "}
                  <Link href="/terms" className="text-primary hover:underline font-medium transition-colors">
                    {txt.termsLink}
                  </Link>{" "}
                  {txt.and}{" "}
                  <Link href="/privacy" className="text-primary hover:underline font-medium transition-colors">
                    {txt.privacyLink}
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 font-medium text-base shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30"
                disabled={loading}
              >
                {loading ? txt.creating : txt.createBtn}
                <ArrowRight className={`h-5 w-5 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
              </Button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground font-medium">
                  {txt.or}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full h-12 font-medium text-base bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700 transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => handleGoogleLogin()}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {txt.googleBtn}
            </Button>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                {txt.alreadyHaveAccount}{" "}
                <Link href="/login" className="text-primary font-semibold hover:underline transition-colors">
                  {txt.loginLink}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 text-red-600 mb-2">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="text-xl">{errorDialog.title || txt.failure}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base font-medium text-foreground/80 pl-13">
              {errorDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="h-11 px-6 font-medium">{t.alertDialogs.common.ok}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}